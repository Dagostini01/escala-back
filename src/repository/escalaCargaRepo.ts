import { sql, getPool } from "../db";

export async function limparCargaEscala(): Promise<void> {
  const pool = await getPool();
  await new sql.Request(pool).query("EXEC dbo.sp_ESCALA_LimpaCarga");
}
