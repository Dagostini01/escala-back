import { getPool, sql } from "../db";

export type EligibleFreelancerRow = {
  id_funcionario: number;
  nome: string;
  cpf: string;
  celular: string;
  telefone: string;
  classificacao: string | null;
  media_avaliacoes: number;
  frequencia_real: number;
  taxa_resposta: number;
  ranking_score: number;
  bloqueado_ate: Date | null;
};

export async function listEligibleFreelancers(idFilial: number, idCargo = 13): Promise<EligibleFreelancerRow[]> {
  const pool = await getPool();
  const query = `
    SELECT 
      f.ID_FUNCIONARIO AS id_funcionario,
      f.NOME AS nome,
      f.CPF AS cpf,
      f.CELULAR AS celular,
      f.TELEFONE AS telefone,
      CASE WHEN f.compartilha_gps = 0 THEN CONCAT(COALESCE(NULLIF(TRIM(f.classificacao), ''), 'C'), '-') ELSE f.classificacao END AS classificacao,
      COALESCE(TRY_CONVERT(float, f.media_avaliacoes), 0.0) AS media_avaliacoes,
      COALESCE(TRY_CONVERT(float, f.frequencia_real), 0.0) AS frequencia_real,
      COALESCE(TRY_CONVERT(float, f.taxa_resposta), 0.0) AS taxa_resposta,
      COALESCE(TRY_CONVERT(float, f.ranking_score), 0.0) AS ranking_score,
      f.bloqueado_ate
    FROM dbo.t2_funcionarios f
    INNER JOIN (
      SELECT 
        id_funcionario,
        id_filial,
        ROW_NUMBER() OVER (PARTITION BY id_funcionario ORDER BY id_funcionario) AS rn
      FROM dbo.t3_funcionarios_filiais
      WHERE id_filial = @id_filial
    ) ff ON ff.id_funcionario = f.ID_FUNCIONARIO AND ff.rn = 1
    WHERE f.ID_CARGO = @id_cargo
      AND ISNULL(f.INATIVO, 'N') = 'N'
      AND (f.bloqueado_ate IS NULL OR f.bloqueado_ate < SYSUTCDATETIME())
  `;

  const r = await pool.request()
    .input("id_filial", sql.Int, idFilial)
    .input("id_cargo", sql.Int, idCargo)
    .query<EligibleFreelancerRow>(query);

  return r.recordset ?? [];
}
