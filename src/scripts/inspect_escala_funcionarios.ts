import sql from "mssql";

const config: sql.config = {
  user: "datasite_user",
  password: "DaT@$1t307&%#wzxp5!",
  server: "ds-srv01.database.windows.net",
  database: "DatasitePRD",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

async function run() {
  const pool = await sql.connect(config);
  console.log("Connected!");
  try {
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'ESCALA_ordemservico_funcionarios'
    `);
    console.log("ESCALA_ordemservico_funcionarios columns:", result.recordset);
  } catch (err) {
    console.error("Error:", err);
  }
  await pool.close();
}

run().catch(console.error);
