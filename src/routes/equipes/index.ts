import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import {
  alterarEquipe,
  buscarEquipe,
  criarEquipe,
  listarEquipes,
  removerEquipe
} from "../../services/equipeService";
import {
  equipeDeleteSchema,
  equipeGetByIdSchema,
  equipeGetSchema,
  equipePostSchema,
  equipePutSchema
} from "../../schemas/routes";

function parseJsonBody(req: { body: unknown }): Record<string, unknown> {
  if (typeof req.body === "object" && req.body !== null && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  return {};
}

function validationMessage(code: string): string | null {
  const messages: Record<string, string> = {
    EQUIPE_ID_OBRIGATORIO: "equipe_id é obrigatório",
    COORDENADOR_ID_INVALIDO: "coordenador_id deve ser um inteiro positivo",
    COORDENADOR_NOME_OBRIGATORIO: "coordenador_nome é obrigatório",
    COORDENADOR_NOME_LONGO: "coordenador_nome deve ter no máximo 500 caracteres",
    EQUIPE_QTDE_INVENTARIANTES_INVALIDA:
      "equipe_qtde_inventariantes deve ser um inteiro maior ou igual a zero",
    COORDENADOR_JA_POSSUI_EQUIPE:
      "Este coordenador já possui uma equipe cadastrada. Cada coordenador só pode gerenciar 1 equipe."
  };
  return messages[code] ?? null;
}

export default async function registerEquipes(app: FastifyInstance) {
  app.get("/equipes", { schema: equipeGetSchema }, async (_req, reply) => {
    try {
      reply.type("application/json");
      return { rows: await listarEquipes() };
    } catch {
      const correlation_id = randomUUID();
      reply.code(500);
      return { message: "Falha interna", details: { correlation_id } };
    }
  });

  app.get("/equipes/:equipe_id", { schema: equipeGetByIdSchema }, async (req, reply) => {
    try {
      const params = req.params as { equipe_id?: string };
      const equipe = await buscarEquipe(String(params.equipe_id ?? ""));
      if (!equipe) {
        reply.code(404);
        return { error: "Equipe não encontrada" };
      }
      reply.type("application/json");
      return { equipe };
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

  app.post("/equipes", { schema: equipePostSchema }, async (req, reply) => {
    try {
      const body = parseJsonBody(req);
      const equipe = await criarEquipe({
        coordenador_id: body.coordenador_id,
        coordenador_nome: body.coordenador_nome,
        equipe_qtde_inventariantes: body.equipe_qtde_inventariantes
      });
      reply.code(201);
      reply.type("application/json");
      return { equipe };
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

  app.put("/equipes/:equipe_id", { schema: equipePutSchema }, async (req, reply) => {
    try {
      const params = req.params as { equipe_id?: string };
      const body = parseJsonBody(req);
      const equipe = await alterarEquipe(String(params.equipe_id ?? ""), {
        coordenador_id: body.coordenador_id,
        coordenador_nome: body.coordenador_nome,
        equipe_qtde_inventariantes: body.equipe_qtde_inventariantes
      });
      if (!equipe) {
        reply.code(404);
        return { error: "Equipe não encontrada" };
      }
      reply.type("application/json");
      return { equipe };
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

  app.delete("/equipes/:equipe_id", { schema: equipeDeleteSchema }, async (req, reply) => {
    try {
      const params = req.params as { equipe_id?: string };
      const deleted = await removerEquipe(String(params.equipe_id ?? ""));
      if (!deleted) {
        reply.code(404);
        return { error: "Equipe não encontrada" };
      }
      reply.code(204);
      return undefined;
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
