import { getPool, sql } from "../db";

export interface PenalidadeLog {
  id: string;
  id_funcionario: number;
  data_falta: string | null;
  dias_suspensao: number;
  bloqueado_ate: string;
  justificativa: string | null;
  criado_em: string;
}

export async function registrarNoShow(
  idFuncionario: number,
  dataFalta?: Date,
  justificativa?: string
): Promise<PenalidadeLog> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1. Conta o número de faltas anteriores para calcular a progressão
    const countResult = await new sql.Request(tx)
      .input("id_funcionario", sql.Int, idFuncionario)
      .query("SELECT COUNT(*) AS total_faltas FROM dbo.ESCALA_penalidades_logs WHERE id_funcionario = @id_funcionario AND dias_suspensao > 0");

    const totalFaltas = countResult.recordset[0]?.total_faltas ?? 0;
    const n = totalFaltas + 1;

    // Fórmula: 1a falta = 5 dias, reincidências dobram até o teto de 30 dias
    let dias = 5;
    if (n === 2) dias = 10;
    else if (n === 3) dias = 20;
    else if (n >= 4) dias = 30;

    // 2. Calcula data de desbloqueio (SYSUTCDATETIME + dias)
    const blockDateQuery = await new sql.Request(tx)
      .input("dias", sql.Int, dias)
      .query("SELECT DATEADD(day, @dias, SYSUTCDATETIME()) AS bloqueado_ate");
    
    const bloqueadoAte: Date = blockDateQuery.recordset[0].bloqueado_ate;

    // 3. Atualiza campo bloqueado_ate no funcionário
    await new sql.Request(tx)
      .input("id_funcionario", sql.Int, idFuncionario)
      .input("bloqueado_ate", sql.DateTime2, bloqueadoAte)
      .query("UPDATE dbo.t2_funcionarios SET bloqueado_ate = @bloqueado_ate WHERE ID_FUNCIONARIO = @id_funcionario");

    // 4. Insere no log de auditoria
    const insertResult = await new sql.Request(tx)
      .input("id_funcionario", sql.Int, idFuncionario)
      .input("data_falta", sql.DateTime2, dataFalta ?? new Date())
      .input("dias_suspensao", sql.Int, dias)
      .input("bloqueado_ate", sql.DateTime2, bloqueadoAte)
      .input("justificativa", sql.NVarChar(sql.MAX), justificativa ?? "No-Show registrado automaticamente pelo sistema")
      .query(`
        INSERT INTO dbo.ESCALA_penalidades_logs (id_funcionario, data_falta, dias_suspensao, bloqueado_ate, justificativa)
        OUTPUT 
          CAST(inserted.id AS NVARCHAR(36)) AS id,
          inserted.id_funcionario,
          inserted.data_falta,
          inserted.dias_suspensao,
          inserted.bloqueado_ate,
          inserted.justificativa,
          inserted.criado_em
        VALUES (@id_funcionario, @data_falta, @dias_suspensao, @bloqueado_ate, @justificativa)
      `);

    await tx.commit();
    return insertResult.recordset[0];
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function desbloquearFuncionario(
  idFuncionario: number,
  justificativa: string
): Promise<PenalidadeLog> {
  if (!justificativa || justificativa.trim() === "") {
    throw new Error("JUSTIFICATIVA_OBRIGATORIA");
  }

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1. Remove bloqueio do funcionário
    await new sql.Request(tx)
      .input("id_funcionario", sql.Int, idFuncionario)
      .query("UPDATE dbo.t2_funcionarios SET bloqueado_ate = NULL WHERE ID_FUNCIONARIO = @id_funcionario");

    // 2. Insere log de liberação manual (dias_suspensao = 0 para indicar remoção do bloqueio)
    const insertResult = await new sql.Request(tx)
      .input("id_funcionario", sql.Int, idFuncionario)
      .input("dias_suspensao", sql.Int, 0)
      .input("bloqueado_ate", sql.DateTime2, new Date())
      .input("justificativa", sql.NVarChar(sql.MAX), `LIBERAÇÃO MANUAL: ${justificativa.trim()}`)
      .query(`
        INSERT INTO dbo.ESCALA_penalidades_logs (id_funcionario, data_falta, dias_suspensao, bloqueado_ate, justificativa)
        OUTPUT 
          CAST(inserted.id AS NVARCHAR(36)) AS id,
          inserted.id_funcionario,
          inserted.data_falta,
          inserted.dias_suspensao,
          inserted.bloqueado_ate,
          inserted.justificativa,
          inserted.criado_em
        VALUES (@id_funcionario, NULL, @dias_suspensao, @bloqueado_ate, @justificativa)
      `);

    await tx.commit();
    return insertResult.recordset[0];
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function listPenalidadesLogs(idFuncionario?: number): Promise<PenalidadeLog[]> {
  const pool = await getPool();
  const request = pool.request();
  let where = "";
  if (idFuncionario) {
    request.input("id_funcionario", sql.Int, idFuncionario);
    where = " WHERE id_funcionario = @id_funcionario";
  }
  
  const result = await request.query<PenalidadeLog>(`
    SELECT 
      CAST(id AS NVARCHAR(36)) AS id,
      id_funcionario,
      data_falta,
      dias_suspensao,
      bloqueado_ate,
      justificativa,
      criado_em
    FROM dbo.ESCALA_penalidades_logs
    ${where}
    ORDER BY criado_em DESC
  `);
  return result.recordset ?? [];
}
