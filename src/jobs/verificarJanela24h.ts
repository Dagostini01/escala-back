import { getPool, sql } from "../db";
import { randomUUID } from "crypto";

export async function verificarEscalasProximas(): Promise<void> {
  const pool = await getPool();
  
  // 1. Busca todas as OSs incompletas (pessoas_escaladas < necessarias) nas próximas 24 horas.
  // Filtramos por escalas cuja datahora de início é nas próximas 24 horas e ainda não estão completas.
  const selectQuery = `
    SELECT 
      eo.id_ordemservico,
      eo.id_filial,
      eo.id_cliente,
      eo.id_cliente_filial,
      eo.dia,
      eo.hora_chegada,
      eo.qtde_inventariantes,
      eo.qtde_pessoas_escaladas
    FROM dbo.ESCALA_ordemservico eo
    WHERE eo.qtde_pessoas_escaladas < eo.qtde_inventariantes
      AND eo.hora_chegada > SYSUTCDATETIME()
      AND eo.hora_chegada <= DATEADD(hour, 24, SYSUTCDATETIME())
      AND eo.tipo_completamento_ultimo <> 'Sorteio'
  `;

  try {
    const checkResult = await pool.request().query(selectQuery);
    const osList = checkResult.recordset;

    if (osList.length === 0) return;

    console.log(`[janela24hJob] Encontrada(s) ${osList.length} OS(s) incompletas na janela crítica de 24h.`);

    for (const os of osList) {
      console.log(`[janela24hJob] Processando OS ${os.id_ordemservico} (Filial ${os.id_filial}). Transicionando para modo Sorteio.`);

      const tx = new sql.Transaction(pool);
      await tx.begin();

      try {
        // A. Transiciona a OS para modo Sorteio (Leilão)
        await new sql.Request(tx)
          .input("id_ordemservico", sql.Int, os.id_ordemservico)
          .query(`
            UPDATE dbo.ESCALA_ordemservico 
            SET 
              tipo_completamento_ultimo = 'Sorteio',
              verificar_OS = 1,
              houve_alteracao = 1,
              datahora_alteracao = SYSUTCDATETIME()
            WHERE id_ordemservico = @id_ordemservico
          `);

        // B. Seleciona todos os colaboradores ativos e elegíveis na mesma filial da OS
        // que não estão bloqueados e que não possuem convite ativo ou já escalados para esta mesma OS ou mesma data.
        const freelancersQuery = `
          SELECT DISTINCT f.ID_FUNCIONARIO
          FROM dbo.t2_funcionarios f
          INNER JOIN dbo.t3_funcionarios_filiais ff ON ff.id_funcionario = f.ID_FUNCIONARIO
          LEFT JOIN dbo.ESCALA_ordemservico_funcionarios_convites c 
            ON c.id_funcionario = f.ID_FUNCIONARIO AND c.id_ordemservico = @id_ordemservico
          LEFT JOIN dbo.ESCALA_ordemservico_funcionarios esc
            ON esc.id_funcionario = f.ID_FUNCIONARIO AND esc.id_ordemservico = @id_ordemservico
          WHERE ff.id_filial = @id_filial
            AND f.ID_CARGO = 13 -- Inventariante
            AND ISNULL(f.INATIVO, 'N') = 'N'
            AND (f.bloqueado_ate IS NULL OR f.bloqueado_ate < SYSUTCDATETIME())
            AND c.id_convite IS NULL
            AND esc.id_escala_ordemservico_funcionarios IS NULL
        `;

        const freeResult = await new sql.Request(tx)
          .input("id_ordemservico", sql.Int, os.id_ordemservico)
          .input("id_filial", sql.Int, os.id_filial)
          .query<{ ID_FUNCIONARIO: number }>(freelancersQuery);

        const freelancers = freeResult.recordset;

        if (freelancers.length > 0) {
          console.log(`[janela24hJob] Disparando convites de sorteio para ${freelancers.length} colaboradores na filial ${os.id_filial}.`);
          
          for (const fl of freelancers) {
            const uuid = randomUUID();
            await new sql.Request(tx)
              .input("id_convite", sql.UniqueIdentifier, uuid)
              .input("id_funcionario", sql.Int, fl.ID_FUNCIONARIO)
              .input("id_ordemservico", sql.Int, os.id_ordemservico)
              .input("id_filial", sql.Int, os.id_filial)
              .input("id_cliente_filial", sql.Int, os.id_cliente_filial)
              .input("id_cliente", sql.Int, os.id_cliente)
              .input("validade", sql.DateTime, os.hora_chegada) // Expira no início do inventário
              .query(`
                INSERT INTO dbo.ESCALA_ordemservico_funcionarios_convites (
                  id_convite, id_funcionario, id_ordemservico, id_tipo_convite, 
                  datahora_convite, validade_convite, id_filial, id_cliente_filial, id_cliente,
                  convite_visualizado, convite_aceito, convite_recusado
                ) VALUES (
                  @id_convite, @id_funcionario, @id_ordemservico, 'Sorteio', 
                  SYSUTCDATETIME(), @validade, @id_filial, @id_cliente_filial, @id_cliente,
                  0, 0, 0
                )
              `);
          }
        }

        await tx.commit();
      } catch (err) {
        await tx.rollback();
        console.error(`[janela24hJob] Erro ao processar OS ${os.id_ordemservico}:`, err);
      }
    }
  } catch (err) {
    console.error("[janela24hJob] Erro no job da janela crítica de 24h:", err);
  }
}

let criticalInterval: NodeJS.Timeout | null = null;

export function startJanela24hJob(intervalMs: number = 5 * 60 * 1000): void {
  if (criticalInterval) return;
  console.log(`[janela24hJob] Iniciando job de checagem crítica da janela de 24h a cada ${intervalMs / 1000}s.`);
  
  // Executa uma vez imediatamente
  void verificarEscalasProximas();

  criticalInterval = setInterval(() => {
    void verificarEscalasProximas();
  }, intervalMs);
}

export function stopJanela24hJob(): void {
  if (criticalInterval) {
    clearInterval(criticalInterval);
    criticalInterval = null;
    console.log("[janela24hJob] Job da janela crítica de 24h finalizado.");
  }
}
