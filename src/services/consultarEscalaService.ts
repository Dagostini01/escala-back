import {
  listPessoasEscaladas,
  listSituacaoEscalas,
  type ConsultarEscalaRow
} from "../repository/consultarEscalaRepo";

function validarInteiroPositivo(value: unknown, erro: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(erro);
  return n;
}

export async function listarSituacaoEscalas(): Promise<ConsultarEscalaRow[]> {
  return listSituacaoEscalas();
}

export async function listarPessoasEscaladas(idOrdemServico: unknown): Promise<ConsultarEscalaRow[]> {
  return listPessoasEscaladas(validarInteiroPositivo(idOrdemServico, "ID_ORDEMSERVICO_INVALIDO"));
}
