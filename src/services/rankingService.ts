import { listEligibleFreelancers, EligibleFreelancerRow } from "../repository/rankingRepo";

export type FreelancerResponse = {
  id_funcionario: number;
  nome: string;
  cpf: string;
  celular: string;
  telefone: string;
  classificacao: string;
  media_avaliacoes: number;
  frequencia_real: number;
  taxa_resposta: number;
  ranking_score: number;
  bloqueado_ate: string | null;
};

export async function getEligibleFreelancers(idFilial: number): Promise<FreelancerResponse[]> {
  const rows = await listEligibleFreelancers(idFilial);

  return rows.map((r) => {
    // Normaliza classificação nula para 'C' e remove possíveis espaços
    const rawClass = (r.classificacao ?? "").trim().toUpperCase();
    const classificacao = rawClass === "" ? "C" : rawClass;

    return {
      id_funcionario: r.id_funcionario,
      nome: r.nome,
      cpf: r.cpf ?? "",
      celular: r.celular ?? "",
      telefone: r.telefone ?? "",
      classificacao,
      media_avaliacoes: r.media_avaliacoes,
      frequencia_real: r.frequencia_real,
      taxa_resposta: r.taxa_resposta,
      ranking_score: r.ranking_score,
      bloqueado_ate: r.bloqueado_ate ? r.bloqueado_ate.toISOString() : null,
    };
  });
}
