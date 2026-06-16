import { sql, getPool } from "../db";
import { indexRow, pickInt, pickString } from "../utils/rowFields";

export type BaseOperacionalRow = {
  id_filial: number;
  nome: string;
};

export type FuncionarioPorCargoRow = {
  id_funcionario: number;
  nome: string;
};

function mapBaseOperacional(row: Record<string, unknown>): BaseOperacionalRow | null {
  const m = indexRow(row);
  const id_filial = pickInt(m, "id_filial", "idfilial");
  const nome = pickString(m, "nome", "nome_filial", "nomefilial", "filial", "descricao");
  if (id_filial === null || nome === null) return null;
  return { id_filial, nome };
}

function mapFuncionarioPorCargo(row: Record<string, unknown>): FuncionarioPorCargoRow | null {
  const m = indexRow(row);
  const id_funcionario = pickInt(m, "id_funcionario", "idfuncionario", "funcionario_id", "id");
  const nome = pickString(m, "nome", "nome_funcionario", "nomefuncionario", "funcionario");
  if (id_funcionario === null || nome === null) return null;
  return { id_funcionario, nome };
}

export async function listBasesOperacionais(): Promise<BaseOperacionalRow[]> {
  const pool = await getPool();
  const r = await pool.request().query("EXEC dbo.sp_CADASTRO_ConsultaBases");
  return (r.recordset ?? [])
    .map((row) => mapBaseOperacional(row as Record<string, unknown>))
    .filter((row): row is BaseOperacionalRow => row !== null);
}

export async function listFuncionariosPorCargo(
  idFilial: number,
  idCargo: number
): Promise<FuncionarioPorCargoRow[]> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("id_filial", sql.Int, idFilial)
    .input("id_cargo", sql.Int, idCargo)
    .query("EXEC dbo.sp_ESCALA_BuscaFuncionariosPorCargo @id_filial, @id_cargo");
  return (r.recordset ?? [])
    .map((row) => mapFuncionarioPorCargo(row as Record<string, unknown>))
    .filter((row): row is FuncionarioPorCargoRow => row !== null);
}
