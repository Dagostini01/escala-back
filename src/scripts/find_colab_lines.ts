import fs from "fs";

const content = fs.readFileSync("d:/WORK/DESENVOLVIMENTO/Datasite/Sistema de Escala e Portal do Colaborador/API Escala/src/routes/colaborador/index.ts", "utf-8");
const lines = content.split("\n");

console.log("Searching for 'perfil'...");
lines.forEach((line, index) => {
  if (line.toLowerCase().includes("perfil")) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});

console.log("\nSearching for 'foto'...");
lines.forEach((line, index) => {
  if (line.toLowerCase().includes("foto")) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
