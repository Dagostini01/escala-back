import { sql, getPool } from "../db";

export async function runEscalaValidation(): Promise<any[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool).query("EXEC dbo.sp_ESCALA_Valida_Escala_PessoaData");
  return result.recordset ?? [];
}
