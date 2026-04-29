import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import {
  alterarEquipePessoa,
  buscarEquipePessoa,
  criarEquipePessoa,
  listarEquipePessoas,
  removerEquipePessoa
} from "../../services/equipePessoasService";
import {
  equipePessoaDeleteSchema,
  equipePessoaGetByIdSchema,
  equipePessoaGetSchema,
  equipePessoaPostSchema,
  equipePessoaPutSchema
} from "../../schemas/routes";

function parseJsonBody(req: { body: unknown }): Record<string, unknown> {
  if (typeof req.body === "object" && req.body !== null && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  return {};
}

function validationMessage(code: string): string | null {
  const messages: Record<string, string> = {
    EQUIPE_PESSOA_ID_INVALIDO: "equipe_pessoa_id deve ser um inteiro positivo",
    EQUIPE_ID_OBRIGATORIO: "equipe_id é obrigatório",
    EQUIPE_ID_LONGO: "equipe_id deve ter no máximo 40 caracteres",
    FUNCIONARIO_ID_INVALIDO: "funcionario_id deve ser um inteiro positivo"
  };
  return messages[code] ?? null;
}

export default async function registerEquipePessoas(app: FastifyInstance) {
  app.get("/equipe-pessoas", { schema: equipePessoaGetSchema }, async (req, reply) => {
    try {
      const query = req.query as { equipe_id?: string };
      reply.type("application/json");
      return { rows: await listarEquipePessoas(query.equipe_id) };
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

  app.get(
    "/equipe-pessoas/:equipe_pessoa_id",
    { schema: equipePessoaGetByIdSchema },
    async (req, reply) => {
      try {
        const params = req.params as { equipe_pessoa_id?: string };
        const pessoa = await buscarEquipePessoa(params.equipe_pessoa_id);
        if (!pessoa) {
          reply.code(404);
          return { error: "Pessoa da equipe não encontrada" };
        }
        reply.type("application/json");
        return { pessoa };
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

  app.post("/equipe-pessoas", { schema: equipePessoaPostSchema }, async (req, reply) => {
    try {
      const body = parseJsonBody(req);
      const pessoa = await criarEquipePessoa({
        equipe_id: body.equipe_id,
        funcionario_id: body.funcionario_id
      });
      reply.code(201);
      reply.type("application/json");
      return { pessoa };
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

  app.put("/equipe-pessoas/:equipe_pessoa_id", { schema: equipePessoaPutSchema }, async (req, reply) => {
    try {
      const params = req.params as { equipe_pessoa_id?: string };
      const body = parseJsonBody(req);
      const pessoa = await alterarEquipePessoa(params.equipe_pessoa_id, {
        equipe_id: body.equipe_id,
        funcionario_id: body.funcionario_id
      });
      if (!pessoa) {
        reply.code(404);
        return { error: "Pessoa da equipe não encontrada" };
      }
      reply.type("application/json");
      return { pessoa };
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

  app.delete(
    "/equipe-pessoas/:equipe_pessoa_id",
    { schema: equipePessoaDeleteSchema },
    async (req, reply) => {
      try {
        const params = req.params as { equipe_pessoa_id?: string };
        const deleted = await removerEquipePessoa(params.equipe_pessoa_id);
        if (!deleted) {
          reply.code(404);
          return { error: "Pessoa da equipe não encontrada" };
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
    }
  );
}
