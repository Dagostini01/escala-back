import { getPool, sql } from "../db";
import { criarConviteManual } from "./escalaService";

export interface AutoEscalaParams {
  ids_ordemservico: number[];
  min_classificacao: string; // 'A' | 'B' | 'C'
  max_distancia?: number;
  min_presenca?: number;
  max_atraso?: number;
  min_resposta?: number;
  min_aceite?: number;
  mix_percent_a: number;
  mix_percent_b: number;
  mix_percent_c: number;
  percent_backup?: number;
}

export async function processarEscalaAutomatica(params: AutoEscalaParams): Promise<Record<number, { convocados: number; erro?: string }>> {
  const pool = await getPool();
  const results: Record<number, { convocados: number; erro?: string }> = {};

  for (const idOrdemServico of params.ids_ordemservico) {
    try {
      // 1. Obtém dados da OS
      const osResult = await pool.request()
        .input("id_ordemservico", sql.Int, idOrdemServico)
        .query(`
          SELECT id_filial, qtde_inventariantes, qtde_pessoas_escaladas
          FROM dbo.ESCALA_ordemservico
          WHERE id_ordemservico = @id_ordemservico
        `);
      
      const os = osResult.recordset[0];
      if (!os) {
        results[idOrdemServico] = { convocados: 0, erro: "OS não encontrada" };
        continue;
      }

      const vagasNecessarias = os.qtde_inventariantes - os.qtde_pessoas_escaladas;
      if (vagasNecessarias <= 0) {
        results[idOrdemServico] = { convocados: 0, erro: "Vagas já totalmente preenchidas" };
        continue;
      }

      // Atualiza o status da OS para Montagem Automática em Andamento
      await pool.request()
        .input("id_ordemservico", sql.Int, idOrdemServico)
        .query(`
          UPDATE dbo.ESCALA_ordemservico
          SET tipo_completamento_ultimo = 'Montagem Automática em Andamento'
          WHERE id_ordemservico = @id_ordemservico
        `);

      // 2. Calcula as vagas desejadas por classe
      let targetA = Math.round(vagasNecessarias * (params.mix_percent_a / 100));
      let targetB = Math.round(vagasNecessarias * (params.mix_percent_b / 100));
      let targetC = vagasNecessarias - targetA - targetB;
      if (targetC < 0) targetC = 0;

      // 3. Busca todos os colaboradores qualificados e disponíveis para a filial
      // Filtramos pelos índices operacionais gravados na importação
      const minPres = params.min_presenca ? params.min_presenca / 100 : 0.0;
      const maxAtraso = params.max_atraso ? params.max_atraso / 100 : 1.0;
      const minResp = params.min_resposta ? params.min_resposta / 100 : 0.0;

      const queryCandidates = `
        SELECT 
          f.ID_FUNCIONARIO AS id_funcionario,
          CASE WHEN f.compartilha_gps = 0 THEN CONCAT(COALESCE(NULLIF(TRIM(f.classificacao), ''), 'C'), '-') ELSE COALESCE(NULLIF(TRIM(f.classificacao), ''), 'C') END AS classificacao,
          COALESCE(TRY_CONVERT(float, f.ranking_score), 0.0) AS ranking_score,
          COALESCE(f.compartilha_gps, 1) AS compartilha_gps
        FROM dbo.t2_funcionarios f
        INNER JOIN (
          SELECT 
            id_funcionario,
            id_filial,
            ROW_NUMBER() OVER (PARTITION BY id_funcionario ORDER BY id_funcionario) AS rn
          FROM dbo.t3_funcionarios_filiais
          WHERE id_filial = @id_filial
        ) ff ON ff.id_funcionario = f.ID_FUNCIONARIO AND ff.rn = 1
        LEFT JOIN dbo.ESCALA_ordemservico_funcionarios_convites c 
          ON c.id_funcionario = f.ID_FUNCIONARIO AND c.id_ordemservico = @id_ordemservico AND c.convite_recusado = 0
        LEFT JOIN dbo.ESCALA_ordemservico_funcionarios esc
          ON esc.id_funcionario = f.ID_FUNCIONARIO AND esc.id_ordemservico = @id_ordemservico
        WHERE f.ID_CARGO = 13 -- Inventariante
          AND ISNULL(f.INATIVO, 'N') = 'N'
          AND (f.bloqueado_ate IS NULL OR f.bloqueado_ate < SYSUTCDATETIME())
          AND c.id_convite IS NULL
          AND esc.id_escala_ordemservico_funcionarios IS NULL
          AND COALESCE(TRY_CONVERT(float, f.frequencia_real), 1.0) >= @min_presenca
          AND COALESCE(TRY_CONVERT(float, f.taxa_resposta), 1.0) >= @min_resposta
      `;

      const candidatesResult = await pool.request()
        .input("id_ordemservico", sql.Int, idOrdemServico)
        .input("id_filial", sql.Int, os.id_filial)
        .input("min_presenca", sql.Float, minPres)
        .input("min_resposta", sql.Float, minResp)
        .query<{ id_funcionario: number; classificacao: string; ranking_score: number; compartilha_gps: number }>(queryCandidates);

      const allCandidates = candidatesResult.recordset;

      // Auxiliar de ordenação que prioriza compartilhamento de GPS (1 antes do 0) e depois o ranking score
      const sortCandidates = (arr: Array<{ id_funcionario: number; classificacao: string; ranking_score: number; compartilha_gps: number }>) => {
        return [...arr].sort((a, b) => {
          const gpsDiff = (b.compartilha_gps === 0 ? 0 : 1) - (a.compartilha_gps === 0 ? 0 : 1);
          if (gpsDiff !== 0) return gpsDiff;
          return b.ranking_score - a.ranking_score;
        });
      };

      // Classifica os candidatos em baldes por classificação
      const listA = sortCandidates(allCandidates.filter(c => c.classificacao.toUpperCase().trim().startsWith("A")));
      const listB = sortCandidates(allCandidates.filter(c => c.classificacao.toUpperCase().trim().startsWith("B")));
      const listC = sortCandidates(allCandidates.filter(c => c.classificacao.toUpperCase().trim().startsWith("C") || c.classificacao.toUpperCase().trim().startsWith("AUX")));

      // Algoritmo de seleção respeitando o mix e aplicando fallback em caso de falta de estoque
      const selectedIds: number[] = [];

      // Seleção Classe A
      const selectedA = listA.slice(0, targetA);
      selectedIds.push(...selectedA.map(c => c.id_funcionario));
      let missingA = targetA - selectedA.length;

      // Seleção Classe B
      const selectedB = listB.slice(0, targetB + missingA); // Caso falte A, tentamos compensar em B
      selectedIds.push(...selectedB.map(c => c.id_funcionario));
      let missingB = (targetB + missingA) - selectedB.length;

      // Seleção Classe C
      const selectedC = listC.slice(0, targetC + missingB); // Caso falte B, tentamos compensar em C
      selectedIds.push(...selectedC.map(c => c.id_funcionario));
      let missingC = (targetC + missingB) - selectedC.length;

      // Se ainda assim faltar gente e tiver sobrado Classe A ou B no estoque, tentamos pegar o que sobrou
      if (missingC > 0) {
        const remainingA = listA.slice(selectedA.length);
        const selectedExtraA = remainingA.slice(0, missingC);
        selectedIds.push(...selectedExtraA.map(c => c.id_funcionario));
        missingC -= selectedExtraA.length;
      }
      if (missingC > 0) {
        const remainingB = listB.slice(selectedB.length);
        const selectedExtraB = remainingB.slice(0, missingC);
        selectedIds.push(...selectedExtraB.map(c => c.id_funcionario));
      }

      // Seleciona candidatos adicionais para backup caso configurado
      const percentBackup = params.percent_backup || 0;
      const backupVagas = percentBackup > 0 ? Math.ceil(os.qtde_inventariantes * (percentBackup / 100)) : 0;
      
      const remainingAll = sortCandidates(allCandidates.filter(c => !selectedIds.includes(c.id_funcionario)));
      const backupIds = remainingAll.slice(0, backupVagas).map(c => c.id_funcionario);

      // 4. Executa os convites para a lista selecionada (regulares)
      let convCount = 0;
      for (const idFunc of selectedIds) {
        try {
          await criarConviteManual(idOrdemServico, idFunc, false);
          convCount++;
        } catch (convErr) {
          console.error(`[autoEscalaService] Erro ao convidar ${idFunc} na OS ${idOrdemServico}:`, convErr);
        }
      }

      // Executa os convites para backups
      for (const idFunc of backupIds) {
        try {
          await criarConviteManual(idOrdemServico, idFunc, true);
          convCount++;
        } catch (convErr) {
          console.error(`[autoEscalaService] Erro ao convidar backup ${idFunc} na OS ${idOrdemServico}:`, convErr);
        }
      }

      results[idOrdemServico] = { convocados: convCount };

    } catch (err) {
      console.error(`[autoEscalaService] Falha na auto-escala da OS ${idOrdemServico}:`, err);
      results[idOrdemServico] = { convocados: 0, erro: (err as Error).message };
    }
  }

  return results;
}
