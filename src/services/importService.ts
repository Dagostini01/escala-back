import { parseXlsx } from "../utils/xlsxParser";
import { validateHeader, normalizeRow, ImportRow } from "../validation/importValidation";
import { insertBatch } from "../repository/escalaRepo";

export async function importExcel(buffer: Buffer): Promise<{ inserted: number; invalid: number }> {
  const parsed = parseXlsx(buffer);
  if (parsed.rows.length < 2) {
    throw new Error("EMPTY_SHEET");
  }
  const idx = validateHeader(parsed.header);
  const valid: ImportRow[] = [];
  let invalid = 0;
  for (let i = 1; i < parsed.rows.length; i++) {
    const row = normalizeRow(parsed.rows[i], idx);
    if (row) valid.push(row);
    else invalid++;
  }
  if (valid.length === 0) {
    throw new Error("NO_VALID_ROWS");
  }
  const inserted = await insertBatch(valid);
  return { inserted, invalid };
}
