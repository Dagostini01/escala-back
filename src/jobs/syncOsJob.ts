import { getPool, sql } from "../db";

export async function syncOs(): Promise<void> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1. Inserir novas OSs (que existem em t2_ordemservico mas não em ESCALA_ordemservico)
    // Usamos INNER JOIN com t2_funcionarios para trazer o nome do coordenador se existir.
    const insertQuery = `
      INSERT INTO dbo.ESCALA_ordemservico (
        id_ordemservico, id_cliente, id_cliente_filial, dia, hora_chegada, hora_saida,
        dia_semana, coordenador, pecas_previstas, id_status_ordemservico, id_filial,
        lista, lista_enviada, media_pecas, qtde_inventariantes, id_periodo, observacao,
        status_inventario, houve_alteracao, datahora_alteracao, qtde_pessoas_escaladas,
        qtde_pessoas_convidadas, qtde_pessoas_recusadas, qtde_pessoas_removidas,
        escala_verificada, status_escala, tipo_completamento_primeiro, tipo_completamento_ultimo,
        verificar_OS, OS_nova, raio_tolerancia_metros,
        usuario_primeira_escala, datahora_primeira_escala,
        datahora_ultima_alteracao_escala, usuario_ultima_alteracao_escala
      )
      SELECT 
        a.id_ordemservico,
        a.id_cliente,
        ISNULL(a.id_cliente_filial, 0),
        a.dia,
        COALESCE(TRY_CONVERT(datetime, a.hora_chegada), a.dia),
        COALESCE(TRY_CONVERT(datetime, a.hora_saida), a.dia),
        a.dia_semana,
        COALESCE(f.NOME, 'Não definido'),
        COALESCE(TRY_CONVERT(int, a.pecas_previstas), 0),
        a.id_status_ordemservico,
        a.id_filial,
        CASE WHEN a.lista = 'S' THEN 1 ELSE 0 END,
        CASE WHEN a.lista_enviada = 'S' THEN 1 ELSE 0 END,
        COALESCE(TRY_CONVERT(int, a.media_pecas), 0),
        a.qtde_inventariantes,
        a.id_periodo,
        COALESCE(a.observacao, ''),
        COALESCE(a.status_inventario, 0),
        0, -- houve_alteracao
        SYSUTCDATETIME(), -- datahora_alteracao
        0, -- qtde_pessoas_escaladas
        0, -- qtde_pessoas_convidadas
        0, -- qtde_pessoas_recusadas
        0, -- qtde_pessoas_removidas
        0, -- escala_verificada
        0, -- status_escala
        '', -- tipo_completamento_primeiro
        '', -- tipo_completamento_ultimo
        1, -- verificar_OS
        1, -- OS_nova
        100, -- raio_tolerancia_metros
        'Sistema', -- usuario_primeira_escala
        SYSUTCDATETIME(), -- datahora_primeira_escala
        SYSUTCDATETIME(), -- datahora_ultima_alteracao_escala
        'Sistema' -- usuario_ultima_alteracao_escala
      FROM dbo.t2_ordemservico a
      LEFT JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = a.coordenador
      LEFT JOIN dbo.ESCALA_ordemservico b ON b.id_ordemservico = a.id_ordemservico
      WHERE b.id_ordemservico IS NULL
    `;

    const insertResult = await new sql.Request(tx).query(insertQuery);
    if (insertResult.rowsAffected[0] > 0) {
      console.log(`[syncOsJob] Inseridas ${insertResult.rowsAffected[0]} novas OSs em ESCALA_ordemservico.`);
    }

    // 2. Atualizar OSs existentes com alteração de escopo (Data, qtde_inventariantes ou pecas_previstas)
    const updateQuery = `
      UPDATE b
      SET 
        b.dia = a.dia,
        b.qtde_inventariantes = a.qtde_inventariantes,
        b.pecas_previstas = COALESCE(TRY_CONVERT(int, a.pecas_previstas), 0),
        b.verificar_OS = 1,
        b.houve_alteracao = 1,
        b.datahora_alteracao = SYSUTCDATETIME()
      FROM dbo.ESCALA_ordemservico b
      INNER JOIN dbo.t2_ordemservico a ON a.id_ordemservico = b.id_ordemservico
      WHERE b.dia <> a.dia
         OR b.qtde_inventariantes <> a.qtde_inventariantes
         OR b.pecas_previstas <> COALESCE(TRY_CONVERT(int, a.pecas_previstas), 0)
    `;

    const updateResult = await new sql.Request(tx).query(updateQuery);
    if (updateResult.rowsAffected[0] > 0) {
      console.log(`[syncOsJob] Atualizadas ${updateResult.rowsAffected[0]} OSs devido a alterações de escopo.`);
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    console.error("[syncOsJob] Erro na sincronização das OSs:", err);
  }
}

let syncInterval: NodeJS.Timeout | null = null;

export function startSyncOsJob(intervalMs: number = 5 * 60 * 1000): void {
  if (syncInterval) return;
  console.log(`[syncOsJob] Iniciando job de batimento de OS a cada ${intervalMs / 1000}s.`);
  
  // Executa uma vez imediatamente
  void syncOs();

  syncInterval = setInterval(() => {
    void syncOs();
  }, intervalMs);
}

export function stopSyncOsJob(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("[syncOsJob] Job de batimento de OS finalizado.");
  }
}
