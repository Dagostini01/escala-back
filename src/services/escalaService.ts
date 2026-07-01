import { getPool, sql } from "../db";
import { randomUUID } from "crypto";

export async function criarConviteManual(idOrdemServico: number, idFuncionario: number): Promise<void> {
  const pool = await getPool();
  
  // Busca dados da OS para preencher os campos do convite
  const osResult = await pool.request()
    .input("id_ordemservico", sql.Int, idOrdemServico)
    .query(`
      SELECT id_filial, id_cliente_filial, id_cliente, hora_chegada
      FROM dbo.ESCALA_ordemservico
      WHERE id_ordemservico = @id_ordemservico
    `);
  
  const os = osResult.recordset[0];
  if (!os) throw new Error("ORDEM_SERVICO_NAO_ENCONTRADA");

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // Verifica se já existe um convite ou escala ativa para este colaborador nesta OS
    const checkResult = await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .input("id_funcionario", sql.Int, idFuncionario)
      .query(`
        SELECT 1 FROM dbo.ESCALA_ordemservico_funcionarios_convites
        WHERE id_funcionario = @id_funcionario AND id_ordemservico = @id_ordemservico AND convite_recusado = 0
        UNION
        SELECT 1 FROM dbo.ESCALA_ordemservico_funcionarios
        WHERE id_funcionario = @id_funcionario AND id_ordemservico = @id_ordemservico
      `);
    
    if (checkResult.recordset.length > 0) {
      throw new Error("VINCULO_JA_EXISTENTE");
    }

    const uuid = randomUUID();
    // Validade do convite manual: 6 horas a partir do envio ou até o início da OS (o que for menor)
    const validade = os.hora_chegada; 

    await new sql.Request(tx)
      .input("id_convite", sql.UniqueIdentifier, uuid)
      .input("id_funcionario", sql.Int, idFuncionario)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .input("id_filial", sql.Int, os.id_filial)
      .input("id_cliente_filial", sql.Int, os.id_cliente_filial)
      .input("id_cliente", sql.Int, os.id_cliente)
      .input("validade", sql.DateTime, validade)
      .query(`
        INSERT INTO dbo.ESCALA_ordemservico_funcionarios_convites (
          id_convite, id_funcionario, id_ordemservico, id_tipo_convite,
          datahora_convite, validade_convite, id_filial, id_cliente_filial, id_cliente,
          convite_visualizado, convite_aceito, convite_recusado
        ) VALUES (
          @id_convite, @id_funcionario, @id_ordemservico, 'Manual',
          SYSUTCDATETIME(), @validade, @id_filial, @id_cliente_filial, @id_cliente,
          0, 0, 0
        )
      `);

    // Incrementa convidados na OS
    await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .query(`
        UPDATE dbo.ESCALA_ordemservico
        SET qtde_pessoas_convidadas = qtde_pessoas_convidadas + 1
        WHERE id_ordemservico = @id_ordemservico
      `);

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function removerFuncionarioDaEscala(idOrdemServico: number, idFuncionario: number): Promise<void> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1. Verifica se já confirmou presença
    const checkConfirm = await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .input("id_funcionario", sql.Int, idFuncionario)
      .query(`
        SELECT func_confirmou 
        FROM dbo.ESCALA_ordemservico_funcionarios 
        WHERE id_ordemservico = @id_ordemservico AND id_funcionario = @id_funcionario
      `);
    
    if (checkConfirm.recordset.length > 0 && checkConfirm.recordset[0].func_confirmou === 1) {
      throw new Error("COLABORADOR_JA_CONFIRMOU_PRESENCA");
    }

    // 2. Remove da escala se estiver alocado (mas não confirmado, pois validamos acima)
    const deleteEscala = await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .input("id_funcionario", sql.Int, idFuncionario)
      .query(`
        DELETE FROM dbo.ESCALA_ordemservico_funcionarios
        OUTPUT deleted.id_escala_ordemservico_funcionarios
        WHERE id_ordemservico = @id_ordemservico AND id_funcionario = @id_funcionario
      `);

    const wasEscalado = deleteEscala.rowsAffected[0] > 0;

    // 3. Remove o convite completamente (seja recusado ou pendente)
    const deleteConvite = await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .input("id_funcionario", sql.Int, idFuncionario)
      .query(`
        DELETE FROM dbo.ESCALA_ordemservico_funcionarios_convites
        OUTPUT deleted.id_convite
        WHERE id_ordemservico = @id_ordemservico AND id_funcionario = @id_funcionario
      `);

    const wasConvidado = deleteConvite.rowsAffected[0] > 0;

    if (!wasEscalado && !wasConvidado) {
      throw new Error("VINCULO_NAO_ENCONTRADO");
    }

    // 4. Atualiza contadores na OS
    await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .input("dec_escalados", sql.Int, wasEscalado ? 1 : 0)
      .input("dec_convidados", sql.Int, wasConvidado ? 1 : 0)
      .query(`
        UPDATE dbo.ESCALA_ordemservico
        SET 
          qtde_pessoas_escaladas = CASE WHEN qtde_pessoas_escaladas >= @dec_escalados THEN qtde_pessoas_escaladas - @dec_escalados ELSE 0 END,
          qtde_pessoas_convidadas = CASE WHEN qtde_pessoas_convidadas >= @dec_convidados THEN qtde_pessoas_convidadas - @dec_convidados ELSE 0 END
        WHERE id_ordemservico = @id_ordemservico
      `);

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export interface SorteioParams {
  ids_ordemservico: number[];
  min_classificacao: string;
  max_distancia?: number;
  min_presenca?: number;
  max_atraso?: number;
  min_resposta?: number;
  min_aceite?: number;
}

export async function iniciarSorteioLote(params: SorteioParams): Promise<Record<number, { convidados: number; erro?: string }>> {
  const pool = await getPool();
  const results: Record<number, { convidados: number; erro?: string }> = {};

  const minPres = params.min_presenca ? params.min_presenca / 100 : 0.0;
  const minResp = params.min_resposta ? params.min_resposta / 100 : 0.0;

  for (const idOrdemServico of params.ids_ordemservico) {
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      // 1. Busca dados da OS
      const osResult = await new sql.Request(tx)
        .input("id_ordemservico", sql.Int, idOrdemServico)
        .query(`
          SELECT id_filial, id_cliente, id_cliente_filial, hora_chegada, qtde_inventariantes, qtde_pessoas_escaladas
          FROM dbo.ESCALA_ordemservico
          WHERE id_ordemservico = @id_ordemservico
        `);
      
      const os = osResult.recordset[0];
      if (!os) {
        results[idOrdemServico] = { convidados: 0, erro: "OS não encontrada" };
        await tx.rollback();
        continue;
      }

      // 2. Define status Sorteio na OS
      await new sql.Request(tx)
        .input("id_ordemservico", sql.Int, idOrdemServico)
        .query(`
          UPDATE dbo.ESCALA_ordemservico
          SET 
            tipo_completamento_ultimo = 'Sorteio',
            verificar_OS = 1,
            houve_alteracao = 1,
            datahora_alteracao = SYSUTCDATETIME()
          WHERE id_ordemservico = @id_ordemservico
        `);

      // 3. Busca freelancers elegíveis
      const queryCandidates = `
        SELECT f.ID_FUNCIONARIO
        FROM dbo.t2_funcionarios f
        INNER JOIN (
          SELECT 
            id_funcionario,
            id_filial,
            ROW_NUMBER() OVER (PARTITION BY id_funcionario ORDER BY id_funcionario) AS rn
          FROM dbo.t3_funcionarios_filiais
          WHERE id_filial = @id_filial
        ) ff ON ff.id_funcionario = f.ID_FUNCIONARIO AND ff.rn = 1
        LEFT JOIN dbo.ESCALA_ordemservico_funcionarios_convites c 
          ON c.id_funcionario = f.ID_FUNCIONARIO AND c.id_ordemservico = @id_ordemservico AND c.convite_recusado = 0
        LEFT JOIN dbo.ESCALA_ordemservico_funcionarios esc
          ON esc.id_funcionario = f.ID_FUNCIONARIO AND esc.id_ordemservico = @id_ordemservico
        WHERE f.ID_CARGO = 13 -- Inventariante
          AND ISNULL(f.INATIVO, 'N') = 'N'
          AND (f.bloqueado_ate IS NULL OR f.bloqueado_ate < SYSUTCDATETIME())
          AND c.id_convite IS NULL
          AND esc.id_escala_ordemservico_funcionarios IS NULL
          AND COALESCE(TRY_CONVERT(float, f.frequencia_real), 1.0) >= @min_presenca
          AND COALESCE(TRY_CONVERT(float, f.taxa_resposta), 1.0) >= @min_resposta
      `;

      const candidatesResult = await new sql.Request(tx)
        .input("id_ordemservico", sql.Int, idOrdemServico)
        .input("id_filial", sql.Int, os.id_filial)
        .input("min_presenca", sql.Float, minPres)
        .input("min_resposta", sql.Float, minResp)
        .query<{ ID_FUNCIONARIO: number }>(queryCandidates);

      const candidates = candidatesResult.recordset;

      // 4. Insere convites de sorteio
      let convCount = 0;
      for (const cand of candidates) {
        const uuid = randomUUID();
        await new sql.Request(tx)
          .input("id_convite", sql.UniqueIdentifier, uuid)
          .input("id_funcionario", sql.Int, cand.ID_FUNCIONARIO)
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .input("id_filial", sql.Int, os.id_filial)
          .input("id_cliente_filial", sql.Int, os.id_cliente_filial)
          .input("id_cliente", sql.Int, os.id_cliente)
          .input("validade", sql.DateTime, os.hora_chegada)
          .query(`
            INSERT INTO dbo.ESCALA_ordemservico_funcionarios_convites (
              id_convite, id_funcionario, id_ordemservico, id_tipo_convite,
              datahora_convite, validade_convite, id_filial, id_cliente_filial, id_cliente,
              convite_visualizado, convite_aceito, convite_recusado
            ) VALUES (
              @id_convite, @id_funcionario, @id_ordemservico, 'Sorteio',
              SYSUTCDATETIME(), @validade, @id_filial, @id_cliente_filial, @id_cliente,
              0, 0, 0
            )
          `);
        convCount++;
      }

      // Incrementa contagem de convidados
      await new sql.Request(tx)
        .input("id_ordemservico", sql.Int, idOrdemServico)
        .input("inc_count", sql.Int, convCount)
        .query(`
          UPDATE dbo.ESCALA_ordemservico
          SET qtde_pessoas_convidadas = qtde_pessoas_convidadas + @inc_count
          WHERE id_ordemservico = @id_ordemservico
        `);

      await tx.commit();
      results[idOrdemServico] = { convidados: convCount };

    } catch (err) {
      await tx.rollback();
      results[idOrdemServico] = { convidados: 0, erro: (err as Error).message };
    }
  }

  return results;
}

