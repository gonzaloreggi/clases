"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { parseCSV } from "@/lib/parseCsv";

function findCol(headers: string[], name: string): number {
  const n = name.trim().toUpperCase();
  const i = headers.findIndex((h) => String(h || "").trim().toUpperCase() === n);
  return i >= 0 ? i : -1;
}

function normalizeFecha(str: string): string {
  const s = String(str || "").trim();
  const parts = s.split("/").map((p) => p.trim());
  if (parts.length !== 3) return "01/01/1900";
  const dd = Math.max(1, Math.min(31, parseInt(parts[0], 10) || 1));
  const mm = Math.max(1, Math.min(12, parseInt(parts[1], 10) || 1));
  const yyyy = parseInt(parts[2], 10) || 1900;
  const year4 = String(yyyy).padStart(4, "0").slice(-4);
  return String(dd).padStart(2, "0") + "/" + String(mm).padStart(2, "0") + "/" + year4;
}

function parseFechaSortable(str: string): number {
  const s = String(str || "").trim();
  const parts = s.split("/");
  if (parts.length !== 3) return 0;
  const dd = parseInt(parts[0], 10) || 0;
  const mm = parseInt(parts[1], 10) || 0;
  const yyyy = parseInt(parts[2], 10) || 0;
  return yyyy * 10000 + mm * 100 + dd;
}

function formatNumFixed(num: number | string, len: number): string {
  const n = parseFloat(String(num).replace(",", ".")) || 0;
  const [intPart, decPart] = n.toFixed(2).split(".");
  let s = intPart + "," + (decPart || "00");
  s = s.length > len ? s.slice(-len) : s.padStart(len, " ");
  return s;
}

function csvToTxtContent(csvHeaders: string[], csvRows: string[][]): string {
  if (csvRows.length === 0 || csvHeaders.length === 0) return "";
  const idx = {
    fecha: findCol(csvHeaders, "fecha"),
    num_comp: findCol(csvHeaders, "num_comp"),
    punto_venta: findCol(csvHeaders, "punto_venta"),
    cuit: findCol(csvHeaders, "cuit"),
    valor: findCol(csvHeaders, "valor"),
    reten: findCol(csvHeaders, "reten"),
  };
  const sortedRows =
    idx.fecha >= 0
      ? [...csvRows].sort((a, b) => parseFechaSortable(a[idx.fecha]) - parseFechaSortable(b[idx.fecha]))
      : csvRows;
  const lines: string[] = [];
  const firstDate = sortedRows.length && idx.fecha >= 0 ? normalizeFecha(sortedRows[0][idx.fecha]) : "01/01/2025";
  const [, mFirst, yFirst] = firstDate.split("/");
  const yy = (yFirst || "2025").slice(-2);
  const mm = mFirst || "12";
  let lineNum = 1;
  for (const row of sortedRows) {
    const fecha = normalizeFecha(idx.fecha >= 0 ? row[idx.fecha] : "");
    const num_comp = idx.num_comp >= 0 ? String(row[idx.num_comp] || "").trim() : "";
    const punto_venta = idx.punto_venta >= 0 ? String(row[idx.punto_venta] || "").trim() : "";
    const valorNum = parseFloat(String((idx.valor >= 0 ? row[idx.valor] : "0") || "0").replace(",", ".")) || 0;
    const retenNum = parseFloat(String((idx.reten >= 0 ? row[idx.reten] : "0") || "0").replace(",", ".")) || 0;
    const cuit = idx.cuit >= 0 ? String(row[idx.cuit] || "").replace(/\D/g, "") : "";
    const numComprobanteDig = ((punto_venta || "") + (num_comp || "")).replace(/\D/g, "") || "0";
    const first = numComprobanteDig.slice(0, 1);
    const rest = numComprobanteDig.slice(1).padStart(5, "0").slice(-5);
    const numComprobante = ("0000" + first + "000" + rest + "   ").slice(0, 16);
    const cuit20 = ((cuit || "") + "                    ").slice(0, 20);
    const lineSeq = String(lineNum).padStart(2, "0");
    const year = (yFirst || "2025").slice(-4);
    const certVal = year + yy + mm + lineSeq;
    const certificado = ("000000000000000000" + certVal).slice(-28);
    const fecha10 = (fecha + "          ").slice(0, 10);
    const line =
      "01" +
      fecha10 +
      numComprobante +
      formatNumFixed(valorNum, 16) +
      "0217" +
      "078" +
      "1" +
      formatNumFixed(valorNum, 14) +
      fecha10 +
      "01" +
      "0" +
      formatNumFixed(retenNum, 14) +
      "  0,00" +
      "          " +
      "80" +
      cuit20 +
      certificado;
    lines.push(line);
    lineNum++;
  }
  return lines.join("\r\n") + "\r\n";
}

