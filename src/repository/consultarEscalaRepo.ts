import { sql, getPool } from "../db";

export type ConsultarEscalaRow = Record<string, unknown>;

export async function listSituacaoEscalas(): Promise<ConsultarEscalaRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<ConsultarEscalaRow>(`
      SELECT 
        v.*,
        COALESCE(eo.id_filial, so.id_filial) AS id_filial,
        COALESCE(eo.usar_ponto_encontro, 0) AS usar_ponto_encontro,
        CAST(eo.id_ponto_encontro AS NVARCHAR(36)) AS id_ponto_encontro,
        CASE 
          WHEN v.pct_completamento >= 100 THEN 'Completa'
          WHEN eo.tipo_completamento_ultimo = 'Montagem Automática em Andamento' THEN 'Montagem Automática em Andamento'
          WHEN eo.tipo_completamento_ultimo = 'Sorteio' THEN 'Sorteio'
          ELSE 'Incompleta'
        END AS status_escala,
        (
          SELECT STRING_AGG(COALESCE(p.funcionario_nome, CONCAT('ID ', p.id_funcionario)), ', ')
          FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS p
          WHERE p.id_ordemservico = v.numero_os
        ) AS nomes_realizados,
        (
          SELECT STRING_AGG(COALESCE(p.funcionario_nome, CONCAT('ID ', p.id_funcionario)), ', ')
          FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS p
          WHERE p.id_ordemservico = v.numero_os 
            AND p.status_pessoa IN ('CONVIDADA', 'CONVITE VISUALIZADO')
        ) AS nomes_pendentes,
        (
          SELECT STRING_AGG(COALESCE(p.funcionario_nome, CONCAT('ID ', p.id_funcionario)), ', ')
          FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS p
          WHERE p.id_ordemservico = v.numero_os 
            AND p.status_pessoa IN ('CONVITE RECUSADO', 'DECLINADA SGS', 'DECLINADA APÓS ACEITE')
        ) AS nomes_recusados
      FROM dbo.VIEW_ESCALA_SITUACAO_ESCALAS v
      LEFT JOIN dbo.ESCALA_ordemservico eo ON eo.id_ordemservico = v.numero_os
      LEFT JOIN dbo.t2_ordemservico so ON so.id_ordemservico = v.numero_os
    `);
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
