import {
  deleteEquipePessoa,
  findEquipePessoaById,
  insertEquipePessoa,
  listEquipePessoas,
  updateEquipePessoa,
  type EquipePessoaInput,
  type EquipePessoaRow
} from "../repository/equipePessoasRepo";

export type EquipePessoaPayload = {
  equipe_id: unknown;
  funcionario_id: unknown;
};

function validarInteiroPositivo(value: unknown, erro: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(erro);
  return n;
}

function validarEquipeId(value: unknown): string {
  const equipeId = String(value ?? "").trim();
  if (!equipeId) throw new Error("EQUIPE_ID_OBRIGATORIO");
  if (equipeId.length > 40) throw new Error("EQUIPE_ID_LONGO");
  return equipeId;
}

function validarEquipePessoaPayload(input: EquipePessoaPayload): EquipePessoaInput {
  return {
    equipe_id: validarEquipeId(input.equipe_id),
    funcionario_id: validarInteiroPositivo(input.funcionario_id, "FUNCIONARIO_ID_INVALIDO")
  };
}

export async function listarEquipePessoas(equipeId?: unknown): Promise<EquipePessoaRow[]> {
  const filtroEquipeId = equipeId === undefined ? undefined : validarEquipeId(equipeId);
  return listEquipePessoas(filtroEquipeId);
}

export async function buscarEquipePessoa(equipePessoaId: unknown): Promise<EquipePessoaRow | null> {
  return findEquipePessoaById(validarInteiroPositivo(equipePessoaId, "EQUIPE_PESSOA_ID_INVALIDO"));
}

export async function criarEquipePessoa(input: EquipePessoaPayload): Promise<EquipePessoaRow> {
  return insertEquipePessoa(validarEquipePessoaPayload(input));
}

export async function alterarEquipePessoa(
  equipePessoaId: unknown,
  input: EquipePessoaPayload
): Promise<EquipePessoaRow | null> {
  return updateEquipePessoa(
    validarInteiroPositivo(equipePessoaId, "EQUIPE_PESSOA_ID_INVALIDO"),
    validarEquipePessoaPayload(input)
  );
}

export async function removerEquipePessoa(equipePessoaId: unknown): Promise<boolean> {
  return deleteEquipePessoa(validarInteiroPositivo(equipePessoaId, "EQUIPE_PESSOA_ID_INVALIDO"));
}
