import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { login, logout, registrarUsuario, validarToken } from "../../services/authService";
import {
  authLoginSchema,
  authLogoutSchema,
  authMeSchema,
  authRegisterSchema
} from "../../schemas/routes";

function parseJsonBody(req: { body: unknown }): Record<string, unknown> {
  if (typeof req.body === "object" && req.body !== null && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  return {};
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m ? m[1].trim() : null;
}

export default async function registerAuth(app: FastifyInstance) {
  app.post("/auth/register", { schema: authRegisterSchema }, async (req, reply) => {
    try {
      const body = parseJsonBody(req);
      const result = await registrarUsuario({
        email: String(body.email ?? ""),
        senha: String(body.senha ?? ""),
        confirmar_senha: String(body.confirmar_senha ?? "")
      });
      reply.code(201);
      reply.type("application/json");
      return { usuario: result };
    } catch (err) {
      const code = (err as Error).message;
      if (code === "EMAIL_INVALIDO") {
        reply.code(400);
        return { error: "E-mail inválido" };
      }
      if (code === "SENHA_OBRIGATORIA") {
        reply.code(400);
        return { error: "Senha é obrigatória" };
      }
      if (code === "SENHAS_DIFERENTES") {
        reply.code(400);
        return { error: "Senha e confirmação não conferem" };
      }
      if (code === "EMAIL_JA_CADASTRADO") {
        reply.code(409);
        return { error: "E-mail já cadastrado" };
      }
      const correlation_id = randomUUID();
      reply.code(500);
      return { message: "Falha interna", details: { correlation_id } };
    }
  });

  app.post("/auth/login", { schema: authLoginSchema }, async (req, reply) => {
    try {
      const body = parseJsonBody(req);
      const result = await login({
        email: String(body.email ?? ""),
        senha: String(body.senha ?? "")
      });
      reply.type("application/json");
      return result;
    } catch (err) {
      const code = (err as Error).message;
      if (code === "CREDENCIAIS_INVALIDAS") {
        reply.code(401);
        return { error: "E-mail ou senha incorretos" };
      }
      const correlation_id = randomUUID();
      reply.code(500);
      return { message: "Falha interna", details: { correlation_id } };
    }
  });

  app.post("/auth/logout", { schema: authLogoutSchema }, async (req, reply) => {
    try {
      const token = bearerToken(req.headers.authorization);
      if (!token) {
        reply.code(401);
        return { error: "Token ausente. Use Authorization: Bearer <token>" };
      }
      await logout(token);
      reply.type("application/json");
      return { ok: true };
    } catch (err) {
      const code = (err as Error).message;
      if (code === "TOKEN_OBRIGATORIO") {
        reply.code(400);
        return { error: "Token obrigatório" };
      }
      const correlation_id = randomUUID();
      reply.code(500);
      return { message: "Falha interna", details: { correlation_id } };
    }
  });

  app.get("/auth/me", { schema: authMeSchema }, async (req, reply) => {
    try {
      const token = bearerToken(req.headers.authorization);
      if (!token) {
        reply.code(401);
        return { error: "Não autenticado" };
      }
      const sessao = await validarToken(token);
      if (!sessao) {
        reply.code(401);
        return { error: "Sessão inválida ou expirada" };
      }
      reply.type("application/json");
      return { usuario: { email: sessao.email } };
    } catch {
      const correlation_id = randomUUID();
      reply.code(500);
      return { message: "Falha interna", details: { correlation_id } };
    }
  });
}
