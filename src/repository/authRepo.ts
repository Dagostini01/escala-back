import { randomUUID } from "crypto";
import { AUTH_TBL_SESSAO, AUTH_TBL_USUARIO } from "../constants/authTables";
import { sql, getPool } from "../db";

export type UsuarioRow = {
  id: string;
  email: string;
  senha: string;
};

export async function findUsuarioByEmail(email: string): Promise<UsuarioRow | null> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("email", sql.NVarChar(255), email)
    .query<UsuarioRow>(
      `SELECT CAST(id AS NVARCHAR(36)) AS id, email, senha FROM ${AUTH_TBL_USUARIO} WHERE email = @email`
    );
  const row = r.recordset[0];
  return row ?? null;
}

export async function insertUsuario(email: string, senha: string): Promise<string> {
  const id = randomUUID();
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("email", sql.NVarChar(255), email)
    .input("senha", sql.NVarChar(4000), senha)
    .query(
      `INSERT INTO ${AUTH_TBL_USUARIO} (id, email, senha) VALUES (@id, @email, @senha)`
    );
  return id;
}

export async function insertSessao(idUsuario: string, token: string, expiraEm: Date): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, randomUUID())
    .input("id_usuario", sql.UniqueIdentifier, idUsuario)
    .input("token", sql.NVarChar(64), token)
    .input("expira_em", sql.DateTime2, expiraEm)
    .query(
      `INSERT INTO ${AUTH_TBL_SESSAO} (id, id_usuario, token, expira_em) VALUES (@id, @id_usuario, @token, @expira_em)`
    );
}

export type SessaoUsuarioRow = {
  id_usuario: string;
  email: string;
  perfil: string;
};

export async function findSessaoValidaPorToken(token: string): Promise<SessaoUsuarioRow | null> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("token", sql.NVarChar(64), token)
    .query<SessaoUsuarioRow>(
      `SELECT CAST(u.id AS NVARCHAR(36)) AS id_usuario, u.email, u.perfil ` +
        `FROM ${AUTH_TBL_SESSAO} s ` +
        `INNER JOIN ${AUTH_TBL_USUARIO} u ON u.id = s.id_usuario ` +
        `WHERE s.token = @token AND s.expira_em > SYSUTCDATETIME()`
    );
  return r.recordset[0] ?? null;
}

export async function deleteSessaoPorToken(token: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("token", sql.NVarChar(64), token)
    .query(`DELETE FROM ${AUTH_TBL_SESSAO} WHERE token = @token`);
}

/** Confere se as tabelas de auth existem em `dbo` (útil após criar no Azure). */
export async function verificarTabelasAuth(): Promise<boolean> {
  const pool = await getPool();
  const r = await pool.request().query<{ ok: number }>(
    `SELECT CASE WHEN EXISTS (
      SELECT 1 FROM sys.tables t WHERE t.name = N'ESCALA_api_usuario' AND t.schema_id = SCHEMA_ID(N'dbo')
    ) AND EXISTS (
      SELECT 1 FROM sys.tables t WHERE t.name = N'ESCALA_api_sessao' AND t.schema_id = SCHEMA_ID(N'dbo')
    ) THEN 1 ELSE 0 END AS ok`
  );
  const row = r.recordset[0];
  return row !== undefined && Number(row.ok) === 1;
}
