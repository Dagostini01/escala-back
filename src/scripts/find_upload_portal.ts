import fs from "fs";

const content = fs.readFileSync("d:/WORK/DESENVOLVIMENTO/Datasite/Sistema de Escala e Portal do Colaborador/portal-colaborador/src/App.tsx", "utf-8");
const lines = content.split("\n");

console.log("Searching for 'foto' / 'photo' / 'upload' in App.tsx...");
lines.forEach((line, index) => {
  if (line.toLowerCase().includes("foto") || line.toLowerCase().includes("upload") || line.toLowerCase().includes("photo")) {
    if (line.includes("api") || line.includes("axios") || line.includes("post") || line.includes("put")) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  }
});
