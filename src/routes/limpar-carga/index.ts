import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { limparCargaPostSchema } from "../../schemas/routes";
import { limparCarga } from "../../services/cargaService";

export default async function registerLimparCarga(app: FastifyInstance) {
  app.post("/limpar-carga", { schema: limparCargaPostSchema }, async (_req, reply) => {
    try {
      await limparCarga();
      reply.type("application/json");
      return { ok: true };
    } catch {
      const correlation_id = randomUUID();
      reply.code(500);
      reply.type("application/json");
      return { message: "Falha interna", details: { correlation_id } };
    }
  });
}
