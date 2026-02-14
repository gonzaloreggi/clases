"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";

type SheetData = { headers: string[]; rows: unknown[][] };

export default function ParseoIvaCuadroComprasPage() {
  const [fileName, setFileName] = useState("Ningún archivo elegido");
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [fileInfo, setFileInfo] = useState("Sube el archivo del cuadro de compras (XLSX).");
  const [outputPreview, setOutputPreview] = useState(
    "— Aquí se mostrará cómo quedará el CSV generado —"
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const canGenerate = sheetData !== null && validationError === null;

  /** Headers in row 5 (index 4); data from row 6 (index 5). */
  const HEADER_ROW_INDEX = 4;
  const DATA_START_ROW_INDEX = 5;

  const loadXlsx = useCallback((file: File): Promise<SheetData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const arrayBuffer = ev.target?.result;
        if (!(arrayBuffer instanceof ArrayBuffer)) {
          reject(new Error("No se pudo leer el archivo"));
          return;
        }
        try {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const allRows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
          }) as unknown[][];
          if (allRows.length <= HEADER_ROW_INDEX) {
            reject(new Error("La hoja no tiene fila 5 (encabezados)."));
            return;
          }
          const headers = (allRows[HEADER_ROW_INDEX] as unknown[]).map((c) =>
            String(c ?? "").trim()
          );
          const dataRows = allRows.slice(DATA_START_ROW_INDEX);
          resolve({ headers, rows: dataRows });
        } catch {
          reject(new Error("No se pudo leer el XLSX"));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        setFileName("Ningún archivo elegido");
        setFileInfo("Sube el archivo del cuadro de compras (XLSX).");
        setSheetData(null);
        return;
      }
      setFileName(file.name);
      setFileInfo("Cargando...");
      try {
        const data = await loadXlsx(file);
        setSheetData(data);
        setValidationError(null);
        setFileInfo(
          `${data.rows.length} fila(s), ${data.headers.length} columna(s). Encabezados: ${data.headers.join(", ")}`
        );
      } catch (err) {
        setFileInfo(
          err instanceof Error ? err.message : "Error al leer el archivo"
        );
        setSheetData(null);
        setValidationError(null);
      }
    },
    [loadXlsx]
  );

  useEffect(() => {
    if (sheetData === null) {
      setOutputPreview("— Aquí se mostrará cómo quedará el CSV generado —");
      setValidationError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsGenerating(true);
      setValidationError(null);
      try {
        const res = await fetch("/api/parseos/iva/cuadro-compras", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            headers: sheetData.headers,
            rows: sheetData.rows,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          const msg = data.missingColumns?.length
            ? `Faltan columnas requeridas: ${data.missingColumns.join(", ")}. ${data.hint ?? ""}`
            : data.error ?? "Error al validar el archivo.";
          setValidationError(msg);
          setOutputPreview(`— ${msg} —`);
          return;
        }
        const content = data.result ?? "";
        setOutputPreview(
          content.slice(0, 2000) + (content.length > 2000 ? "\n..." : "")
        );
      } catch {
        if (!cancelled) {
          setValidationError("No se pudo conectar para validar el archivo.");
          setOutputPreview("[Vista previa no disponible.]");
        }
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetData]);

  const handleGenerate = async () => {
    if (!sheetData || validationError) return;
    try {
      const res = await fetch("/api/parseos/iva/cuadro-compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headers: sheetData.headers,
          rows: sheetData.rows,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.missingColumns?.length
          ? `Faltan columnas: ${data.missingColumns.join(", ")}`
          : data.error ?? "Error al procesar";
        setValidationError(msg);
        return;
      }
      let content = data.result ?? "";
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
      const bytes = new TextEncoder().encode(content);
      const blob = new Blob([bytes], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "salida_iva_cuadro_compras.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setValidationError("Error al generar el archivo.");
    }
  };

  return (
    <main className="tool-container">
      <Link href="/parseos/iva" className="back-link">
        ← Volver a Parseo IVA
      </Link>
      <header className="page-header">
        <Link href="/" className="logo-link">
          <img src="/LOGO.jpeg" alt="Logo" className="page-logo" />
        </Link>
        <div className="page-title-wrap">
          <h1>Parseo IVA — Cuadro compras</h1>
          <p className="subtitle">
            Sube el archivo del cuadro de compras (XLSX) y obtené el CSV en el mismo formato IVA.
          </p>
        </div>
      </header>

      <section className="tool-card">
        <h2>1. Subir cuadro de compras (XLSX)</h2>
        <p className="info">
          Elegí el archivo Excel del cuadro de compras.
        </p>
        <label className="file-label">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileChange}
          />
          <span className="file-button">Elegir archivo cuadro compras (XLSX)</span>
          <span className="file-name">{fileName}</span>
        </label>
        <p className="info">{fileInfo}</p>
        {validationError && (
          <p className="info" style={{ color: "var(--color-error, #c00)", marginTop: "0.5rem" }}>
            {validationError}
          </p>
        )}
      </section>

      <section className="tool-card">
        <h2>2. Generar y descargar CSV</h2>
        <p className="info">
          El archivo CSV se generará con el mismo formato IVA (misma lógica que el parseo general).
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={!canGenerate || isGenerating}
          onClick={handleGenerate}
        >
          {isGenerating ? "Generando…" : "Generar archivo CSV"}
        </button>
      </section>

      <section className="tool-card">
        <h2>Vista previa del CSV (formato de salida)</h2>
        <pre className="txt-preview">{outputPreview}</pre>
      </section>
    </main>
  );
}
