import {
  listBasesOperacionais,
  listFuncionariosPorCargo,
  type BaseOperacionalRow,
  type FuncionarioPorCargoRow
} from "../repository/catalogoRepo";

function validarInteiroPositivo(value: unknown, erro: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(erro);
  return n;
}

export async function listarBasesOperacionais(): Promise<BaseOperacionalRow[]> {
  return listBasesOperacionais();
}

export async function listarFuncionariosPorCargo(
  idFilial: unknown,
  idCargo: unknown
): Promise<FuncionarioPorCargoRow[]> {
  const filial = validarInteiroPositivo(idFilial, "ID_FILIAL_INVALIDO");
  const cargo = validarInteiroPositivo(idCargo, "ID_CARGO_INVALIDO");
  return listFuncionariosPorCargo(filial, cargo);
}
