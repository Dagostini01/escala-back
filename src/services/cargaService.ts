import { limparCargaEscala } from "../repository/escalaCargaRepo";

export async function limparCarga(): Promise<void> {
  await limparCargaEscala();
}
