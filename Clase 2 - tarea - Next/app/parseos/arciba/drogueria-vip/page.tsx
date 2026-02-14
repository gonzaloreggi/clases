"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";

type SheetData = { headers: string[]; rows: unknown[][] };

export default function DrogueriaVipPage() {
  const [retencionesFileName, setRetencionesFileName] = useState("Ningún archivo elegido");
  const [percepcionesFileName, setPercepcionesFileName] = useState("Ningún archivo elegido");
  const [retencionesSheet, setRetencionesSheet] = useState<SheetData | null>(null);
  const [percepcionesSheet, setPercepcionesSheet] = useState<SheetData | null>(null);
  const [retencionesInfo, setRetencionesInfo] = useState("Sube el archivo de retenciones (XLSX).");
  const [percepcionesInfo, setPercepcionesInfo] = useState("Sube el archivo de percepciones (XLSX).");
  const [outputPreview, setOutputPreview] = useState(
    "— Aquí se mostrará cómo quedará el TXT generado —"
  );
  const [isGenerating, setIsGenerating] = useState(false);

  const canGenerate = retencionesSheet !== null && percepcionesSheet !== null;

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
          const rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
          }) as unknown[][];
          if (rows.length === 0) {
            reject(new Error("La hoja está vacía"));
            return;
          }
          const headers = (rows[0] as unknown[]).map((c) =>
            String(c ?? "").trim()
          );
          const dataRows = rows.slice(1);
          resolve({ headers, rows: dataRows });
        } catch {
          reject(new Error("No se pudo leer el XLSX"));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleRetenciones = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        setRetencionesFileName("Ningún archivo elegido");
        setRetencionesInfo("Sube el archivo de retenciones (XLSX).");
        setRetencionesSheet(null);
        return;
      }
      setRetencionesFileName(file.name);
      setRetencionesInfo("Cargando...");
      try {
        const data = await loadXlsx(file);
        setRetencionesSheet(data);
        setRetencionesInfo(
          `${data.rows.length} fila(s), ${data.headers.length} columna(s).`
        );
      } catch (err) {
        setRetencionesInfo(
          err instanceof Error ? err.message : "Error al leer el archivo"
        );
        setRetencionesSheet(null);
      }
    },
    [loadXlsx]
  );

  const handlePercepciones = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        setPercepcionesFileName("Ningún archivo elegido");
        setPercepcionesInfo("Sube el archivo de percepciones (XLSX).");
        setPercepcionesSheet(null);
        return;
      }
      setPercepcionesFileName(file.name);
      setPercepcionesInfo("Cargando...");
      try {
        const data = await loadXlsx(file);
        setPercepcionesSheet(data);
        setPercepcionesInfo(
          `${data.rows.length} fila(s), ${data.headers.length} columna(s).`
        );
      } catch (err) {
        setPercepcionesInfo(
          err instanceof Error ? err.message : "Error al leer el archivo"
        );
        setPercepcionesSheet(null);
      }
    },
    [loadXlsx]
  );

  useEffect(() => {
    if (!canGenerate) {
      setOutputPreview("— Aquí se mostrará cómo quedará el TXT generado —");
      return;
    }
    let cancelled = false;
    (async () => {
      setIsGenerating(true);
      try {
        const res = await fetch("/api/parseos/arciba/drogueria-vip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            retenciones: {
              headers: retencionesSheet!.headers,
              rows: retencionesSheet!.rows,
            },
            percepciones: {
              headers: percepcionesSheet!.headers,
              rows: percepcionesSheet!.rows,
            },
          }),
        });
        if (!res.ok) throw new Error("Error al procesar");
        const data = await res.json();
        if (!cancelled) {
          const content = data.result ?? "";
          setOutputPreview(
            content.slice(0, 2000) + (content.length > 2000 ? "\n..." : "")
          );
        }
      } catch {
        if (!cancelled)
          setOutputPreview(
            "[Vista previa no disponible. El formato de salida se definirá después.]"
          );
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canGenerate, retencionesSheet, percepcionesSheet]);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    try {
      const res = await fetch("/api/parseos/arciba/drogueria-vip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retenciones: { headers: retencionesSheet!.headers, rows: retencionesSheet!.rows },
          percepciones: { headers: percepcionesSheet!.headers, rows: percepcionesSheet!.rows },
        }),
      });
      if (!res.ok) throw new Error("Error al procesar");
      const data = await res.json();
      let content = data.result ?? "";
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
      const bytes = new TextEncoder().encode(content);
      const blob = new Blob([bytes], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "parseado_retenciones_agip_drogueria_vip.txt";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  return (
    <main className="tool-container">
      <Link href="/parseos/arciba" className="back-link">
        ← Volver a Parseo ARCIBA
      </Link>
      <header className="page-header">
        <Link href="/" className="logo-link">
          <img src="/LOGO.jpeg" alt="Logo" className="page-logo" />
        </Link>
        <div className="page-title-wrap">
          <h1>Parseo ARCIBA — Drogueria VIP</h1>
          <p className="subtitle">
            Sube el archivo de retenciones y el de percepciones (XLSX) y obtené el TXT para retenciones AGIP.
          </p>
        </div>
      </header>

      <section className="tool-card">
        <h2>1. Subir archivos XLSX</h2>
        <p className="info">
          Se requieren dos archivos Excel: <strong>Retenciones</strong> y <strong>Percepciones</strong>.
        </p>
        <div className="file-label" style={{ marginBottom: "0.75rem" }}>
          <label className="file-label">
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleRetenciones}
            />
            <span className="file-button">Elegir archivo Retenciones (XLSX)</span>
            <span className="file-name">{retencionesFileName}</span>
          </label>
        </div>
        <p className="info" style={{ marginBottom: "0.75rem" }}>{retencionesInfo}</p>
        <div className="file-label">
          <label className="file-label">
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handlePercepciones}
            />
            <span className="file-button">Elegir archivo Percepciones (XLSX)</span>
            <span className="file-name">{percepcionesFileName}</span>
          </label>
        </div>
        <p className="info">{percepcionesInfo}</p>
      </section>

      <section className="tool-card">
        <h2>2. Generar y descargar TXT</h2>
        <p className="info">
          El archivo TXT se generará con el formato AGIP (retenciones) a partir de Retenciones y Percepciones.
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={!canGenerate || isGenerating}
          onClick={handleGenerate}
        >
          {isGenerating ? "Generando…" : "Generar archivo TXT"}
        </button>
      </section>

      <section className="tool-card">
        <h2>Vista previa del TXT (formato de salida)</h2>
        <pre className="txt-preview">{outputPreview}</pre>
      </section>
    </main>
  );
}