export async function obterEquipeCoordenadorPorOS(idOrdemServico: number) {
  const pool = await getPool();

  // 1. Busca id do coordenador da OS
  const coordResult = await pool.request()
    .input("id_ordemservico", sql.Int, idOrdemServico)
    .query(`
      SELECT a.coordenador AS coordenador_id
      FROM dbo.t2_ordemservico a
      WHERE a.id_ordemservico = @id_ordemservico
    `);

  const coordId = coordResult.recordset[0]?.coordenador_id;
  if (!coordId) {
    return { temEquipe: false, membros: [] };
  }

  // 2. Busca equipe vinculada ao coordenador
  const equipeResult = await pool.request()
    .input("coordenador_id", sql.Int, coordId)
    .query(`
      SELECT CAST(equipe_id AS NVARCHAR(36)) AS equipe_id
      FROM dbo.ESCALA_equipe
      WHERE coordenador_id = @coordenador_id
    `);

  const equipeId = equipeResult.recordset[0]?.equipe_id;
  if (!equipeId) {
    return { temEquipe: false, membros: [] };
  }

  // 3. Busca membros da equipe
  const membrosResult = await pool.request()
    .input("equipe_id", sql.VarChar(40), equipeId)
    .query<{ funcionario_id: number }>(`
      SELECT funcionario_id
      FROM dbo.ESCALA_equipe_pessoas
      WHERE equipe_id = TRY_CONVERT(uniqueidentifier, @equipe_id)
    `);

  return {
    temEquipe: true,
    equipe_id: equipeId,
    membros: membrosResult.recordset.map(m => m.funcionario_id)
  };
}

