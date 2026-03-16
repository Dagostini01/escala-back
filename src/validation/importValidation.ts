export type ColIdx = {
  id_ordemservico: number;
  id_funcionario: number;
  cpf_funcionario: number;
};

export const REQUIRED_HEADERS = [
  "id_ordemservico",
  "id_funcionario",
  "cpf_funcionario"
] as const;

export function validateHeader(header: string[]): ColIdx {
  const idx: ColIdx = {
    id_ordemservico: header.indexOf("id_ordemservico"),
    id_funcionario: header.indexOf("id_funcionario"),
    cpf_funcionario: header.indexOf("cpf_funcionario")
  };
  if (idx.id_ordemservico < 0 || idx.id_funcionario < 0 || idx.cpf_funcionario < 0) {
    throw new Error("INVALID_HEADER");
  }
  return idx;
}

export type ImportRow = {
  id_ordemservico: string;
  id_funcionario: string | null;
  cpf_funcionario: string | null;
};

export function normalizeRow(row: (string | number)[], idx: ColIdx): ImportRow | null {
  const id_ordemservico = String(row[idx.id_ordemservico] ?? "").trim();
  const id_funcionarioRaw = String(row[idx.id_funcionario] ?? "").trim();
  const cpfRaw = String(row[idx.cpf_funcionario] ?? "").trim();
  if (!id_ordemservico) return null;
  const id_funcionario = id_funcionarioRaw ? id_funcionarioRaw : null;
  const cpf_funcionario = cpfRaw ? cpfRaw.replace(/\D+/g, "") : null;
  if (!id_funcionario && !cpf_funcionario) return null;
  return { id_ordemservico, id_funcionario, cpf_funcionario };
}
