import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import { listarBasesOperacionais, listarFuncionariosPorCargo } from "../../services/catalogoService";
import { basesOperacionaisGetSchema, funcionariosPorCargoGetSchema } from "../../schemas/routes";

function validationMessage(code: string): string | null {
  const messages: Record<string, string> = {
    ID_FILIAL_INVALIDO: "id_filial deve ser um inteiro positivo",
    ID_CARGO_INVALIDO: "id_cargo deve ser um inteiro positivo"
  };
  return messages[code] ?? null;
}

export default async function registerCatalogo(app: FastifyInstance) {
  app.get("/bases-operacionais", { schema: basesOperacionaisGetSchema }, async (_req, reply) => {
    try {
      reply.type("application/json");
      return { rows: await listarBasesOperacionais() };
    } catch {
      const correlation_id = randomUUID();
      reply.code(500);
      return { message: "Falha interna", details: { correlation_id } };
    }
  });

  app.get("/funcionarios-por-cargo", { schema: funcionariosPorCargoGetSchema }, async (req, reply) => {
    try {
      const query = req.query as { id_filial?: string; id_cargo?: string };
      reply.type("application/json");
      return {
        rows: await listarFuncionariosPorCargo(query.id_filial, query.id_cargo)
      };
    } catch (err) {
      const message = validationMessage((err as Error).message);
      if (message) {
        reply.code(400);
        return { error: message };
      }
      const correlation_id = randomUUID();
      reply.code(500);
      return { message: "Falha interna", details: { correlation_id } };
    }
  });
}
