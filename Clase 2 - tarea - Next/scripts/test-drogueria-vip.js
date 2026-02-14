const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const retPath = "c:/Users/Usuario/Downloads/RETENCIONES IIBB 01-2026.xlsx";
const percPath = "c:/Users/Usuario/Downloads/PERCEPCION IIBB 01-2026.xlsx";

function readSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headers = rows[0].map((c) => String(c ?? "").trim());
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
}

const retenciones = readSheet(retPath);
const percepciones = readSheet(percPath);

const body = JSON.stringify({ retenciones, percepciones });

fetch("http://localhost:3000/api/parseos/arciba/drogueria-vip", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
})
  .then((r) => r.json())
  .then((data) => {
    if (data.error) {
      console.error("Error:", data.error);
      process.exit(1);
    }
    const outPath = path.join(__dirname, "..", "drogueria-vip-output.txt");
    fs.writeFileSync(outPath, data.result || "", "utf8");
    console.log("TXT written to", outPath);
    console.log("Lines:", (data.result || "").split("\n").filter(Boolean).length);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
