import { sql, getPool } from "../db";

export type EquipePessoaRow = {
  equipe_pessoa_id: number;
  equipe_id: string;
  funcionario_id: number;
  NOME?: string;
  CPF?: string;
};

export type EquipePessoaInput = {
  equipe_id: string;
  funcionario_id: number;
};

const selectEquipePessoaColumns = "equipe_pessoa_id, equipe_id, funcionario_id, NOME, CPF";

function mapEquipePessoaRow(row: EquipePessoaRow | undefined): EquipePessoaRow | null {
  return row ?? null;
}

export async function listEquipePessoas(equipeId?: string): Promise<EquipePessoaRow[]> {
  const pool = await getPool();
  const request = pool.request();
  let where = "";
  if (equipeId) {
    request.input("equipe_id", sql.VarChar(40), equipeId);
    where = " WHERE equipe_id = @equipe_id";
  }
  const r = await request.query<EquipePessoaRow>(
    `SELECT ${selectEquipePessoaColumns} FROM dbo.VIEW_ESCALA_EQUIPE_PESSOAS${where} ORDER BY equipe_pessoa_id`
  );
  return r.recordset ?? [];
}

export async function findEquipePessoaById(equipePessoaId: number): Promise<EquipePessoaRow | null> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("equipe_pessoa_id", sql.Int, equipePessoaId)
    .query<EquipePessoaRow>(
      `SELECT ${selectEquipePessoaColumns} ` +
        "FROM dbo.VIEW_ESCALA_EQUIPE_PESSOAS " +
        "WHERE equipe_pessoa_id = @equipe_pessoa_id"
    );
  return mapEquipePessoaRow(r.recordset[0]);
}

export async function insertEquipePessoa(input: EquipePessoaInput): Promise<EquipePessoaRow> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const r = await new sql.Request(tx)
      .input("equipe_id", sql.VarChar(40), input.equipe_id)
      .input("funcionario_id", sql.Int, input.funcionario_id)
      .query<EquipePessoaRow>(
        "DECLARE @equipe_pessoa_id int; " +
          "SELECT @equipe_pessoa_id = ISNULL(MAX(equipe_pessoa_id), 0) + 1 " +
          "FROM dbo.ESCALA_equipe_pessoas WITH (UPDLOCK, HOLDLOCK); " +
          "INSERT INTO dbo.ESCALA_equipe_pessoas (equipe_pessoa_id, equipe_id, funcionario_id) " +
          "VALUES (@equipe_pessoa_id, @equipe_id, @funcionario_id); " +
          "SELECT p.equipe_pessoa_id, p.equipe_id, p.funcionario_id, f.NOME, f.CPF " +
          "FROM dbo.ESCALA_equipe_pessoas p " +
          "JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = p.funcionario_id " +
          "WHERE p.equipe_pessoa_id = @equipe_pessoa_id"
      );
    const row = r.recordset[0];
    if (!row) throw new Error("EQUIPE_PESSOA_NAO_CRIADA");
    await tx.commit();
    return row;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function updateEquipePessoa(
  equipePessoaId: number,
  input: EquipePessoaInput
): Promise<EquipePessoaRow | null> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("equipe_pessoa_id", sql.Int, equipePessoaId)
    .input("equipe_id", sql.VarChar(40), input.equipe_id)
    .input("funcionario_id", sql.Int, input.funcionario_id)
    .query<EquipePessoaRow>(
      "UPDATE dbo.ESCALA_equipe_pessoas SET " +
        "equipe_id = @equipe_id, " +
        "funcionario_id = @funcionario_id " +
        "WHERE equipe_pessoa_id = @equipe_pessoa_id; " +
        "SELECT p.equipe_pessoa_id, p.equipe_id, p.funcionario_id, f.NOME, f.CPF " +
        "FROM dbo.ESCALA_equipe_pessoas p " +
        "JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = p.funcionario_id " +
        "WHERE p.equipe_pessoa_id = @equipe_pessoa_id"
    );
  return mapEquipePessoaRow(r.recordset[0]);
}

export async function deleteEquipePessoa(equipePessoaId: number): Promise<boolean> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("equipe_pessoa_id", sql.Int, equipePessoaId)
    .query("DELETE FROM dbo.ESCALA_equipe_pessoas WHERE equipe_pessoa_id = @equipe_pessoa_id");
  return (r.rowsAffected[0] ?? 0) > 0;
}
