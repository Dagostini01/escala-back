import * as XLSX from "xlsx";

export type ParsedSheet = {
  header: string[];
  rows: (string | number)[][];
};

export function parseXlsx(buffer: Buffer): ParsedSheet {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(
    sheet,
    { header: 1, defval: "" }
  );
  const header = ((rows[0] ?? []) as (string | number)[])
    .map((h) => String(h).trim().toLowerCase());
  return { header, rows: rows as (string | number)[][] };
}
