import { sql, getPool } from "../db";
import type { ImportRow } from "../validation/importValidation";

export async function insertBatch(rows: ImportRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const stmt =
    "INSERT INTO dbo.ESCALA_carga_escala_transito (" +
      "id_ordemservico, id_funcionario, cpf_funcionario, avaliado, escalado, observacao, forabase, disponibilidade" +
    ") VALUES (" +
      "TRY_CONVERT(int, @id_ordemservico), " +
      "TRY_CONVERT(int, @id_funcionario), " +
      "@cpf_funcionario, " +
      "0, 0, NULL, 0, 0" +
    ")";
  let inserted = 0;
  try {
    for (const r of rows) {
      await new sql.Request(tx)
        .input("id_ordemservico", sql.VarChar(50), r.id_ordemservico)
        .input("id_funcionario", sql.VarChar(50), r.id_funcionario)
        .input("cpf_funcionario", sql.VarChar(50), r.cpf_funcionario)
        .query(stmt);
      inserted++;
    }
    await tx.commit();
    return inserted;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
