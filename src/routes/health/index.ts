import type { FastifyInstance } from "fastify";
import { getPool } from "../../db";
import { verificarTabelasAuth } from "../../repository/authRepo";
import { healthDbGetSchema, healthGetSchema } from "../../schemas/routes";

export default async function registerHealth(app: FastifyInstance) {
  app.get("/health", { schema: healthGetSchema }, async () => {
    return { status: "ok" };
  });

  app.get("/health/db", { schema: healthDbGetSchema }, async (_req, reply) => {
    try {
      const pool = await getPool();
      await pool.request().query("SELECT 1 AS ok");
      const authOk = await verificarTabelasAuth();
      reply.type("application/json");
      if (!authOk) {
        reply.code(503);
        return {
          status: "degraded",
          database: "connected",
          auth_tables: "missing",
          hint: "Crie dbo.ESCALA_api_usuario e dbo.ESCALA_api_sessao (veja sql/ESCALA_auth_tables.sql)"
        };
      }
      return { status: "ok", database: "connected", auth_tables: "ok" };
    } catch {
      reply.code(503);
      reply.type("application/json");
      return { status: "error", database: "unavailable" };
    }
  });
}
