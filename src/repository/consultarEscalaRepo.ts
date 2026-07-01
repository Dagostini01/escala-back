import { sql, getPool } from "../db";

export type ConsultarEscalaRow = Record<string, unknown>;

export async function listSituacaoEscalas(): Promise<ConsultarEscalaRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<ConsultarEscalaRow>("SELECT * FROM dbo.VIEW_ESCALA_SITUACAO_ESCALAS");
  return result.recordset ?? [];
}

export async function listPessoasEscaladas(idOrdemServico: number): Promise<ConsultarEscalaRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id_ordemservico", sql.Int, idOrdemServico)
    .query<ConsultarEscalaRow>(
      "SELECT * FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS WHERE id_ordemservico = @id_ordemservico"
    );
  return result.recordset ?? [];
}
