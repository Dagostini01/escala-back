import sql from "mssql";
import * as fs from "fs";
import * as path from "path";

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
  console.log("Connecting to SQL Server...");
  const pool = await new sql.ConnectionPool(config).connect();
  console.log("Connected!");

  const sqlPath = path.resolve(__dirname, "../../sql/ESCALA_v2_updates.sql");
  console.log("Reading migration from:", sqlPath);
  const rawSql = fs.readFileSync(sqlPath, "utf-8");

  // SQL Server client cannot run commands separated by GO or multiple statements in a single batch easily if they have schema alters.
  // We can split by semicolon or newlines or run as is if it's a single batch.
  // The script has multiple IF NOT EXISTS and CREATE TABLE, which work fine as a single batch in mssql!
  console.log("Running migration script...");
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    await request.query(rawSql);
    await transaction.commit();
    console.log("Migration executed successfully!");
  } catch (err) {
    await transaction.rollback();
    console.error("Migration failed, transaction rolled back.");
    console.error(err);
  }

  await pool.close();
}

run().catch(console.error);
