import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const baseConfig = {
  user: process.env.SQL_USER as string,
  password: process.env.SQL_PASSWORD as string,
  server: process.env.SQL_SERVER as string,
  database: process.env.SQL_DATABASE as string,
  options: {
    encrypt: String(process.env.SQL_ENCRYPT ?? "true").toLowerCase() === "true",
    trustServerCertificate: false
  }
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool(baseConfig).connect();
  return pool;
}

export { sql };
