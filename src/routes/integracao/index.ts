import type { FastifyInstance } from "fastify";
import { getPool, sql } from "../../db";
import { validarToken } from "../../services/authService";

export default async function registerIntegracao(app: FastifyInstance) {
  // 1. GET /api/integracao/escalas/:id_ordemservico/presencas
  app.get("/api/integracao/escalas/:id_ordemservico/presencas", async (req, reply) => {
    try {
      const { id_ordemservico } = req.params as { id_ordemservico: string };
      const pool = await getPool();
      
      const result = await pool.request()
        .input("id_ordemservico", sql.Int, Number(id_ordemservico))
        .query(`
          SELECT 
            f.NOME AS nome,
            f.ID_FUNCIONARIO AS id,
            f.CPF AS cpf,
            esc.datahora_checkin AS datahora_entrada,
            esc.datahora_chegada,
            esc.datahora_pausa,
            esc.datahora_retornopausa,
            esc.datahora_saida,
            esc.justificativa_chegada,
            esc.justificativa_saida,
            COALESCE(esc.ConfirmadoPorQuem, 'Pendente') AS status_biometria,
            esc.func_confirmou AS presenca
          FROM dbo.ESCALA_ordemservico_funcionarios esc
          INNER JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = esc.id_funcionario
          WHERE esc.id_ordemservico = @id_ordemservico
            AND esc.escala_declinada_pos_aceite = 0
          ORDER BY f.NOME ASC
        `);

      return { presencas: result.recordset ?? [] };
    } catch (err) {
      console.error(err);
      reply.code(500);
      return { error: "Erro ao buscar presenças da OS" };
    }
  });

  // 2. POST /api/integracao/justificar-saida
  app.post("/api/integracao/justificar-saida", async (req, reply) => {
    try {
      const auth = req.headers.authorization;
      if (!auth) {
        reply.code(401);
        return { error: "Não autorizado" };
      }
      const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
      const token = match ? match[1].trim() : null;
      if (!token) {
        reply.code(401);
        return { error: "Não autorizado" };
      }
      const sessao = await validarToken(token);
      if (!sessao) {
        reply.code(401);
        return { error: "Sessão expirada ou inválida" };
      }

      const { id_ordemservico, id_funcionario, justificativa_saida, datahora_saida } = req.body as {
        id_ordemservico: number;
        id_funcionario: number;
        justificativa_saida: string;
        datahora_saida?: string;
      };

      if (!id_ordemservico || !id_funcionario || !justificativa_saida) {
        reply.code(400);
        return { error: "id_ordemservico, id_funcionario e justificativa_saida são obrigatórios" };
      }

      const pool = await getPool();
      await pool.request()
        .input("id_ordemservico", sql.Int, id_ordemservico)
        .input("id_funcionario", sql.Int, id_funcionario)
        .input("justificativa", sql.VarChar(1000), justificativa_saida)
        .input("datahora_saida", sql.DateTime, datahora_saida ? new Date(datahora_saida) : new Date())
        .query(`
          UPDATE dbo.ESCALA_ordemservico_funcionarios
          SET datahora_saida = @datahora_saida,
              justificativa_saida = @justificativa,
              ConfirmadoPorQuem = 'Gestor (Manual)'
          WHERE id_ordemservico = @id_ordemservico
            AND id_funcionario = @id_funcionario
        `);

      return { success: true };
    } catch (err) {
      console.error(err);
      reply.code(500);
      return { error: "Erro ao justificar saída" };
    }
  });
}