export default function ParseoSicoreGananciasPage() {
  const [fileName, setFileName] = useState("Ningún archivo elegido");
  const [csvInfo, setCsvInfo] = useState("Sube un archivo para ver la vista previa.");
  const [csvPreviewText, setCsvPreviewText] = useState("");
  const [txtPreview, setTxtPreview] = useState("— Aquí se mostrará cómo quedará el TXT generado —");
  const [canGenerate, setCanGenerate] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);

  useEffect(() => {
    if (csvRows.length === 0 || csvHeaders.length === 0) return;
    const content = csvToTxtContent(csvHeaders, csvRows);
    setTxtPreview(content.slice(0, 1500) + (content.length > 1500 ? "\n..." : ""));
  }, [csvHeaders, csvRows]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFileName("Ningún archivo elegido");
      setCsvRows([]);
      setCsvHeaders([]);
      setCsvInfo("Sube un archivo para ver la vista previa.");
      setCsvPreviewText("");
      setTxtPreview("— Aquí se mostrará cómo quedará el TXT generado —");
      setCanGenerate(false);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result !== "string") return;
      const rows = parseCSV(result);
      if (rows.length === 0) {
        setCsvInfo("El archivo no tiene filas válidas.");
        setCsvPreviewText("");
        setCsvRows([]);
        setCsvHeaders([]);
        setCanGenerate(false);
        return;
      }
      setCsvHeaders(rows[0]);
      setCsvRows(rows.slice(1));
      setCsvInfo(`${rows.length - 1} fila(s), ${rows[0].length} columna(s).`);
      setCsvPreviewText(rows.slice(0, 5).map((r) => r.join(" | ")).join("\n") + (rows.length > 5 ? "\n..." : ""));
      setCanGenerate(true);
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleGenerate = () => {
    const content = csvToTxtContent(csvHeaders, csvRows);
    if (!content) return;
    const bytes = new TextEncoder().encode(content);
    const blob = new Blob([bytes], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "parseado_retenciones_ganancias.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="tool-container">
      <Link href="/" className="back-link">
        ← Volver a Herramientas de parseo
      </Link>
      <header className="page-header">
        <Link href="/" className="logo-link">
          <img src="/LOGO.jpeg" alt="Logo" className="page-logo" />
        </Link>
        <div className="page-title-wrap">
          <h1>Parseo SICORE GANANCIAS</h1>
          <p className="subtitle">
            Sube el CSV de retenciones ganancias y obtené el TXT para SICORE.{" "}
            <span className="hide-text">
              Al final de cada línea: aamm + número de línea (ej. 261201 = aa 26, mm 12, 01).
            </span>
          </p>
        </div>
      </header>

      <section className="tool-card">
        <h2>1. Subir CSV</h2>
        <label className="file-label">
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
          <span className="file-button">Elegir archivo CSV</span>
          <span className="file-name">{fileName}</span>
        </label>
      </section>

      <section className="tool-card">
        <h2>2. Vista previa del CSV</h2>
        <p className="info">{csvInfo}</p>
        <div className="preview-box">{csvPreviewText}</div>
      </section>

      <section className="tool-card">
        <h2>3. Generar y descargar TXT</h2>
        <p className="info">El archivo TXT se generará con el formato SICORE (retenciones ganancias).</p>
        <button type="button" className="btn primary" disabled={!canGenerate} onClick={handleGenerate}>
          Generar archivo TXT
        </button>
      </section>

      <section className="tool-card">
        <h2>Vista previa del TXT (formato de salida)</h2>
        <pre className="txt-preview">{txtPreview}</pre>
      </section>
    </main>
  );
}
