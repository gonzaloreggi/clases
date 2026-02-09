"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type XLSXModule = typeof import("xlsx");

function escapeCsvField(value: unknown): string {
  const s = String(value ?? "").trim();
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function findColumnIndex(headers: string[], name: string): number {
  const normalized = name.trim().toUpperCase();
  const idx = headers.findIndex((h) => String(h || "").trim().toUpperCase() === normalized);
  return idx >= 0 ? idx : -1;
}

function findColumnIndexContaining(headers: string[], part: string): number {
  const normalized = part.trim().toUpperCase();
  const idx = headers.findIndex((h) => String(h || "").toUpperCase().includes(normalized));
  return idx >= 0 ? idx : -1;
}

function formatDateYYYYMMDD(val: unknown, xlsxLib?: XLSXModule | null): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (!s) return "";
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0) {
    try {
      if (xlsxLib?.SSF?.parse_date_code) {
        const date = xlsxLib.SSF.parse_date_code(n);
        if (date && date.y != null) {
          const d = date.d;
          const m = date.m;
          const y = date.y;
          return [y, String(m).padStart(2, "0"), String(d).padStart(2, "0")].join("-");
        }
      }
    } catch {
      // fallback
    }
    return s;
  }
  const ddmmyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy;
    return [y, m!.padStart(2, "0"), d!.padStart(2, "0")].join("-");
  }
  const yyyymmdd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmdd) return s.replace(/[\/\-]/g, "-");
  return s;
}

