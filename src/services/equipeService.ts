import {
  deleteEquipe,
  findEquipeById,
  insertEquipe,
  listEquipes,
  updateEquipe,
  type EquipeInput,
  type EquipeRow
} from "../repository/equipeRepo";

export type EquipePayload = {
  coordenador_id: unknown;
  coordenador_nome: unknown;
  equipe_qtde_inventariantes: unknown;
};

function validarIdTexto(id: string): string {
  const value = String(id ?? "").trim();
  if (!value) throw new Error("EQUIPE_ID_OBRIGATORIO");
  return value;
}

function validarInteiroPositivo(value: unknown, erro: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(erro);
  return n;
}

function validarInteiroNaoNegativo(value: unknown, erro: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(erro);
  return n;
}

function validarEquipePayload(input: EquipePayload): EquipeInput {
  const coordenadorNome = String(input.coordenador_nome ?? "").trim();
  if (!coordenadorNome) throw new Error("COORDENADOR_NOME_OBRIGATORIO");
  if (coordenadorNome.length > 500) throw new Error("COORDENADOR_NOME_LONGO");

  return {
    coordenador_id: validarInteiroPositivo(input.coordenador_id, "COORDENADOR_ID_INVALIDO"),
    coordenador_nome: coordenadorNome,
    equipe_qtde_inventariantes: validarInteiroNaoNegativo(
      input.equipe_qtde_inventariantes,
      "EQUIPE_QTDE_INVENTARIANTES_INVALIDA"
    )
  };
}

export async function listarEquipes(): Promise<EquipeRow[]> {
  return listEquipes();
}

export async function buscarEquipe(equipeId: string): Promise<EquipeRow | null> {
  return findEquipeById(validarIdTexto(equipeId));
}

export async function criarEquipe(input: EquipePayload): Promise<EquipeRow> {
  return insertEquipe(validarEquipePayload(input));
}

export async function alterarEquipe(equipeId: string, input: EquipePayload): Promise<EquipeRow | null> {
  return updateEquipe(validarIdTexto(equipeId), validarEquipePayload(input));
}

export async function removerEquipe(equipeId: string): Promise<boolean> {
  return deleteEquipe(validarIdTexto(equipeId));
}
