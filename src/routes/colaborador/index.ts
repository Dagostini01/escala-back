import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { getPool, sql } from "../../db";
import { validarToken } from "../../services/authService";

export async function getFuncionarioFromToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  const token = match ? match[1].trim() : null;
  if (!token) return null;

  const sessao = await validarToken(token);
  if (!sessao) return null;

  const pool = await getPool();
  const r = await pool.request()
    .input("email", sql.VarChar(255), sessao.email)
    .query(`
      SELECT ID_FUNCIONARIO as id_funcionario, NOME as nome, CPF as cpf, MAIL as email, VALOR as valor_diaria, SALARIO as salario
      FROM dbo.t2_funcionarios 
      WHERE MAIL = @email AND INATIVO = 'N'
    `);
  return r.recordset[0] ?? null;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in meters
}

export default async function registerColaboradorRoutes(app: FastifyInstance) {
  // Middleware/helper to ensure authenticated collaborator
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/api/colaborador")) {
      const colab = await getFuncionarioFromToken(req.headers.authorization);
      if (!colab) {
        reply.code(401).send({ error: "Colaborador não autenticado ou inativo" });
        return;
      }
      (req as any).colaborador = colab;
    }
  });

  // GET /api/colaborador/me
  app.get("/api/colaborador/me", async (req, reply) => {
    return { colaborador: (req as any).colaborador };
  });

  // GET /api/colaborador/convites
  app.get("/api/colaborador/convites", async (req, reply) => {
    const colab = (req as any).colaborador;
    const pool = await getPool();
    const result = await pool.request()
      .input("id_funcionario", sql.Int, colab.id_funcionario)
      .query(`
        SELECT 
          CAST(c.id_convite AS NVARCHAR(36)) AS id_convite,
          c.id_ordemservico,
          c.id_tipo_convite,
          c.validade_convite,
          os.data_os,
          os.previsao_pecas,
          os.quantidade_pessoas,
          cl.NOME_FANTASIA AS cliente_nome,
          lj.NOME_FANTASIA AS loja_nome,
          eo.latitude,
          eo.longitude,
          eo.raio_tolerancia_metros
        FROM dbo.ESCALA_ordemservico_funcionarios_convites c
        INNER JOIN dbo.ESCALA_ordemservico eo ON eo.id_ordemservico = c.id_ordemservico
        INNER JOIN dbo.t2_ordemservico os ON os.id_ordemservico = eo.id_ordemservico
        LEFT JOIN dbo.t2_clientes cl ON cl.ID_CLIENTE = os.id_cliente
        LEFT JOIN dbo.t2_clientes_filial lj ON lj.ID_CLIENTE = os.id_cliente AND lj.ID_CLIENTE_FILIAL = os.id_cliente_filial
        WHERE c.id_funcionario = @id_funcionario
          AND c.convite_aceito = 0
          AND c.convite_recusado = 0
          AND c.validade_convite > GETDATE()
        ORDER BY os.data_os ASC
      `);
    return { convites: result.recordset ?? [] };
  });

  // POST /api/colaborador/convites/:id_convite/responder
  app.post("/api/colaborador/convites/:id_convite/responder", async (req, reply) => {
    const colab = (req as any).colaborador;
    const { id_convite } = req.params as { id_convite: string };
    const { resposta, justificativa } = req.body as { resposta: "aceitar" | "recusar"; justificativa?: string };

    if (!resposta || (resposta !== "aceitar" && resposta !== "recusar")) {
      reply.code(400);
      return { error: "Resposta deve ser 'aceitar' ou 'recusar'" };
    }

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      // 1. Busca o convite
      const conviteRes = await new sql.Request(tx)
        .input("id_convite", sql.UniqueIdentifier, id_convite)
        .input("id_funcionario", sql.Int, colab.id_funcionario)
        .query(`
          SELECT * FROM dbo.ESCALA_ordemservico_funcionarios_convites 
          WHERE id_convite = @id_convite AND id_funcionario = @id_funcionario
        `);
      const convite = conviteRes.recordset[0];
      if (!convite) {
        await tx.rollback();
        reply.code(404);
        return { error: "Convite não encontrado ou não pertence a este colaborador" };
      }

      if (convite.convite_aceito || convite.convite_recusado) {
        await tx.rollback();
        reply.code(400);
        return { error: "Este convite já foi respondido anteriormente" };
      }

      if (resposta === "aceitar") {
        // Verifica se a OS já preencheu todas as vagas
        const osRes = await new sql.Request(tx)
          .input("id_ordemservico", sql.Int, convite.id_ordemservico)
          .query(`
            SELECT os.quantidade_pessoas,
              (SELECT COUNT(*) FROM dbo.ESCALA_ordemservico_funcionarios WHERE id_ordemservico = @id_ordemservico AND escala_declinada_pos_aceite = 0) AS alocados
            FROM dbo.t2_ordemservico os
            WHERE os.id_ordemservico = @id_ordemservico
          `);
        const osInfo = osRes.recordset[0];
        if (osInfo && osInfo.alocados >= osInfo.quantidade_pessoas) {
          // Atualiza convite como recusado por preenchimento de vagas
          await new sql.Request(tx)
            .input("id_convite", sql.UniqueIdentifier, id_convite)
            .query(`
              UPDATE dbo.ESCALA_ordemservico_funcionarios_convites
              SET convite_recusado = 1, convite_visualizado = 1, datahora_resposta_convite = GETDATE(), justificativa_convite = 'Vagas preenchidas por outro colaborador'
              WHERE id_convite = @id_convite
            `);
          await tx.commit();
          reply.code(409);
          return { error: "Corrida encerrada! Todas as vagas já foram preenchidas." };
        }

        // Aceita o convite
        await new sql.Request(tx)
          .input("id_convite", sql.UniqueIdentifier, id_convite)
          .query(`
            UPDATE dbo.ESCALA_ordemservico_funcionarios_convites
            SET convite_aceito = 1, convite_visualizado = 1, datahora_resposta_convite = GETDATE()
            WHERE id_convite = @id_convite
          `);

        // Aloca na escala
        await new sql.Request(tx)
          .input("id_ordemservico", sql.Int, convite.id_ordemservico)
          .input("id_funcionario", sql.Int, colab.id_funcionario)
          .input("id_convite", sql.VarChar(36), id_convite)
          .query(`
            INSERT INTO dbo.ESCALA_ordemservico_funcionarios (
              id_escala_ordemservico_funcionarios, id_ordemservico, id_funcionario, func_confirmou, id_convite, declinio_dentro_periodo_permitido, escala_declinada_pos_aceite
            ) VALUES (
              NEWID(), @id_ordemservico, @id_funcionario, 1, @id_convite, 0, 0
            )
          `);

        // SGS Legado integration will trigger sync here in Sprint 5
        console.info(`[SGS Integration] Vinculando colaborador ${colab.id_funcionario} na OS ${convite.id_ordemservico}`);

      } else {
        // Recusa o convite
        await new sql.Request(tx)
          .input("id_convite", sql.UniqueIdentifier, id_convite)
          .input("justificativa", sql.VarChar(500), justificativa ?? "Recusado pelo colaborador via portal")
          .query(`
            UPDATE dbo.ESCALA_ordemservico_funcionarios_convites
            SET convite_recusado = 1, convite_visualizado = 1, datahora_resposta_convite = GETDATE(), justificativa_convite = @justificativa
            WHERE id_convite = @id_convite
          `);
      }

      await tx.commit();
      return { success: true };
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  });

  // GET /api/colaborador/escalas
  app.get("/api/colaborador/escalas", async (req, reply) => {
    const colab = (req as any).colaborador;
    const pool = await getPool();
    const result = await pool.request()
      .input("id_funcionario", sql.Int, colab.id_funcionario)
      .query(`
        SELECT 
          CAST(esc.id_escala_ordemservico_funcionarios AS NVARCHAR(36)) AS id_escala,
          esc.id_ordemservico,
          esc.func_confirmou,
          esc.ConfirmadoPorQuem,
          os.data_os,
          os.previsao_pecas,
          cl.NOME_FANTASIA AS cliente_nome,
          lj.NOME_FANTASIA AS loja_nome,
          eo.latitude,
          eo.longitude,
          eo.raio_tolerancia_metros
        FROM dbo.ESCALA_ordemservico_funcionarios esc
        INNER JOIN dbo.ESCALA_ordemservico eo ON eo.id_ordemservico = esc.id_ordemservico
        INNER JOIN dbo.t2_ordemservico os ON os.id_ordemservico = eo.id_ordemservico
        LEFT JOIN dbo.t2_clientes cl ON cl.ID_CLIENTE = os.id_cliente
        LEFT JOIN dbo.t2_clientes_filial lj ON lj.ID_CLIENTE = os.id_cliente AND lj.ID_CLIENTE_FILIAL = os.id_cliente_filial
        WHERE esc.id_funcionario = @id_funcionario
          AND esc.escala_declinada_pos_aceite = 0
        ORDER BY os.data_os DESC
      `);
    return { escalas: result.recordset ?? [] };
  });

  // POST /api/colaborador/escalas/:id_ordemservico/checkin
  app.post("/api/colaborador/escalas/:id_ordemservico/checkin", async (req, reply) => {
    const colab = (req as any).colaborador;
    const { id_ordemservico } = req.params as { id_ordemservico: string };
    const { latitude, longitude } = req.body as { latitude: number; longitude: number };

    if (latitude === undefined || longitude === undefined) {
      reply.code(400);
      return { error: "Coordenadas latitude e longitude são obrigatórias" };
    }

    const pool = await getPool();
    // 1. Busca coordenadas (OS ou Ponto de Encontro)
    const osRes = await pool.request()
      .input("id_ordemservico", sql.Int, Number(id_ordemservico))
      .query(`
        SELECT 
          eo.usar_ponto_encontro,
          eo.id_ponto_encontro,
          CASE WHEN eo.usar_ponto_encontro = 1 AND pe.id IS NOT NULL THEN pe.latitude ELSE eo.latitude END AS latitude,
          CASE WHEN eo.usar_ponto_encontro = 1 AND pe.id IS NOT NULL THEN pe.longitude ELSE eo.longitude END AS longitude,
          CASE WHEN eo.usar_ponto_encontro = 1 AND pe.id IS NOT NULL THEN COALESCE(pe.raio_tolerancia_metros, 100) ELSE COALESCE(eo.raio_tolerancia_metros, 100) END AS raio_tolerancia,
          pe.nome AS ponto_encontro_nome
        FROM dbo.ESCALA_ordemservico eo
        LEFT JOIN dbo.ESCALA_pontos_encontro pe ON pe.id = eo.id_ponto_encontro
        WHERE eo.id_ordemservico = @id_ordemservico
      `);
    
    const osGeo = osRes.recordset[0];
    if (!osGeo) {
      reply.code(404);
      return { error: "OS não configurada no sistema de escalas" };
    }

    if (osGeo.latitude === null || osGeo.longitude === null) {
      // Se a OS não tem geolocalização configurada, confirmamos mas avisamos
      await pool.request()
        .input("id_ordemservico", sql.Int, Number(id_ordemservico))
        .input("id_funcionario", sql.Int, colab.id_funcionario)
        .query(`
          UPDATE dbo.ESCALA_ordemservico_funcionarios
          SET func_confirmou = 1, ConfirmadoPorQuem = 'GPS (Sem Geo)'
          WHERE id_ordemservico = @id_ordemservico AND id_funcionario = @id_funcionario
        `);
      return { success: true, message: "Check-in realizado (Local sem geolocalização configurada)." };
    }

    // Calcula distância usando Haversine
    const dist = haversineDistance(latitude, longitude, Number(osGeo.latitude), Number(osGeo.longitude));
    if (dist > osGeo.raio_tolerancia) {
      const localDesc = osGeo.usar_ponto_encontro && osGeo.ponto_encontro_nome ? `do Ponto de Encontro (${osGeo.ponto_encontro_nome})` : "do local de inventário";
      reply.code(400);
      return { 
        error: `Fora do raio de tolerância! Você está a ${Math.round(dist)}m ${localDesc}, mas o raio permitido é de ${osGeo.raio_tolerancia}m.` 
      };
    }

    // Confirmado!
    const targetConfirmado = osGeo.usar_ponto_encontro && osGeo.ponto_encontro_nome 
      ? `GPS (Ponto de Encontro: ${osGeo.ponto_encontro_nome})`
      : 'GPS';

    await pool.request()
      .input("id_ordemservico", sql.Int, Number(id_ordemservico))
      .input("id_funcionario", sql.Int, colab.id_funcionario)
      .input("confirmado_por", sql.VarChar(150), targetConfirmado)
      .query(`
        UPDATE dbo.ESCALA_ordemservico_funcionarios
        SET func_confirmou = 1, ConfirmadoPorQuem = @confirmado_por
        WHERE id_ordemservico = @id_ordemservico AND id_funcionario = @id_funcionario
      `);

    return { success: true, distance: Math.round(dist) };
  });

  // GET /api/colaborador/ganhos
  app.get("/api/colaborador/ganhos", async (req, reply) => {
    const colab = (req as any).colaborador;
    const pool = await getPool();
    
    // Contamos presenças passadas confirmadas
    const presencasRes = await pool.request()
      .input("id_funcionario", sql.Int, colab.id_funcionario)
      .query(`
        SELECT COUNT(*) AS total_comparecido
        FROM dbo.ESCALA_ordemservico_funcionarios esc
        INNER JOIN dbo.t2_ordemservico os ON os.id_ordemservico = esc.id_ordemservico
        WHERE esc.id_funcionario = @id_funcionario
          AND esc.func_confirmou = 1
          AND esc.escala_declinada_pos_aceite = 0
          AND os.data_os < GETDATE()
      `);
    const totalComparecido = presencasRes.recordset[0]?.total_comparecido ?? 0;
    
    // Diária base
    const diariaVal = Number(colab.valor_diaria || colab.salario || 100);
    const totalGanhos = totalComparecido * diariaVal;

    return {
      valor_diaria: diariaVal,
      total_escalas_realizadas: totalComparecido,
      total_ganhos_estimados: totalGanhos
    };
  });

  // GET /api/colaborador/chat/:id_ordemservico
  app.get("/api/colaborador/chat/:id_ordemservico", async (req, reply) => {
    const colab = (req as any).colaborador;
    const { id_ordemservico } = req.params as { id_ordemservico: string };
    const pool = await getPool();
    
    const result = await pool.request()
      .input("id_ordemservico", sql.Int, Number(id_ordemservico))
      .input("id_funcionario", sql.Int, colab.id_funcionario)
      .query(`
        SELECT 
          CAST(id AS NVARCHAR(36)) AS id,
          remetente,
          mensagem,
          criado_em,
          lida
        FROM dbo.ESCALA_chat_mensagens
        WHERE id_ordemservico = @id_ordemservico AND id_funcionario = @id_funcionario
        ORDER BY criado_em ASC
      `);
    return { mensagens: result.recordset ?? [] };
  });

  // POST /api/colaborador/chat/:id_ordemservico
  app.post("/api/colaborador/chat/:id_ordemservico", async (req, reply) => {
    const colab = (req as any).colaborador;
    const { id_ordemservico } = req.params as { id_ordemservico: string };
    const { mensagem } = req.body as { mensagem: string };

    if (!mensagem || !mensagem.trim()) {
      reply.code(400);
      return { error: "Mensagem vazia" };
    }

    const pool = await getPool();
    const id = randomUUID();

    await pool.request()
      .input("id", sql.UniqueIdentifier, id)
      .input("id_ordemservico", sql.Int, Number(id_ordemservico))
      .input("id_funcionario", sql.Int, colab.id_funcionario)
      .input("remetente", sql.VarChar(50), "colaborador")
      .input("mensagem", sql.NVarChar(sql.MAX), mensagem.trim())
      .query(`
        INSERT INTO dbo.ESCALA_chat_mensagens (id, id_ordemservico, id_funcionario, remetente, mensagem, lida, criado_em)
        VALUES (@id, @id_ordemservico, @id_funcionario, @remetente, @mensagem, 0, SYSUTCDATETIME())
      `);

    return { 
      id, 
      remetente: "colaborador", 
      mensagem: mensagem.trim(), 
      criado_em: new Date().toISOString() 
    };
  });

  // GET /api/colaborador/gps-consent
  app.get("/api/colaborador/gps-consent", async (req, reply) => {
    const colab = (req as any).colaborador;
    const pool = await getPool();
    const result = await pool.request()
      .input("id_funcionario", sql.Int, colab.id_funcionario)
      .query(`
        SELECT COALESCE(compartilha_gps, 1) AS compartilha_gps 
        FROM dbo.t2_funcionarios 
        WHERE ID_FUNCIONARIO = @id_funcionario
      `);
    const consent = result.recordset[0]?.compartilha_gps !== 0;
    return { consent };
  });

  // POST /api/colaborador/gps-consent
  app.post("/api/colaborador/gps-consent", async (req, reply) => {
    const colab = (req as any).colaborador;
    const { consent } = req.body as { consent: boolean };

    const pool = await getPool();
    await pool.request()
      .input("id_funcionario", sql.Int, colab.id_funcionario)
      .input("consent", sql.Bit, consent ? 1 : 0)
      .query(`
        UPDATE dbo.t2_funcionarios
        SET compartilha_gps = @consent
        WHERE ID_FUNCIONARIO = @id_funcionario
      `);
    return { success: true };
  });
}
