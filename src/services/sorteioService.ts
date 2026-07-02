import { getPool, sql } from "../db";
import axios from "axios";

const gatewayUrl = process.env.VITE_GATEWAY_API_BASE_URL ?? "https://www.datasitesistemas.com.br/gateway/Api";

async function registrarPresencaNoSgs(idOrdemServico: number, idFuncionario: number) {
  try {
    console.info(`[SGS Integration] Enviando vinculo de colaborador ${idFuncionario} na OS ${idOrdemServico} ao SGS legado...`);
    const payload = {
      idOrdemServico,
      idFuncionario,
      confirmado: true
    };
    const response = await axios.post(`${gatewayUrl}/OrdemServicoFuncionario/Adicionar`, payload, {
      headers: { "Content-Type": "application/json" }
    });
    console.info(`[SGS Integration] Resposta do SGS:`, response.data);
    return response.data;
  } catch (err) {
    console.error(`[SGS Integration] Falha ao enviar vinculo ao SGS:`, (err as Error).message);
    // Não travamos o fluxo local se o SGS falhar temporariamente, para garantir resiliência
  }
}

export async function aceitarVagaSorteio(idOrdemServico: number, idFuncionario: number): Promise<void> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  
  // Usamos nível de isolamento SERIALIZABLE para garantir máxima consistência concorrente
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    // 1. Obtém e trava a linha da OS para verificar vagas
    const osResult = await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .query(`
        SELECT 
          qtde_inventariantes, 
          qtde_pessoas_escaladas,
          id_cliente,
          id_cliente_filial,
          id_filial
        FROM dbo.ESCALA_ordemservico WITH (UPDLOCK, ROWLOCK)
        WHERE id_ordemservico = @id_ordemservico
      `);

    const os = osResult.recordset[0];
    if (!os) {
      throw new Error("ORDEM_SERVICO_NAO_ENCONTRADA");
    }

    if (os.qtde_pessoas_escaladas >= os.qtde_inventariantes) {
      throw new Error("VAGAS_ESGOTADAS");
    }

    // 2. Verifica se o funcionário possui um convite pendente ativo
    const conviteResult = await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .input("id_funcionario", sql.Int, idFuncionario)
      .query(`
        SELECT TOP 1 
          CAST(id_convite AS NVARCHAR(36)) AS id_convite
        FROM dbo.ESCALA_ordemservico_funcionarios_convites
        WHERE id_funcionario = @id_funcionario
          AND id_ordemservico = @id_ordemservico
          AND convite_aceito = 0
          AND convite_recusado = 0
          AND validade_convite > SYSUTCDATETIME()
      `);

    const convite = conviteResult.recordset[0];
    if (!convite) {
      throw new Error("CONVITE_INEXISTENTE_OU_EXPIRADO");
    }

    const idConvite = convite.id_convite;

    // 3. Atualiza o convite para aceito
    await new sql.Request(tx)
      .input("id_convite", sql.UniqueIdentifier, idConvite)
      .query(`
        UPDATE dbo.ESCALA_ordemservico_funcionarios_convites
        SET 
          convite_aceito = 1,
          datahora_resposta_convite = SYSUTCDATETIME()
        WHERE id_convite = @id_convite
      `);

    // 4. Insere o colaborador em ESCALA_ordemservico_funcionarios (alocado)
    await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .input("id_funcionario", sql.Int, idFuncionario)
      .input("id_convite", sql.UniqueIdentifier, idConvite)
      .query(`
        INSERT INTO dbo.ESCALA_ordemservico_funcionarios (
          id_escala_ordemservico_funcionarios, id_ordemservico, id_funcionario, func_confirmou, id_convite
        ) VALUES (
          NEWID(), @id_ordemservico, @id_funcionario, 1, @id_convite
        )
      `);

    // 5. Incrementa a contagem de alocados
    const newQty = os.qtde_pessoas_escaladas + 1;
    await new sql.Request(tx)
      .input("id_ordemservico", sql.Int, idOrdemServico)
      .input("qtde_pessoas_escaladas", sql.Int, newQty)
      .query(`
        UPDATE dbo.ESCALA_ordemservico
        SET qtde_pessoas_escaladas = @qtde_pessoas_escaladas
        WHERE id_ordemservico = @id_ordemservico
      `);

    // 6. Se as vagas foram completamente preenchidas, cancela os convites pendentes restantes para evitar overbooking
    if (newQty >= os.qtde_inventariantes) {
      await new sql.Request(tx)
        .input("id_ordemservico", sql.Int, idOrdemServico)
        .query(`
          UPDATE dbo.ESCALA_ordemservico_funcionarios_convites
          SET 
            convite_recusado = 1,
            justificativa_convite = 'Vagas preenchidas por outro colaborador',
            datahora_resposta_convite = SYSUTCDATETIME()
          WHERE id_ordemservico = @id_ordemservico
            AND convite_aceito = 0
            AND convite_recusado = 0
        `);
    }

    await tx.commit();

    // 7. Envia o vínculo em tempo real ao SGS legado (Sincronismo Assíncrono fora da transação de banco)
    void registrarPresencaNoSgs(idOrdemServico, idFuncionario);

  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
