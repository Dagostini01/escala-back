import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseMs(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const baseConfig: sql.config = {
  user: process.env.SQL_USER as string,
  password: process.env.SQL_PASSWORD as string,
  server: process.env.SQL_SERVER as string,
  database: process.env.SQL_DATABASE as string,
  port: parsePort(process.env.SQL_PORT),
  connectionTimeout: parseMs(process.env.SQL_CONNECTION_TIMEOUT_MS, 30_000),
  requestTimeout: parseMs(process.env.SQL_REQUEST_TIMEOUT_MS, 30_000),
  pool: {
    max: parseMs(process.env.SQL_POOL_MAX, 10),
    min: parseMs(process.env.SQL_POOL_MIN, 0),
    idleTimeoutMillis: parseMs(process.env.SQL_POOL_IDLE_MS, 30_000)
  },
  options: {
    encrypt: String(process.env.SQL_ENCRYPT ?? "true").toLowerCase() === "true",
    trustServerCertificate:
      String(process.env.SQL_TRUST_SERVER_CERTIFICATE ?? "false").toLowerCase() === "true",
    enableArithAbort: true
  }
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  if (pool) {
    try {
      await pool.close();
    } catch {
      /* reconexão após idle / falha no Azure */
    }
    pool = null;
  }
  pool = await new sql.ConnectionPool(baseConfig).connect();
  return pool;
}

export { sql };
