import { randomUUID } from "crypto";
import { sql, getPool } from "../db";

export type EquipeRow = {
  equipe_id: string;
  coordenador_id: number;
  coordenador_nome: string;
  equipe_qtde_inventariantes: number;
};

export type EquipeInput = {
  coordenador_id: number;
  coordenador_nome: string;
  equipe_qtde_inventariantes: number;
};

const selectEquipeColumns =
  "CAST(equipe_id AS NVARCHAR(36)) AS equipe_id, " +
  "coordenador_id, " +
  "coordenador_nome, " +
  "equipe_qtde_inventariantes";

function mapEquipeRow(row: EquipeRow | undefined): EquipeRow | null {
  return row ?? null;
}

export async function listEquipes(): Promise<EquipeRow[]> {
  const pool = await getPool();
  const r = await pool
    .request()
    .query<EquipeRow>(
      `SELECT ${selectEquipeColumns} FROM dbo.ESCALA_equipe ORDER BY coordenador_nome`
    );
  return r.recordset ?? [];
}

export async function findEquipeById(equipeId: string): Promise<EquipeRow | null> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("equipe_id", sql.VarChar(40), equipeId)
    .query<EquipeRow>(
      `SELECT ${selectEquipeColumns} ` +
        "FROM dbo.ESCALA_equipe " +
        "WHERE equipe_id = TRY_CONVERT(uniqueidentifier, @equipe_id)"
    );
  return mapEquipeRow(r.recordset[0]);
}

export async function insertEquipe(input: EquipeInput): Promise<EquipeRow> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("equipe_id", sql.UniqueIdentifier, randomUUID())
    .input("coordenador_id", sql.Int, input.coordenador_id)
    .input("coordenador_nome", sql.VarChar(500), input.coordenador_nome)
    .input("equipe_qtde_inventariantes", sql.Int, input.equipe_qtde_inventariantes)
    .query<EquipeRow>(
      "INSERT INTO dbo.ESCALA_equipe (" +
        "equipe_id, coordenador_id, coordenador_nome, equipe_qtde_inventariantes" +
        ") OUTPUT " +
        "CAST(inserted.equipe_id AS NVARCHAR(36)) AS equipe_id, " +
        "inserted.coordenador_id, " +
        "inserted.coordenador_nome, " +
        "inserted.equipe_qtde_inventariantes " +
        "VALUES (@equipe_id, @coordenador_id, @coordenador_nome, @equipe_qtde_inventariantes)"
    );
  const row = r.recordset[0];
  if (!row) throw new Error("EQUIPE_NAO_CRIADA");
  return row;
}

export async function updateEquipe(equipeId: string, input: EquipeInput): Promise<EquipeRow | null> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("equipe_id", sql.VarChar(40), equipeId)
    .input("coordenador_id", sql.Int, input.coordenador_id)
    .input("coordenador_nome", sql.VarChar(500), input.coordenador_nome)
    .input("equipe_qtde_inventariantes", sql.Int, input.equipe_qtde_inventariantes)
    .query<EquipeRow>(
      "UPDATE dbo.ESCALA_equipe SET " +
        "coordenador_id = @coordenador_id, " +
        "coordenador_nome = @coordenador_nome, " +
        "equipe_qtde_inventariantes = @equipe_qtde_inventariantes " +
        "OUTPUT " +
        "CAST(inserted.equipe_id AS NVARCHAR(36)) AS equipe_id, " +
        "inserted.coordenador_id, " +
        "inserted.coordenador_nome, " +
        "inserted.equipe_qtde_inventariantes " +
        "WHERE equipe_id = TRY_CONVERT(uniqueidentifier, @equipe_id)"
    );
  return mapEquipeRow(r.recordset[0]);
}

export async function deleteEquipe(equipeId: string): Promise<boolean> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("equipe_id", sql.VarChar(40), equipeId)
    .query("DELETE FROM dbo.ESCALA_equipe WHERE equipe_id = TRY_CONVERT(uniqueidentifier, @equipe_id)");
  return (r.rowsAffected[0] ?? 0) > 0;
}