function readXLSX(xlsxLib: XLSXModule, arrayBuffer: ArrayBuffer): unknown[][] {
  const workbook = xlsxLib.read(arrayBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return xlsxLib.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

function toCsvContent(sheetHeaders: string[], sheetRows: unknown[][], xlsxLib?: XLSXModule | null): string {
  if (sheetRows.length === 0 || sheetHeaders.length === 0) return "";

  const idxCol493 = findColumnIndex(sheetHeaders, "493");
  const idxCuit = findColumnIndex(sheetHeaders, "CUIT");
  const idxFecha =
    findColumnIndex(sheetHeaders, "FECHA PERCEPCION") >= 0
      ? findColumnIndex(sheetHeaders, "FECHA PERCEPCION")
      : findColumnIndexContaining(sheetHeaders, "FECHA");
  const idxPuntoVenta = findColumnIndex(sheetHeaders, "PUNTO DE VENTA");
  const idxNumeroComprobante = findColumnIndex(sheetHeaders, "NUMERO DE COMPROBANTE");
  const idxImporte = findColumnIndex(sheetHeaders, "IMPORTE");

  const delimiter = ";";
  const lines: string[] = [];

  for (const row of sheetRows) {
    const col493 = idxCol493 >= 0 ? String(row[idxCol493] ?? "").trim() : "";
    const primeraCol = col493 !== "" ? col493 : "493";
    const cuit = idxCuit >= 0 ? String(row[idxCuit] ?? "").trim() : "";
    const fechaRaw = idxFecha >= 0 ? row[idxFecha] : "";
    const puntoVenta = idxPuntoVenta >= 0 ? String(row[idxPuntoVenta] ?? "").trim() : "";
    const numeroComprobante = idxNumeroComprobante >= 0 ? String(row[idxNumeroComprobante] ?? "").trim() : "";
    const importe = idxImporte >= 0 ? String(row[idxImporte] ?? "").trim() : "";

    const fecha = formatDateYYYYMMDD(fechaRaw, xlsxLib);
    const comprobanteFormateado =
      String(puntoVenta).padStart(5, "0") + "-" + String(numeroComprobante).padStart(8, "0");

    const cells = [
      escapeCsvField(primeraCol),
      escapeCsvField(cuit),
      "",
      escapeCsvField(fecha),
      "1",
      escapeCsvField(comprobanteFormateado),
      escapeCsvField(importe),
    ];
    lines.push(cells.join(delimiter));
  }

  return lines.join("\n");
}

export default function ParseoIvaPage() {
  const [fileName, setFileName] = useState("Ningún archivo elegido");
  const [sheetInfo, setSheetInfo] = useState("Sube un archivo para ver la vista previa.");
  const [sheetPreview, setSheetPreview] = useState("");
  const [csvPreview, setCsvPreview] = useState("— Aquí se mostrará cómo quedará el CSV generado —");
  const [canGenerate, setCanGenerate] = useState(false);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<unknown[][]>([]);
  const [xlsxLib, setXlsxLib] = useState<XLSXModule | null>(null);

  useEffect(() => {
    if (sheetRows.length === 0 || sheetHeaders.length === 0) return;
    const content = toCsvContent(sheetHeaders, sheetRows, xlsxLib);
    setCsvPreview(content.slice(0, 2000) + (content.length > 2000 ? "\n..." : ""));
  }, [sheetHeaders, sheetRows, xlsxLib]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFileName("Ningún archivo elegido");
      setSheetRows([]);
      setSheetHeaders([]);
      setSheetInfo("Sube un archivo para ver la vista previa.");
      setSheetPreview("");
      setCsvPreview("— Aquí se mostrará cómo quedará el CSV generado —");
      setCanGenerate(false);
      e.target.value = "";
      return;
    }

    setFileName(file.name);
    setSheetInfo("Cargando librería...");
    const XLSX = await import("xlsx");
    setXlsxLib(XLSX);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const arrayBuffer = ev.target?.result;
      if (!(arrayBuffer instanceof ArrayBuffer)) return;
      let rows: unknown[][];
      try {
        rows = readXLSX(XLSX, arrayBuffer);
      } catch {
        setSheetInfo("No se pudo leer el archivo. ¿Es un XLSX válido?");
        setSheetPreview("");
        setSheetRows([]);
        setSheetHeaders([]);
        setCanGenerate(false);
        return;
      }
      if (rows.length === 0) {
        setSheetInfo("La hoja está vacía.");
        setSheetPreview("");
        setSheetRows([]);
        setSheetHeaders([]);
        setCanGenerate(false);
        return;
      }
      const headers = (rows[0] as unknown[]).map((c) => String(c ?? "").trim()) as string[];
      const dataRows = rows.slice(1);
      setSheetHeaders(headers);
      setSheetRows(dataRows);
      setSheetInfo(
        `${dataRows.length} fila(s), ${headers.length} columna(s). Encabezados: ${headers.join(", ")}`
      );
      setSheetPreview(
        rows
          .slice(0, 6)
          .map((r) => (r as unknown[]).map((c) => String(c ?? "")).join(" | "))
          .join("\n") + (rows.length > 6 ? "\n..." : "")
      );
      setCanGenerate(true);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleGenerate = () => {
    const content = toCsvContent(sheetHeaders, sheetRows, xlsxLib);
    if (!content) return;
    let out = content;
    if (out.charCodeAt(0) === 0xfeff) out = out.slice(1);
    const bytes = new TextEncoder().encode(out);
    const blob = new Blob([bytes], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "salida_iva.csv";
    a.click();
    URL.revokeObjectURL(url);
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
          <h1>Parseo IVA</h1>
          <p className="subtitle">Sube un archivo XLSX (Excel) y obtén un CSV con el formato definido.</p>
        </div>
      </header>

      <section className="tool-card">
        <h2>1. Subir XLSX</h2>
        <label className="file-label">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileChange}
          />
          <span className="file-button">Elegir archivo XLSX</span>
          <span className="file-name">{fileName}</span>
        </label>
      </section>

      <section className="tool-card">
        <h2>2. Vista previa del Excel</h2>
        <p className="info">{sheetInfo}</p>
        <div className="preview-box">{sheetPreview}</div>
      </section>

      <section className="tool-card">
        <h2>3. Generar y descargar CSV</h2>
        <p className="info">El archivo CSV se generará con el formato IVA.</p>
        <button type="button" className="btn primary" disabled={!canGenerate} onClick={handleGenerate}>
          Generar archivo CSV
        </button>
      </section>

      <section className="tool-card">
        <h2>Vista previa del CSV (formato de salida)</h2>
        <pre className="txt-preview">{csvPreview}</pre>
      </section>
    </main>
  );
}
