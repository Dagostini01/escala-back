import type { FastifyReply, FastifyRequest } from "fastify";
import { validarToken } from "../../services/authService";

export type RequestComAuth = FastifyRequest & { auth: { email: string } };

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = req.headers.authorization;
  const m = raw ? /^Bearer\s+(.+)$/i.exec(String(raw).trim()) : null;
  const token = m ? m[1].trim() : "";
  if (!token) {
    reply.code(401);
    await reply.send({ error: "Não autenticado" });
    return;
  }
  const sessao = await validarToken(token);
  if (!sessao) {
    reply.code(401);
    await reply.send({ error: "Sessão inválida ou expirada" });
    return;
  }
  (req as RequestComAuth).auth = { email: sessao.email };
}
