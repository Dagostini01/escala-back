import * as XLSX from "xlsx";
import * as path from "path";
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

function cleanName(rawName: string): string {
  if (!rawName) return "";
  let clean = rawName.trim();
  // Strip ranking prefixes (3.1 - , AUX - , etc)
  clean = clean.replace(/^(?:[0-9.]+|AUX)\s*-\s*/i, "");
  // Strip regional prefixes (SP - , LND - , POA - , etc)
  clean = clean.replace(/^[A-Z]{2,4}\s*-\s*/i, "");
  // Normalize accents (remove diacritics)
  clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Normalize whitespaces
  return clean.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseClassification(rawName: string): string | null {
  if (!rawName) return null;
  const match = rawName.match(/^([0-9.]+|AUX)\s*-\s*/i);
  return match ? match[1].toUpperCase() : null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function run() {
  const filePath = path.resolve(__dirname, "../../../Banco Colaboradores.xlsx");
  console.log("Reading file:", filePath);
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  console.log("Connecting to SQL Server...");
  const pool = await new sql.ConnectionPool(config).connect();
  console.log("Connected!");

  // Fetch all db employees to build a map
  const dbResult = await pool.request().query("SELECT ID_FUNCIONARIO, NOME FROM dbo.t2_funcionarios");
  const dbEmployees = dbResult.recordset;
  console.log(`Total employees in DB: ${dbEmployees.length}`);

  const dbMap = new Map<string, number>(); // cleanName -> ID_FUNCIONARIO
  for (const emp of dbEmployees) {
    if (emp.NOME) {
      const cleanDbName = cleanName(emp.NOME);
      dbMap.set(cleanDbName, emp.ID_FUNCIONARIO);
    }
  }

  let totalExcelRows = 0;
  let matchedCount = 0;
  let updatedCount = 0;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // Excel data starts at row 3 (Index 3)
    for (let i = 3; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || !row[1]) continue; // col[1] is NOME
      
      const rawName = String(row[1]);
      const cleaned = cleanName(rawName);
      if (!cleaned) continue;

      totalExcelRows++;
      const idFuncionario = dbMap.get(cleaned);

      if (idFuncionario !== undefined) {
        matchedCount++;

        const classification = parseClassification(rawName);
        const qpresencias = parseNumber(row[5]) ?? 0;
        const comparecimento = parseNumber(row[6]) ?? 0;
        const atrasos = parseNumber(row[7]) ?? 0;
        const productivity = parseNumber(row[8]) ?? 0;

        // 1. Update t2_funcionarios
        await new sql.Request(transaction)
          .input("id_funcionario", sql.Int, idFuncionario)
          .input("classificacao", sql.VarChar(10), classification)
          .input("frequencia_real", sql.Decimal(5, 4), comparecimento)
          .query(`
            UPDATE dbo.t2_funcionarios 
            SET 
              classificacao = ISNULL(@classificacao, classificacao),
              frequencia_real = @frequencia_real
            WHERE ID_FUNCIONARIO = @id_funcionario
          `);

        // 2. Check and Update/Insert ESCALA_funcionarios_avaliacao
        const checkResult = await new sql.Request(transaction)
          .input("id_funcionario", sql.Int, idFuncionario)
          .query(`
            SELECT 1 FROM dbo.ESCALA_funcionarios_avaliacao WHERE id_funcionario = @id_funcionario
          `);

        if (checkResult.recordset.length > 0) {
          await new sql.Request(transaction)
            .input("id_funcionario", sql.Int, idFuncionario)
            .input("media_pecas_hora", sql.Decimal(10, 2), productivity)
            .input("qtde_presencas", sql.Int, qpresencias)
            .input("qtde_atrasos", sql.Int, atrasos)
            .query(`
              UPDATE dbo.ESCALA_funcionarios_avaliacao 
              SET 
                media_pecas_hora = @media_pecas_hora,
                qtde_presencas = @qtde_presencas,
                qtde_atrasos = @qtde_atrasos
              WHERE id_funcionario = @id_funcionario
            `);
        } else {
          await new sql.Request(transaction)
            .input("id_funcionario", sql.Int, idFuncionario)
            .input("media_pecas_hora", sql.Decimal(10, 2), productivity)
            .input("qtde_presencas", sql.Int, qpresencias)
            .input("qtde_atrasos", sql.Int, atrasos)
            .query(`
              INSERT INTO dbo.ESCALA_funcionarios_avaliacao (
                id_funcionario, media_pecas_hora, qtde_presencas, qtde_atrasos, 
                qtde_convites, qtde_aceites, qtde_declinios, qtde_faltas
              ) VALUES (
                @id_funcionario, @media_pecas_hora, @qtde_presencas, @qtde_atrasos,
                0, 0, 0, 0
              )
            `);
        }

        updatedCount++;
      }
    }

    await transaction.commit();
    console.log("\nTransaction committed successfully!");
    console.log(`Excel rows processed: ${totalExcelRows}`);
    console.log(`Matched with DB: ${matchedCount}`);
    console.log(`Database records updated: ${updatedCount}`);
  } catch (err) {
    await transaction.rollback();
    console.error("Error during import, transaction rolled back:", err);
  }

  await pool.close();
}

run().catch(console.error);
