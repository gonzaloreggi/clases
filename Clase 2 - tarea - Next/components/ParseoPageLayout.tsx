"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { parseCSV } from "@/lib/parseCsv";

export type XLSXModule = typeof import("xlsx");

export type TransformFn = (
  headers: string[],
  rows: unknown[][],
  xlsxLib?: XLSXModule | null
) => string | Promise<string>;

export interface ParseoConfig {
  /** Page title, e.g. "Parseo SUSS" */
  title: string;
  /** Subtitle shown below the title (can include JSX) */
  subtitle: React.ReactNode;
  /** Input file format */
  inputFormat: "csv" | "xlsx";
  /** Label for the input format, e.g. "CSV" or "XLSX" */
  inputLabel: string;
  /** File input accept attribute */
  inputAccept: string;
  /** Label for the output format, e.g. "TXT" or "CSV" */
  outputLabel: string;
  /** Filename for the generated download */
  outputFileName: string;
  /** MIME type for the downloaded blob */
  outputMimeType: string;
  /** Description shown next to the generate button */
  generateDescription: string;
  /** The transform function that converts parsed rows into the output string */
  transform: TransformFn;
}

export default function ParseoPageLayout({ config }: { config: ParseoConfig }) {
  const [fileName, setFileName] = useState("Ningún archivo elegido");
  const [fileInfo, setFileInfo] = useState("Sube un archivo para ver la vista previa.");
  const [inputPreview, setInputPreview] = useState("");
  const [outputPreview, setOutputPreview] = useState(
    `— Aquí se mostrará cómo quedará el ${config.outputLabel} generado —`
  );
  const [canGenerate, setCanGenerate] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<unknown[][]>([]);
  const [xlsxLib, setXlsxLib] = useState<XLSXModule | null>(null);

  // Update output preview whenever data changes
  useEffect(() => {
    if (dataRows.length === 0) return;
    let cancelled = false;
    const run = async () => {
      const content = await Promise.resolve(config.transform(headers, dataRows, xlsxLib));
      if (!cancelled) {
        setOutputPreview(content.slice(0, 2000) + (content.length > 2000 ? "\n..." : ""));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [headers, dataRows, xlsxLib, config]);

  const resetState = () => {
    setFileName("Ningún archivo elegido");
    setHeaders([]);
    setDataRows([]);
    setFileInfo("Sube un archivo para ver la vista previa.");
    setInputPreview("");
    setOutputPreview(`— Aquí se mostrará cómo quedará el ${config.outputLabel} generado —`);
    setCanGenerate(false);
  };

  const setPreviewFromRows = (allRows: unknown[][], headerRow: string[]) => {
    const previewRows = [headerRow, ...allRows.slice(0, 5)];
    setInputPreview(
      previewRows
        .map((r) => (r as unknown[]).map((c) => String(c ?? "")).join(" | "))
        .join("\n") + (allRows.length > 5 ? "\n..." : "")
    );
  };

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") return;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setFileInfo("El archivo no tiene filas válidas.");
        setInputPreview("");
        setHeaders([]);
        setDataRows([]);
        setCanGenerate(false);
        return;
      }
      const h = rows[0];
      const data = rows.slice(1);
      setHeaders(h);
      setDataRows(data);
      setFileInfo(`${data.length} fila(s), ${h.length} columna(s). Encabezados: ${h.join(", ")}`);
      setPreviewFromRows(data, h);
      setCanGenerate(true);
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleXlsxFile = async (file: File) => {
    setFileInfo("Cargando librería...");
    const XLSX = await import("xlsx");
    setXlsxLib(XLSX);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const arrayBuffer = ev.target?.result;
      if (!(arrayBuffer instanceof ArrayBuffer)) return;
      let rows: unknown[][];
      try {
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
      } catch {
        setFileInfo("No se pudo leer el archivo. ¿Es un XLSX válido?");
        setInputPreview("");
        setHeaders([]);
        setDataRows([]);
        setCanGenerate(false);
        return;
      }
      if (rows.length === 0) {
        setFileInfo("La hoja está vacía.");
        setInputPreview("");
        setHeaders([]);
        setDataRows([]);
        setCanGenerate(false);
        return;
      }
      const h = (rows[0] as unknown[]).map((c) => String(c ?? "").trim());
      const data = rows.slice(1);
      setHeaders(h);
      setDataRows(data);
      setFileInfo(`${data.length} fila(s), ${h.length} columna(s). Encabezados: ${h.join(", ")}`);
      setPreviewFromRows(data, h);
      setCanGenerate(true);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      resetState();
      e.target.value = "";
      return;
    }
    setFileName(file.name);
    if (config.inputFormat === "xlsx") {
      await handleXlsxFile(file);
    } else {
      handleCsvFile(file);
    }
  };

  const handleGenerate = async () => {
    const content = await Promise.resolve(config.transform(headers, dataRows, xlsxLib));
    if (!content) return;

    // Strip BOM if present
    let out = content;
    if (out.charCodeAt(0) === 0xfeff) out = out.slice(1);

    const bytes = new TextEncoder().encode(out);
    const blob = new Blob([bytes], { type: config.outputMimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = config.outputFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputTypeLabel = config.inputLabel === "XLSX" ? "Excel" : config.inputLabel;

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
          <h1>{config.title}</h1>
          <p className="subtitle">{config.subtitle}</p>
        </div>
      </header>

      <section className="tool-card">
        <h2>1. Subir {config.inputLabel}</h2>
        <label className="file-label">
          <input type="file" accept={config.inputAccept} onChange={handleFileChange} />
          <span className="file-button">Elegir archivo {config.inputLabel}</span>
          <span className="file-name">{fileName}</span>
        </label>
      </section>

      <section className="tool-card">
        <h2>2. Vista previa del {inputTypeLabel}</h2>
        <p className="info">{fileInfo}</p>
        <div className="preview-box">{inputPreview}</div>
      </section>

      <section className="tool-card">
        <h2>3. Generar y descargar {config.outputLabel}</h2>
        <p className="info">{config.generateDescription}</p>
        <button type="button" className="btn primary" disabled={!canGenerate} onClick={handleGenerate}>
          Generar archivo {config.outputLabel}
        </button>
      </section>

      <section className="tool-card">
        <h2>Vista previa del {config.outputLabel} (formato de salida)</h2>
        <pre className="txt-preview">{outputPreview}</pre>
      </section>
    </main>
  );
}
