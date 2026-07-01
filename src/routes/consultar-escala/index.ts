import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import {
  listarPessoasEscaladas,
  listarSituacaoEscalas
} from "../../services/consultarEscalaService";
import {
  consultarEscalaPessoasEscaladasGetSchema,
  consultarEscalaSituacaoGetSchema
} from "../../schemas/routes";

function validationMessage(code: string): string | null {
  const messages: Record<string, string> = {
    ID_ORDEMSERVICO_INVALIDO: "id_ordemservico deve ser um inteiro positivo"
  };
  return messages[code] ?? null;
}

export default async function registerConsultarEscala(app: FastifyInstance) {
  app.get(
    "/consultar-escala/situacao-escalas",
    { schema: consultarEscalaSituacaoGetSchema },
    async (_req, reply) => {
      try {
        reply.type("application/json");
        return { rows: await listarSituacaoEscalas() };
      } catch {
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );

  app.get(
    "/consultar-escala/pessoas-escaladas",
    { schema: consultarEscalaPessoasEscaladasGetSchema },
    async (req, reply) => {
      try {
        const query = req.query as { id_ordemservico?: string };
        reply.type("application/json");
        return { rows: await listarPessoasEscaladas(query.id_ordemservico) };
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
    }
  );
}
