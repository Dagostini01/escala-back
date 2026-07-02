import type { FastifyInstance } from "fastify";
import { getPool, sql } from "../../db";
import { validarToken } from "../../services/authService";
import { randomUUID } from "crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function checkGestor(req: any, reply: any) {
  const auth = req.headers.authorization;
  if (!auth) {
    reply.code(401);
    throw new Error("UNAUTHORIZED");
  }
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const token = match ? match[1].trim() : null;
  if (!token) {
    reply.code(401);
    throw new Error("UNAUTHORIZED");
  }
  const sessao = await validarToken(token);
  if (!sessao) {
    reply.code(401);
    throw new Error("UNAUTHORIZED");
  }
  if (sessao.perfil !== "gestor") {
    reply.code(403);
    throw new Error("FORBIDDEN");
  }
  return sessao;
}

export default async function registerUsuarios(app: FastifyInstance) {
  // 1. GET /api/usuarios
  app.get("/api/usuarios", async (req, reply) => {
    try {
      await checkGestor(req, reply);
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT 
          CAST(id AS NVARCHAR(36)) AS id, 
          email, 
          perfil, 
          criado_em 
        FROM dbo.ESCALA_api_usuario
        ORDER BY email ASC
      `);
      return { rows: result.recordset ?? [] };
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") return { error: "Não autorizado" };
      if (err.message === "FORBIDDEN") return { error: "Acesso negado. Apenas Gestores podem acessar." };
      console.error(err);
      reply.code(500);
      return { error: "Erro ao listar usuários" };
    }
  });

  // 2. POST /api/usuarios
  app.post("/api/usuarios", async (req, reply) => {
    try {
      await checkGestor(req, reply);
      const { email, senha, perfil } = req.body as { email?: string; senha?: string; perfil?: string };

      if (!email || !EMAIL_RE.test(email)) {
        reply.code(400);
        return { error: "E-mail inválido" };
      }
      if (!senha || senha.trim().length < 4) {
        reply.code(400);
        return { error: "A senha deve ter no mínimo 4 caracteres" };
      }
      if (perfil !== "gestor" && perfil !== "operador") {
        reply.code(400);
        return { error: "Perfil deve ser 'gestor' or 'operador'" };
      }

      const pool = await getPool();
      
      // Verifica e-mail existente
      const checkEmail = await pool.request()
        .input("email", sql.NVarChar(255), email.trim().toLowerCase())
        .query(`SELECT 1 FROM dbo.ESCALA_api_usuario WHERE email = @email`);
      if (checkEmail.recordset.length > 0) {
        reply.code(409);
        return { error: "E-mail já cadastrado" };
      }

      const id = randomUUID();
      await pool.request()
        .input("id", sql.UniqueIdentifier, id)
        .input("email", sql.NVarChar(255), email.trim().toLowerCase())
        .input("senha", sql.NVarChar(4000), senha)
        .input("perfil", sql.VarChar(20), perfil)
        .query(`
          INSERT INTO dbo.ESCALA_api_usuario (id, email, senha, perfil, criado_em)
          VALUES (@id, @email, @senha, @perfil, SYSUTCDATETIME())
        `);

      return { success: true, id };
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") return { error: "Não autorizado" };
      if (err.message === "FORBIDDEN") return { error: "Acesso negado." };
      console.error(err);
      reply.code(500);
      return { error: "Erro ao criar usuário" };
    }
  });

  // 3. PUT /api/usuarios/:id
  app.put("/api/usuarios/:id", async (req, reply) => {
    try {
      await checkGestor(req, reply);
      const { id } = req.params as { id: string };
      const { email, senha, perfil } = req.body as { email?: string; senha?: string; perfil?: string };

      if (!email || !EMAIL_RE.test(email)) {
        reply.code(400);
        return { error: "E-mail inválido" };
      }
      if (perfil !== "gestor" && perfil !== "operador") {
        reply.code(400);
        return { error: "Perfil deve ser 'gestor' or 'operador'" };
      }

      const pool = await getPool();
      
      // Verifica e-mail duplicado
      const checkEmail = await pool.request()
        .input("id", sql.UniqueIdentifier, id)
        .input("email", sql.NVarChar(255), email.trim().toLowerCase())
        .query(`SELECT 1 FROM dbo.ESCALA_api_usuario WHERE email = @email AND id <> @id`);
      if (checkEmail.recordset.length > 0) {
        reply.code(409);
        return { error: "E-mail já cadastrado por outro usuário" };
      }

      if (senha && senha.trim().length > 0) {
        if (senha.trim().length < 4) {
          reply.code(400);
          return { error: "A nova senha deve ter no mínimo 4 caracteres" };
        }
        await pool.request()
          .input("id", sql.UniqueIdentifier, id)
          .input("email", sql.NVarChar(255), email.trim().toLowerCase())
          .input("senha", sql.NVarChar(4000), senha)
          .input("perfil", sql.VarChar(20), perfil)
          .query(`
            UPDATE dbo.ESCALA_api_usuario
            SET email = @email, senha = @senha, perfil = @perfil
            WHERE id = @id
          `);
      } else {
        await pool.request()
          .input("id", sql.UniqueIdentifier, id)
          .input("email", sql.NVarChar(255), email.trim().toLowerCase())
          .input("perfil", sql.VarChar(20), perfil)
          .query(`
            UPDATE dbo.ESCALA_api_usuario
            SET email = @email, perfil = @perfil
            WHERE id = @id
          `);
      }

      return { success: true };
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") return { error: "Não autorizado" };
      if (err.message === "FORBIDDEN") return { error: "Acesso negado." };
      console.error(err);
      reply.code(500);
      return { error: "Erro ao atualizar usuário" };
    }
  });

  // 4. DELETE /api/usuarios/:id
  app.delete("/api/usuarios/:id", async (req, reply) => {
    try {
      const sessao = await checkGestor(req, reply);
      const { id } = req.params as { id: string };

      if (id.toLowerCase() === sessao.id_usuario.toLowerCase()) {
        reply.code(400);
        return { error: "Você não pode excluir seu próprio usuário logado." };
      }

      const pool = await getPool();
      await pool.request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM dbo.ESCALA_api_usuario WHERE id = @id`);

      return { success: true };
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") return { error: "Não autorizado" };
      if (err.message === "FORBIDDEN") return { error: "Acesso negado." };
      console.error(err);
      reply.code(500);
      return { error: "Erro ao excluir usuário" };
    }
  });
}
