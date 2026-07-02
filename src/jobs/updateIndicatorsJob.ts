import { getPool, sql } from "../db";

export async function updateIndicators(): Promise<void> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const updateScript = `
      -- 1. Aggregates
      WITH Aggregates AS (
        SELECT 
          id_funcionario,
          SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') OR faltou = 'S' OR Presenca = 'FALTOU' THEN 1 ELSE 0 END) as total_escalas,
          SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') THEN 1 ELSE 0 END) as qpresencas,
          SUM(CASE WHEN atrasou = 'S' THEN 1 ELSE 0 END) as qatrasos,
          SUM(CASE WHEN faltou = 'S' OR Presenca = 'FALTOU' THEN 1 ELSE 0 END) as qfaltas
        FROM dbo.VIEW_OS_PESSOAS
        WHERE id_funcionario IS NOT NULL
        GROUP BY id_funcionario
      ),
      -- 2. Average last 3 APH
      LastWorks AS (
        SELECT 
          id_funcionario,
          APH,
          ROW_NUMBER() OVER (PARTITION BY id_funcionario ORDER BY dia DESC) as rn
        FROM dbo.VIEW_OS_PESSOAS
        WHERE Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') AND TRY_CONVERT(float, APH) > 0
      ),
      AvgLast3 AS (
        SELECT 
          id_funcionario,
          AVG(TRY_CONVERT(float, APH)) as avg_aph
        FROM LastWorks
        WHERE rn <= 3
        GROUP BY id_funcionario
      )
      -- A. Update evaluation table (existing rows)
      UPDATE fa
      SET 
        fa.media_pecas_hora = COALESCE(av.avg_aph, fa.media_pecas_hora, 0.0),
        fa.qtde_presencas = COALESCE(agg.qpresencas, fa.qtde_presencas, 0),
        fa.qtde_atrasos = COALESCE(agg.qatrasos, fa.qtde_atrasos, 0),
        fa.qtde_faltas = COALESCE(agg.qfaltas, fa.qtde_faltas, 0)
      FROM dbo.ESCALA_funcionarios_avaliacao fa
      INNER JOIN Aggregates agg ON agg.id_funcionario = fa.id_funcionario
      LEFT JOIN AvgLast3 av ON av.id_funcionario = fa.id_funcionario;
    `;

    const resEval = await new sql.Request(tx).query(updateScript);
    console.log(`[updateIndicatorsJob] Updated ${resEval.rowsAffected[0]} rows in ESCALA_funcionarios_avaliacao.`);

    const insertScript = `
      WITH Aggregates AS (
        SELECT 
          id_funcionario,
          SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') OR faltou = 'S' OR Presenca = 'FALTOU' THEN 1 ELSE 0 END) as total_escalas,
          SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') THEN 1 ELSE 0 END) as qpresencas,
          SUM(CASE WHEN atrasou = 'S' THEN 1 ELSE 0 END) as qatrasos,
          SUM(CASE WHEN faltou = 'S' OR Presenca = 'FALTOU' THEN 1 ELSE 0 END) as qfaltas
        FROM dbo.VIEW_OS_PESSOAS
        WHERE id_funcionario IS NOT NULL
        GROUP BY id_funcionario
      ),
      LastWorks AS (
        SELECT 
          id_funcionario,
          APH,
          ROW_NUMBER() OVER (PARTITION BY id_funcionario ORDER BY dia DESC) as rn
        FROM dbo.VIEW_OS_PESSOAS
        WHERE Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') AND TRY_CONVERT(float, APH) > 0
      ),
      AvgLast3 AS (
        SELECT 
          id_funcionario,
          AVG(TRY_CONVERT(float, APH)) as avg_aph
        FROM LastWorks
        WHERE rn <= 3
        GROUP BY id_funcionario
      )
      -- B. Insert missing evaluation rows
      INSERT INTO dbo.ESCALA_funcionarios_avaliacao (
        id_funcionario, media_pecas_hora, qtde_presencas, qtde_atrasos, qtde_faltas,
        qtde_convites, qtde_aceites, qtde_declinios
      )
      SELECT 
        agg.id_funcionario,
        COALESCE(av.avg_aph, 0.0),
        agg.qpresencas,
        agg.qatrasos,
        agg.qfaltas,
        0, 0, 0
      FROM Aggregates agg
      LEFT JOIN AvgLast3 av ON av.id_funcionario = agg.id_funcionario
      LEFT JOIN dbo.ESCALA_funcionarios_avaliacao fa ON fa.id_funcionario = agg.id_funcionario
      WHERE fa.id_funcionario IS NULL;
    `;

    const resInsert = await new sql.Request(tx).query(insertScript);
    if (resInsert.rowsAffected[0] > 0) {
      console.log(`[updateIndicatorsJob] Inserted ${resInsert.rowsAffected[0]} missing rows in ESCALA_funcionarios_avaliacao.`);
    }

    const updateFuncScript = `
      WITH Aggregates AS (
        SELECT 
          id_funcionario,
          SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') OR faltou = 'S' OR Presenca = 'FALTOU' THEN 1 ELSE 0 END) as total_escalas,
          SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') THEN 1 ELSE 0 END) as qpresencas,
          SUM(CASE WHEN atrasou = 'S' THEN 1 ELSE 0 END) as qatrasos,
          SUM(CASE WHEN faltou = 'S' OR Presenca = 'FALTOU' THEN 1 ELSE 0 END) as qfaltas
        FROM dbo.VIEW_OS_PESSOAS
        WHERE id_funcionario IS NOT NULL
        GROUP BY id_funcionario
      ),
      LastWorks AS (
        SELECT 
          id_funcionario,
          APH,
          ROW_NUMBER() OVER (PARTITION BY id_funcionario ORDER BY dia DESC) as rn
        FROM dbo.VIEW_OS_PESSOAS
        WHERE Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') AND TRY_CONVERT(float, APH) > 0
      ),
      AvgLast3 AS (
        SELECT 
          id_funcionario,
          AVG(TRY_CONVERT(float, APH)) as avg_aph
        FROM LastWorks
        WHERE rn <= 3
        GROUP BY id_funcionario
      )
      -- C. Update t2_funcionarios
      UPDATE f
      SET 
        f.frequencia_real = COALESCE(CAST(CAST(agg.qpresencas AS float) / NULLIF(agg.total_escalas, 0) AS decimal(5,4)), 0.0),
        f.ranking_score = COALESCE(CAST((CAST(agg.qpresencas AS float) / NULLIF(agg.total_escalas, 0) * 5) + 
                           ((CASE WHEN av.avg_aph > 1000 THEN 1000 ELSE av.avg_aph END) / 1000 * 5) AS decimal(5,2)), 0.0)
      FROM dbo.t2_funcionarios f
      INNER JOIN Aggregates agg ON agg.id_funcionario = f.ID_FUNCIONARIO
      LEFT JOIN AvgLast3 av ON av.id_funcionario = f.ID_FUNCIONARIO
      WHERE ISNULL(f.INATIVO, 'N') = 'N';
    `;

    const resFunc = await new sql.Request(tx).query(updateFuncScript);
    console.log(`[updateIndicatorsJob] Updated ${resFunc.rowsAffected[0]} rows in t2_funcionarios.`);

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    console.error("[updateIndicatorsJob] Error updating indicators:", err);
  }
}

let jobTimeout: NodeJS.Timeout | null = null;

export function startUpdateIndicatorsJob(targetHour = 2): void {
  if (jobTimeout) return;

  const scheduleNextRun = () => {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(targetHour, 0, 0, 0);

    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delay = nextRun.getTime() - now.getTime();
    console.log(`[updateIndicatorsJob] Next run scheduled in ${(delay / 1000 / 60).toFixed(2)} minutes, at ${nextRun.toLocaleString()}`);

    jobTimeout = setTimeout(async () => {
      try {
        console.log("[updateIndicatorsJob] Starting daily indicators update...");
        await updateIndicators();
        console.log("[updateIndicatorsJob] Daily indicators update completed successfully.");
      } catch (err) {
        console.error("[updateIndicatorsJob] Daily job execution failed:", err);
      } finally {
        jobTimeout = null;
        scheduleNextRun();
      }
    }, delay);
  };

  // Run once immediately on startup
  void updateIndicators();

  scheduleNextRun();
}
