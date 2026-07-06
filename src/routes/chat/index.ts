import type { FastifyInstance } from "fastify";
import { getPool, sql } from "../../db";
import { validarToken } from "../../services/authService";
import { randomUUID } from "crypto";

async function getAdminUser(req: any) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const token = match ? match[1].trim() : null;
  if (!token) return null;
  const sessao = await validarToken(token);
  return sessao; // contains email, id_usuario, perfil
}

export default async function registerChatRoutes(app: FastifyInstance) {
  // 1. GET /api/chat/conversas
  app.get("/api/chat/conversas", async (req, reply) => {
    try {
      const admin = await getAdminUser(req);
      if (!admin) {
        reply.code(401);
        return { error: "Não autorizado" };
      }

      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT 
          m.id_funcionario,
          COALESCE(m.id_ordemservico, 0) AS id_ordemservico,
          f.NOME AS funcionario_nome,
          COALESCE(cl.NOME_FANTASIA, 'Conversa Direta') AS cliente_nome,
          (
            SELECT TOP 1 mensagem 
            FROM dbo.ESCALA_chat_mensagens 
            WHERE id_funcionario = m.id_funcionario AND COALESCE(id_ordemservico, 0) = COALESCE(m.id_ordemservico, 0)
            ORDER BY criado_em DESC
          ) AS ultima_mensagem,
          (
            SELECT TOP 1 criado_em 
            FROM dbo.ESCALA_chat_mensagens 
            WHERE id_funcionario = m.id_funcionario AND COALESCE(id_ordemservico, 0) = COALESCE(m.id_ordemservico, 0)
            ORDER BY criado_em DESC
          ) AS data_ultima_mensagem,
          (
            SELECT COUNT(*) 
            FROM dbo.ESCALA_chat_mensagens 
            WHERE id_funcionario = m.id_funcionario AND COALESCE(id_ordemservico, 0) = COALESCE(m.id_ordemservico, 0)
              AND remetente = 'colaborador' AND lida = 0
          ) AS unread_count
        FROM dbo.ESCALA_chat_mensagens m
        INNER JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = m.id_funcionario
        LEFT JOIN dbo.t2_ordemservico os ON os.id_ordemservico = m.id_ordemservico
        LEFT JOIN dbo.t2_clientes cl ON cl.ID_CLIENTE = os.id_cliente
        GROUP BY m.id_funcionario, m.id_ordemservico, f.NOME, cl.NOME_FANTASIA
        ORDER BY data_ultima_mensagem DESC
      `);

      return { conversas: result.recordset ?? [] };
    } catch (err) {
      console.error(err);
      reply.code(500);
      return { error: "Erro ao buscar conversas do chat" };
    }
  });

  // 2. GET /api/chat/conversas/:id_funcionario/:id_ordemservico/mensagens
  app.get("/api/chat/conversas/:id_funcionario/:id_ordemservico/mensagens", async (req, reply) => {
    try {
      const admin = await getAdminUser(req);
      if (!admin) {
        reply.code(401);
        return { error: "Não autorizado" };
      }

      const { id_funcionario, id_ordemservico } = req.params as { id_funcionario: string; id_ordemservico: string };
      const funcId = Number(id_funcionario);
      const osId = Number(id_ordemservico);

      const pool = await getPool();

      // Marca como lidas as mensagens do colaborador nesta conversa
      await pool.request()
        .input("id_funcionario", sql.Int, funcId)
        .input("id_ordemservico", sql.Int, osId)
        .query(`
          UPDATE dbo.ESCALA_chat_mensagens
          SET 
            lida = 1,
            datahora_leitura = COALESCE(datahora_leitura, SYSUTCDATETIME())
          WHERE id_funcionario = @id_funcionario 
            AND (id_ordemservico = @id_ordemservico OR (@id_ordemservico = 0 AND id_ordemservico IS NULL))
            AND remetente = 'colaborador'
            AND lida = 0
        `);

      // Busca o histórico de mensagens
      const result = await pool.request()
        .input("id_funcionario", sql.Int, funcId)
        .input("id_ordemservico", sql.Int, osId)
        .query(`
          SELECT 
            CAST(id AS NVARCHAR(36)) AS id,
            remetente,
            mensagem,
            criado_em,
            entregue,
            lida,
            datahora_entrega,
            datahora_leitura,
            enviado_por
          FROM dbo.ESCALA_chat_mensagens
          WHERE id_funcionario = @id_funcionario
            AND (id_ordemservico = @id_ordemservico OR (@id_ordemservico = 0 AND id_ordemservico IS NULL))
          ORDER BY criado_em ASC
        `);

      return { mensagens: result.recordset ?? [] };
    } catch (err) {
      console.error(err);
      reply.code(500);
      return { error: "Erro ao carregar histórico do chat" };
    }
  });

  // 3. POST /api/chat/conversas/:id_funcionario/:id_ordemservico/mensagens
  app.post("/api/chat/conversas/:id_funcionario/:id_ordemservico/mensagens", async (req, reply) => {
    try {
      const admin = await getAdminUser(req);
      if (!admin) {
        reply.code(401);
        return { error: "Não autorizado" };
      }

      const { id_funcionario, id_ordemservico } = req.params as { id_funcionario: string; id_ordemservico: string };
      const { mensagem } = req.body as { mensagem: string };
      
      const funcId = Number(id_funcionario);
      const osId = Number(id_ordemservico);

      if (!mensagem || !mensagem.trim()) {
        reply.code(400);
        return { error: "A mensagem é obrigatória" };
      }

      const pool = await getPool();
      const uuid = randomUUID();

      await pool.request()
        .input("id", sql.UniqueIdentifier, uuid)
        .input("id_ordemservico", sql.Int, osId === 0 ? null : osId)
        .input("id_funcionario", sql.Int, funcId)
        .input("mensagem", sql.NVarChar(sql.MAX), mensagem.trim())
        .input("enviado_por", sql.VarChar(255), admin.email)
        .query(`
          INSERT INTO dbo.ESCALA_chat_mensagens (
            id, id_ordemservico, id_funcionario, remetente, mensagem, lida, criado_em, 
            entregue, datahora_entrega, enviado_por
          ) VALUES (
            @id, @id_ordemservico, @id_funcionario, 'gestor', @mensagem, 0, SYSUTCDATETIME(),
            1, SYSUTCDATETIME(), @enviado_por
          )
        `);

      return { 
        success: true, 
        id: uuid, 
        entregue: 1, 
        datahora_entrega: new Date().toISOString() 
      };
    } catch (err) {
      console.error(err);
      reply.code(500);
      return { error: "Erro ao enviar mensagem" };
    }
  });

  // 4. GET /api/chat/funcionarios/search
  app.get("/api/chat/funcionarios/search", async (req, reply) => {
    try {
      const admin = await getAdminUser(req);
      if (!admin) {
        reply.code(401);
        return { error: "Não autorizado" };
      }

      const { q } = req.query as { q?: string };
      if (!q || !q.trim()) {
        return { rows: [] };
      }

      const pool = await getPool();
      const result = await pool.request()
        .input("q", sql.VarChar(255), `%${q.trim()}%`)
        .query(`
          SELECT TOP 10 
            ID_FUNCIONARIO AS id_funcionario, 
            NOME AS nome
          FROM dbo.t2_funcionarios
          WHERE NOME LIKE @q 
            AND ISNULL(INATIVO, 'N') = 'N'
          ORDER BY NOME ASC
        `);

      return { rows: result.recordset ?? [] };
    } catch (err) {
      console.error(err);
      reply.code(500);
      return { error: "Erro ao buscar funcionários" };
    }
  });
}