export async function salvarEquipeCoordenadorPorOS(idOrdemServico: number, membrosIds: number[]) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1. Busca id e nome do coordenador da OS
    const coordResult = await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .query(`
        SELECT 
          a.coordenador AS coordenador_id,
          COALESCE(f.NOME, 'Não definido') AS coordenador_nome
        FROM dbo.t2_ordemservico a
        LEFT JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = a.coordenador
        WHERE a.id_ordemservico = @id_ordemservico
      `);

    const coord = coordResult.recordset[0];
    if (!coord || !coord.coordenador_id) {
      throw new Error("Coordenador não encontrado para esta OS");
    }

    // 2. Verifica se a equipe já existe, ou cria uma nova
    let equipeId: string;
    const equipeExistente = await new sql.Request(tx)
      .input("coordenador_id", sql.Int, coord.coordenador_id)
      .query(`
        SELECT CAST(equipe_id AS NVARCHAR(36)) AS equipe_id
        FROM dbo.ESCALA_equipe
        WHERE coordenador_id = @coordenador_id
      `);

    if (equipeExistente.recordset[0]?.equipe_id) {
      equipeId = equipeExistente.recordset[0].equipe_id;
    } else {
      const uuid = randomUUID();
      await new sql.Request(tx)
        .input("equipe_id", sql.UniqueIdentifier, uuid)
        .input("coordenador_id", sql.Int, coord.coordenador_id)
        .input("coordenador_nome", sql.VarChar(500), coord.coordenador_nome)
        .query(`
          INSERT INTO dbo.ESCALA_equipe (equipe_id, coordenador_id, coordenador_nome, equipe_qtde_inventariantes)
          VALUES (@equipe_id, @coordenador_id, @coordenador_nome, 0)
        `);
      equipeId = uuid;
    }

    // 3. Limpa membros anteriores da equipe
    await new sql.Request(tx)
      .input("equipe_id", sql.VarChar(40), equipeId)
      .query(`
        DELETE FROM dbo.ESCALA_equipe_pessoas
        WHERE equipe_id = TRY_CONVERT(uniqueidentifier, @equipe_id)
      `);

    // 4. Insere novos membros
    let nextPessoaIdResult = await new sql.Request(tx).query(`
      SELECT ISNULL(MAX(equipe_pessoa_id), 0) AS max_id FROM dbo.ESCALA_equipe_pessoas
    `);
    let nextPessoaId = Number(nextPessoaIdResult.recordset[0].max_id) + 1;

    for (const fId of membrosIds) {
      await new sql.Request(tx)
        .input("equipe_pessoa_id", sql.Int, nextPessoaId++)
        .input("equipe_id", sql.VarChar(40), equipeId)
        .input("funcionario_id", sql.Int, fId)
        .query(`
          INSERT INTO dbo.ESCALA_equipe_pessoas (equipe_pessoa_id, equipe_id, funcionario_id)
          VALUES (@equipe_pessoa_id, TRY_CONVERT(uniqueidentifier, @equipe_id), @funcionario_id)
        `);
    }

    await tx.commit();
    return { success: true, equipe_id: equipeId };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

