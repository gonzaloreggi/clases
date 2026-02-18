"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AccountEntry {
  id: string;
  cuit: string;
  password: string;
  queriedCuits: string;
}

type TaskStatus =
  | "pending"
  | "processing"
  | "success"
  | "partial"
  | "failed"
  | "retrying"
  | "cancelled";

interface TaskResult {
  index: number;
  cuit: string;
  queriedCuits: string[];
  status: TaskStatus;
  attempt: number;
  data?: Record<string, unknown>;
  error?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function newAccount(): AccountEntry {
  return { id: uid(), cuit: "", password: "", queriedCuits: "" };
}

function toApiDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fromApiDate(api: string): string {
  const [d, m, y] = api.split("/");
  return `${y}-${m}-${d}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const normalized = value
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? 0 : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Remove XML-invalid control characters so Excel can open the xlsx (evita error en sheet1.xml). */
function sanitizeStringForXml(s: string): string {
  if (typeof s !== "string") return s;
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

const SHEET1_PATH = "xl/worksheets/sheet1.xml";

/** Fix sheet1.xml: strip leading garbage, control chars, and conditionalFormatting (can cause "Línea 2, columna 0"), write UTF-8 no BOM. */
async function sanitizeSheet1XmlInXlsxBuffer(
  buffer: ArrayBuffer | Buffer,
): Promise<ArrayBuffer> {
  const arrayBuf =
    buffer instanceof ArrayBuffer
      ? buffer
      : (buffer as Buffer).buffer.slice(
          (buffer as Buffer).byteOffset,
          (buffer as Buffer).byteOffset + (buffer as Buffer).byteLength,
        );
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(arrayBuf);
  const entry = zip.file(SHEET1_PATH);
  if (!entry) return arrayBuf;
  let xml = await entry.async("string");
  xml = xml.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  const firstAngle = xml.indexOf("<");
  if (firstAngle > 0) xml = xml.slice(firstAngle);
  xml = xml.replace(/<conditionalFormatting[^/]*\/>/g, "");
  xml = xml.replace(/<conditionalFormatting[^>]*>[\s\S]*?<\/conditionalFormatting>/g, "");
  const utf8 = new TextEncoder().encode(xml);
  zip.file(SHEET1_PATH, utf8);
  return zip.generateAsync({ type: "arraybuffer" });
}

/** Sanitize cell value for XML: no undefined/NaN; strings get control chars stripped. */
function sanitizeCellValueForXml(value: unknown): unknown {
  if (value === undefined) return null;
  if (value == null) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeStringForXml(value);
  return value;
}

/** Columna 1 = A, 8 = H, 27 = AA, 42 = AP, etc. */
function colLetter(col: number): string {
  let s = "";
  let c = col;
  while (c > 0) {
    c -= 1;
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26);
  }
  return s;
}

/** Última columna (1-based) que tiene encabezado en la fila dada. No escribir más allá para no rellenar columnas sin encabezado. */
function getLastHeaderColumn(
  sheet: ExcelJS.Worksheet,
  headerRow: number = 5,
): number {
  for (let col = 1; col <= 60; col++) {
    const cell = sheet.getCell(headerRow, col);
    const text = (cell.text ?? String(cell.value ?? "")).trim();
    if (!text) return Math.max(1, col - 1);
  }
  return 60;
}

function toDisplayDate(raw: string): string {
  if (!raw) return "";
  if (raw.includes("-")) {
    const [y, m, d] = raw.split("-");
    if (y && m && d) return `${d}/${m}/${y}`;
  }
  if (raw.includes("/")) return raw;
  return raw;
}

function formatMonthSuffix(dateIso: string): string {
  if (!dateIso) return "";
  const [y, m] = dateIso.split("-");
  if (!y || !m) return "";
  return `${m}${y.slice(-2)}`;
}

function getResultSummary(data: Record<string, unknown>): string {
  if (!data) return "";
  const parts: string[] = [];

  if (typeof data.count === "number") {
    const label =
      data.type === "E"
        ? "emitidos"
        : data.type === "R"
          ? "recibidos"
          : "comprobantes";
    parts.push(`${data.count} ${label}`);
  }

  const emitidos = data.emitidos as Record<string, unknown> | undefined;
  const recibidos = data.recibidos as Record<string, unknown> | undefined;
  if (emitidos && typeof emitidos.count === "number")
    parts.push(`${emitidos.count} emitidos`);
  if (recibidos && typeof recibidos.count === "number")
    parts.push(`${recibidos.count} recibidos`);

  if (data.results && typeof data.results === "object") {
    const cuits = Object.keys(data.results as Record<string, unknown>);
    let totalE = 0;
    let totalR = 0;
    for (const val of Object.values(
      data.results as Record<string, Record<string, unknown>>,
    )) {
      const e = val?.emitidos as Record<string, unknown> | undefined;
      const r = val?.recibidos as Record<string, unknown> | undefined;
      if (e && typeof e.count === "number") totalE += e.count;
      if (r && typeof r.count === "number") totalR += r.count;
    }
    if (totalE > 0) parts.push(`${totalE} emitidos`);
    if (totalR > 0) parts.push(`${totalR} recibidos`);
    parts.push(`(${cuits.length} CUITs)`);
  }

  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/*  Comprobantes table helpers                                         */
/* ------------------------------------------------------------------ */

interface ComprobantesGroup {
  label: string;
  count: number;
  comprobantes: Record<string, string>[];
}

/** Pull comprobante arrays from any response shape the API can return. */
function extractComprobantesGroups(
  data: Record<string, unknown>,
): ComprobantesGroup[] {
  const groups: ComprobantesGroup[] = [];

  // Shape A: single type, single CUIT  →  { type, comprobantes }
  if (Array.isArray(data.comprobantes)) {
    const label =
      data.type === "E"
        ? "Emitidos"
        : data.type === "R"
          ? "Recibidos"
          : "Comprobantes";
    groups.push({
      label,
      count: (data.comprobantes as unknown[]).length,
      comprobantes: data.comprobantes as Record<string, string>[],
    });
  }

  // Shape B: both types, single CUIT  →  { emitidos: {…}, recibidos: {…} }
  const emitidos = data.emitidos as Record<string, unknown> | undefined;
  if (emitidos && Array.isArray(emitidos.comprobantes)) {
    groups.push({
      label: "Emitidos",
      count: (emitidos.comprobantes as unknown[]).length,
      comprobantes: emitidos.comprobantes as Record<string, string>[],
    });
  }
  const recibidos = data.recibidos as Record<string, unknown> | undefined;
  if (recibidos && Array.isArray(recibidos.comprobantes)) {
    groups.push({
      label: "Recibidos",
      count: (recibidos.comprobantes as unknown[]).length,
      comprobantes: recibidos.comprobantes as Record<string, string>[],
    });
  }

  // Shape C: multiple queried CUITs  →  { results: { [cuit]: { emitidos?, recibidos? } } }
  if (data.results && typeof data.results === "object") {
    for (const [cuit, val] of Object.entries(
      data.results as Record<string, Record<string, unknown>>,
    )) {
      const em = val?.emitidos as Record<string, unknown> | undefined;
      if (em && Array.isArray(em.comprobantes)) {
        groups.push({
          label: `Emitidos — ${cuit}`,
          count: (em.comprobantes as unknown[]).length,
          comprobantes: em.comprobantes as Record<string, string>[],
        });
      }
      const rec = val?.recibidos as Record<string, unknown> | undefined;
      if (rec && Array.isArray(rec.comprobantes)) {
        groups.push({
          label: `Recibidos — ${cuit}`,
          count: (rec.comprobantes as unknown[]).length,
          comprobantes: rec.comprobantes as Record<string, string>[],
        });
      }
    }
  }

  return groups;
}

/** Shorten verbose column headers for the table. */
const COL_SHORT: Record<string, string> = {
  "Fecha de Emisión": "Fecha",
  "Tipo de Comprobante": "Tipo",
  "Punto de Venta": "Pto Vta",
  "Número Desde": "Nro Desde",
  "Número Hasta": "Nro Hasta",
  "Cód. Autorización": "CAE",
  "Tipo Doc. Receptor": "Tipo Doc Rec",
  "Nro. Doc. Receptor": "CUIT Rec",
  "Denominación Receptor": "Receptor",
  "Tipo Doc. Emisor": "Tipo Doc Em",
  "Nro. Doc. Emisor": "CUIT Em",
  "Denominación Emisor": "Emisor",
  "Tipo Cambio": "T.C.",
  "Imp. Neto Gravado Total": "Neto Grav.",
  "Imp. Neto No Gravado": "No Grav.",
  "Imp. Op. Exentas": "Exentas",
  "Otros Tributos": "Otros Trib.",
  "Total IVA": "Total IVA",
  "Imp. Total": "Total",
  "Imp. Neto Gravado IVA 0%": "Neto 0%",
  "Imp. Neto Gravado IVA 2,5%": "Neto 2,5%",
  "Imp. Neto Gravado IVA 5%": "Neto 5%",
  "Imp. Neto Gravado IVA 10,5%": "Neto 10,5%",
  "Imp. Neto Gravado IVA 21%": "Neto 21%",
  "Imp. Neto Gravado IVA 27%": "Neto 27%",
};

/* ------------------------------------------------------------------ */
/*  Excel export helpers                                              */
/* ------------------------------------------------------------------ */

type ComprobanteRow = Record<string, unknown>;

function collectEmitidos(data: Record<string, unknown>): ComprobanteRow[] {
  const rows: ComprobanteRow[] = [];

  if (Array.isArray(data.comprobantes) && data.type === "E") {
    rows.push(...(data.comprobantes as ComprobanteRow[]));
  }

  const emitidos = data.emitidos as
    | { comprobantes?: unknown[] }
    | undefined;
  if (emitidos && Array.isArray(emitidos.comprobantes)) {
    rows.push(...(emitidos.comprobantes as ComprobanteRow[]));
  }

  if (data.results && typeof data.results === "object") {
    for (const val of Object.values(
      data.results as Record<
        string,
        { emitidos?: { comprobantes?: unknown[] } }
      >,
    )) {
      const e = val.emitidos;
      if (e && Array.isArray(e.comprobantes)) {
        rows.push(...(e.comprobantes as ComprobanteRow[]));
      }
    }
  }

  return rows;
}

function collectRecibidos(data: Record<string, unknown>): ComprobanteRow[] {
  const rows: ComprobanteRow[] = [];

  if (Array.isArray(data.comprobantes) && data.type === "R") {
    rows.push(...(data.comprobantes as ComprobanteRow[]));
  }

  const recibidos = data.recibidos as
    | { comprobantes?: unknown[] }
    | undefined;
  if (recibidos && Array.isArray(recibidos.comprobantes)) {
    rows.push(...(recibidos.comprobantes as ComprobanteRow[]));
  }

  if (data.results && typeof data.results === "object") {
    for (const val of Object.values(
      data.results as Record<
        string,
        { recibidos?: { comprobantes?: unknown[] } }
      >,
    )) {
      const r = val.recibidos;
      if (r && Array.isArray(r.comprobantes)) {
        rows.push(...(r.comprobantes as ComprobanteRow[]));
      }
    }
  }

  return rows;
}

// Plantilla VENTAS/COMPRAS: 2 filas usables (7 y 8). Insertamos (N-2) filas entre 7 y 8 para tener N filas de datos.
const TEMPLATE_DATA_FIRST_ROW = 7;
const TEMPLATE_USABLE_DATA_ROWS = 2; // filas 7 y 8
const TEMPLATE_TOTALES_ROW = 20;
const MIN_DATA_ROW_HEIGHT = 20;
/** Máximo de columnas al reemplazar fórmulas compartidas (debe cubrir toda la hoja para evitar "Shared Formula master" en columnas sin encabezado). */
const MAX_COLS_FOR_REPLACE_FORMULAS = 60;

/** Copia formato (número, fuente, bordes, etc.) de una celda a otra. Sin ajustar texto ni reducir para ajustar. */
function copyCellStyle(
  src: ExcelJS.Cell,
  dest: ExcelJS.Cell,
): void {
  if (src.numFmt != null) dest.numFmt = src.numFmt;
  if (src.font && typeof src.font === "object")
    dest.font = { ...src.font } as ExcelJS.Font;
  if (src.alignment && typeof src.alignment === "object") {
    dest.alignment = { ...src.alignment } as ExcelJS.Alignment;
    dest.alignment.wrapText = false;
    dest.alignment.shrinkToFit = false;
  }
  if (src.border && typeof src.border === "object")
    dest.border = { ...src.border } as ExcelJS.Borders;
  if (src.fill && typeof src.fill === "object")
    dest.fill = { ...src.fill } as ExcelJS.Fill;
}

/** Reemplaza cualquier fórmula (compartida o explícita) por su valor en el rango indicado. */
function replaceFormulasWithValuesInRange(
  sheet: ExcelJS.Worksheet,
  rowStart: number,
  rowEnd: number,
  numCols: number,
): void {
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = 1; c <= numCols; c++) {
      const cell = sheet.getCell(r, c);
      const val = cell.value;
      if (val != null && typeof val === "object") {
        const v = val as { sharedFormula?: string; formula?: string; result?: unknown };
        if (v.sharedFormula != null || v.formula != null) {
          cell.value = v.result ?? null;
        }
      }
    }
  }
}

/** Recorre las filas existentes de la hoja (columnas 1..60) y reemplaza cualquier fórmula por su valor. Evita "Shared Formula master..." al serializar. */
function stripAllFormulasInSheet(sheet: ExcelJS.Worksheet): void {
  const lastRow = sheet.rowCount || 0;
  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= MAX_COLS_FOR_REPLACE_FORMULAS; c++) {
      try {
        const cell = row.getCell(c);
        const val = cell.value;
        if (val != null && typeof val === "object") {
          const v = val as { sharedFormula?: string; formula?: string; result?: unknown };
          if (v.sharedFormula != null || v.formula != null) {
            cell.value = v.result ?? null;
          }
        }
      } catch {
        // ignore sparse/missing cells
      }
    }
  }
}

/** Inserta (N-2) filas entre la 7 y la 8, con el mismo formato que fila 7. Plantilla tiene 2 filas usables (7 y 8); quedan N filas (7..7+N-1) para datos. */
function ensureDataRowsBetween7And8(
  sheet: ExcelJS.Worksheet,
  dataRowCount: number,
  numCols: number,
  styleSourceRow: number,
): void {
  if (dataRowCount <= TEMPLATE_USABLE_DATA_ROWS) return;

  const rowsToAdd = dataRowCount - TEMPLATE_USABLE_DATA_ROWS;
  const emptyRow = Array(numCols).fill(undefined);
  const newRows = Array.from({ length: rowsToAdd }, () => [...emptyRow]);
  sheet.spliceRows(TEMPLATE_DATA_FIRST_ROW + 1, 0, ...newRows);

  const sourceRow = sheet.getRow(styleSourceRow);
  const sourceHeight = sourceRow.height ?? MIN_DATA_ROW_HEIGHT;
  for (let r = 0; r < rowsToAdd; r++) {
    const rowNum = TEMPLATE_DATA_FIRST_ROW + 1 + r;
    const row = sheet.getRow(rowNum);
    row.height = sourceHeight;
    for (let c = 1; c <= numCols; c++) {
      copyCellStyle(
        sheet.getCell(styleSourceRow, c),
        sheet.getCell(rowNum, c),
      );
    }
  }
}

/** Fila TOTALES: combinar A–F "TOTALES" centrado + sumas. Si N=1, TOTALES va en fila 9 (fila 8 queda como está). */
function writeTotalesRow(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  N: number,
  lastCol: number,
  opts?: { nullCol43?: boolean; mergeWithoutStyle?: boolean; skipMerge?: boolean },
): void {
  const lastDataRow = startRow + N - 1;
  const totalesRow = N === 1 ? startRow + 2 : startRow + N + 1;
  const totalesMergeRange = `A${totalesRow}:F${totalesRow}`;
  if (!opts?.skipMerge) {
    try {
      sheet.unMergeCells(totalesMergeRange);
    } catch {
      // ignore if not merged
    }
    if (opts?.mergeWithoutStyle) {
      (sheet as unknown as { mergeCellsWithoutStyle: (r: string) => void }).mergeCellsWithoutStyle(totalesMergeRange);
    } else {
      sheet.mergeCells(totalesMergeRange);
    }
  }
  const totalesLabel = sheet.getCell(totalesRow, 1);
  totalesLabel.value = "TOTALES";
  if (!totalesLabel.alignment) totalesLabel.alignment = {};
  totalesLabel.alignment.horizontal = "center";
  totalesLabel.alignment.vertical = "middle";
  sheet.getCell(totalesRow, 7).value = {
    formula: `SUM(G${startRow}:G${lastDataRow})`,
  };
  for (let col = 8; col <= lastCol; col++) {
    sheet.getCell(totalesRow, col).value = {
      formula: `SUM(${colLetter(col)}${startRow}:${colLetter(col)}${lastDataRow})`,
    };
  }
  if (opts?.nullCol43) {
    sheet.getCell(totalesRow, 43).value = null;
  }
}

/** maxCols: si se pasa, la fila tendrá solo esa cantidad de columnas (solo hasta columnas con encabezado). */
function buildVenerSheetRows(
  comprobantes: ComprobanteRow[],
  maxCols: number = 42,
): unknown[][] {
  const rows: unknown[][] = [];
  const trailingZeros = Math.max(0, maxCols - 14 - 6); // 14 datos + 6 ceros fijos + resto hasta maxCols

  for (const comp of comprobantes) {
    const fecha = toDisplayDate((comp["Fecha de Emisión"] ?? "") as string);
    const tipo = (comp["Tipo de Comprobante"] ?? "") as string;
    const ptoVta = (comp["Punto de Venta"] ?? "") as string;
    const nroDesde = (comp["Número Desde"] ?? "") as string;
    const cuitRec = (comp["Nro. Doc. Receptor"] ?? "") as string;
    const denomRec = (comp["Denominación Receptor"] ?? "") as string;

    const total = round2(parseAmount(comp["Imp. Total"]));
    const bi = round2(parseAmount(comp["Imp. Neto Gravado Total"]));
    const neto21 = round2(parseAmount(comp["Imp. Neto Gravado IVA 21%"]));
    const neto105 = round2(parseAmount(comp["Imp. Neto Gravado IVA 10,5%"]));
    const neto27 = round2(parseAmount(comp["Imp. Neto Gravado IVA 27%"]));
    const iva21 = round2(neto21 * 0.21);
    const iva105 = round2(neto105 * 0.105);
    const iva27 = round2(neto27 * 0.27);
    const exento = round2(parseAmount(comp["Imp. Op. Exentas"]));
    const noGrav = round2(parseAmount(comp["Imp. Neto No Gravado"]));
    const noAlcan = round2(parseAmount(comp["Imp. Neto Gravado IVA 0%"]));

    rows.push([
      fecha,
      tipo,
      ptoVta,
      nroDesde,
      cuitRec,
      denomRec,
      total,
      bi,
      iva21,
      iva105,
      iva27,
      exento,
      noGrav,
      noAlcan,
      0,
      0,
      0,
      0,
      0,
      0,
      ...Array(trailingZeros).fill(0),
    ]);
  }

  return rows;
}

function buildComerSheetRows(comprobantes: ComprobanteRow[]): unknown[][] {
  // Solo devolvemos filas de datos; la plantilla aporta encabezados y estilos.
  const rows: unknown[][] = [];

  for (const comp of comprobantes) {
    const fecha = sanitizeStringForXml(toDisplayDate((comp["Fecha de Emisión"] ?? "") as string));
    const tipo = sanitizeStringForXml((comp["Tipo de Comprobante"] ?? "") as string);
    const ptoVta = sanitizeStringForXml((comp["Punto de Venta"] ?? "") as string);
    const nroDesde = sanitizeStringForXml((comp["Número Desde"] ?? "") as string);
    const cuitEm = sanitizeStringForXml((comp["Nro. Doc. Emisor"] ?? "") as string);
    const denomEm = sanitizeStringForXml((comp["Denominación Emisor"] ?? "") as string);

    const total = round2(parseAmount(comp["Imp. Total"]));
    const bi = round2(parseAmount(comp["Imp. Neto Gravado Total"]));
    const neto21 = round2(parseAmount(comp["Imp. Neto Gravado IVA 21%"]));
    const neto105 = round2(parseAmount(comp["Imp. Neto Gravado IVA 10,5%"]));
    const neto27 = round2(parseAmount(comp["Imp. Neto Gravado IVA 27%"]));
    const iva21 = round2(neto21 * 0.21);
    const iva105 = round2(neto105 * 0.105);
    const iva27 = round2(neto27 * 0.27);
    const noGrav = round2(parseAmount(comp["Imp. Neto No Gravado"]));

    rows.push([
      fecha,
      tipo,
      ptoVta,
      nroDesde,
      cuitEm,
      denomEm,
      total,
      bi,
      iva21,
      iva105,
      iva27,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      noGrav,
      "",
    ]);
  }

  return rows;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  processing: "Procesando…",
  success: "Exitoso",
  partial: "Parcial",
  failed: "Error",
  retrying: "Reintentando…",
  cancelled: "Cancelado",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BotComprobantesPage() {
  /* ---------- form state ---------- */
  const [accounts, setAccounts] = useState<AccountEntry[]>([newAccount()]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compType, setCompType] = useState<"" | "E" | "R">("");

  /* ---------- execution state ---------- */
  const [running, setRunning] = useState(false);
  const [tasks, setTasks] = useState<TaskResult[]>([]);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<"table" | "json">("table");
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /* ---------- import state ---------- */
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [csvImportError, setCsvImportError] = useState("");

  /* ---------- navigation guard ---------- */
  const router = useRouter();
  const shouldGuard = running || tasks.length > 0;

  // Browser tab close / refresh
  useEffect(() => {
    if (!shouldGuard) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldGuard]);

  // In-app link clicks (back link, logo, etc.)
  const guardedNavigate = useCallback(
    (href: string) => {
      if (!shouldGuard || window.confirm("¿Estás seguro de que querés salir? Se perderán los resultados del bot.")) {
        router.push(href);
      }
    },
    [shouldGuard, router],
  );

  /* ---------- password visibility per account ---------- */
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(
    new Set(),
  );

  const togglePasswordVisibility = (id: string) =>
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ---------- account management ---------- */
  const addAccount = () => setAccounts((prev) => [...prev, newAccount()]);

  const removeAccount = (id: string) =>
    setAccounts((prev) =>
      prev.length <= 1 ? prev : prev.filter((a) => a.id !== id),
    );

  const updateAccount = (
    id: string,
    field: keyof AccountEntry,
    value: string,
  ) =>
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)),
    );

  /* ---------- JSON import ---------- */
  const handleJsonImport = () => {
    try {
      const parsed = JSON.parse(importText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Se esperaba un array JSON no vacío");
      }

      const imported: AccountEntry[] = parsed.map(
        (item: Record<string, unknown>) => ({
          id: uid(),
          cuit: String(item.cuit ?? ""),
          password: String(item.password ?? ""),
          queriedCuits: Array.isArray(item.queried_cuit)
            ? (item.queried_cuit as string[]).join(", ")
            : String(item.queried_cuit ?? ""),
        }),
      );

      setAccounts(imported);

      const first = parsed[0];
      if (
        typeof first.date_from === "string" &&
        first.date_from.includes("/")
      ) {
        setDateFrom(fromApiDate(first.date_from));
      }
      if (typeof first.date_to === "string" && first.date_to.includes("/")) {
        setDateTo(fromApiDate(first.date_to));
      }
      if (first.type === "E" || first.type === "R") {
        setCompType(first.type);
      }

      setImportError("");
      setImportText("");
      setShowImport(false);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "JSON inválido");
    }
  };

  /* ---------- CSV import ---------- */
  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? "");
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length < 2) {
          throw new Error("El CSV no tiene filas de datos");
        }

        const headerLine = lines[0];
        const delimiter = headerLine.includes(";") ? ";" : ",";
        const headers = headerLine
          .split(delimiter)
          .map((h) => h.trim().toLowerCase());

        const idxCuit = headers.findIndex((h) => h === "cuit");
        const idxAfip = headers.findIndex((h) => h === "afip");
        const idxCuitPj = headers.findIndex(
          (h) => h === "cuit pj" || h === "cuit_pj" || h === "cuitpj",
        );

        if (idxCuit === -1 || idxAfip === -1) {
          throw new Error(
            'El CSV debe tener al menos las columnas "CUIT" y "AFIP".',
          );
        }

        const imported: AccountEntry[] = [];

        for (let i = 1; i < lines.length; i++) {
          const raw = lines[i];
          if (!raw) continue;
          const cols = raw.split(delimiter);

          const cuit = (cols[idxCuit] ?? "").trim();
          const password = (cols[idxAfip] ?? "").trim();

          if (!cuit || !password) {
            // Fila incompleta, la ignoramos
            continue;
          }

          let queriedRaw =
            idxCuitPj !== -1 ? (cols[idxCuitPj] ?? "").trim() : "";
          if (!queriedRaw) {
            queriedRaw = cuit;
          }

          const queriedList = queriedRaw
            .split(/[,\s;]+/)
            .map((v) => v.trim())
            .filter(Boolean);

          const queriedCuits = queriedList.join(", ");

          imported.push({
            id: uid(),
            cuit,
            password,
            queriedCuits,
          });
        }

        if (imported.length === 0) {
          throw new Error("No se encontraron filas válidas en el CSV.");
        }

        setAccounts(imported);
        setCsvImportError("");
      } catch (err) {
        setCsvImportError(
          err instanceof Error ? err.message : "No se pudo leer el CSV.",
        );
      }
    };
    reader.onerror = () => {
      setCsvImportError("Error al leer el archivo CSV.");
    };
    reader.readAsText(file);
  };

  const handleCsvInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImportError("");
    handleCsvFile(file);
    // Permite volver a seleccionar el mismo archivo luego
    e.target.value = "";
  };

  /* ---------- export results ---------- */
  const exportResults = () => {
    const data = tasks.map((t) => ({
      cuit: t.cuit,
      queried_cuits: t.queriedCuits,
      status: t.status,
      duration_ms: t.duration,
      ...(t.data || {}),
      ...(t.error ? { error: t.error } : {}),
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bot-comprobantes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportVenerExcel = async () => {
    const allEmitidos: ComprobanteRow[] = [];
    for (const t of tasks) {
      if (!t.data) continue;
      if (t.status !== "success" && t.status !== "partial") continue;
      allEmitidos.push(...collectEmitidos(t.data));
    }
    try {
      const res = await fetch("/templates/VENTAS_template.xlsx");
      if (!res.ok) throw new Error("No se pudo cargar la plantilla VENTAS.");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await res.arrayBuffer());
      const sheet = wb.worksheets[0];
      if (!sheet) throw new Error("La plantilla VENTAS no tiene hojas.");

      const suffix = formatMonthSuffix(dateFrom || dateTo);
      const filename =
        `VENTAS${suffix || new Date().toISOString().slice(5, 7) + new Date().getFullYear().toString().slice(-2)}.xlsx`;

      if (allEmitidos.length > 0) {
        stripAllFormulasInSheet(sheet);
        const startRow = TEMPLATE_DATA_FIRST_ROW;
        const lastHeaderCol =
          Math.max(
            getLastHeaderColumn(sheet, 4),
            getLastHeaderColumn(sheet, 5),
            getLastHeaderColumn(sheet, 6),
          ) || 42;
        const dataRows = buildVenerSheetRows(allEmitidos, lastHeaderCol);
        const N = dataRows.length;
        const styleRow = startRow;

        replaceFormulasWithValuesInRange(sheet, startRow, startRow + TEMPLATE_USABLE_DATA_ROWS - 1, MAX_COLS_FOR_REPLACE_FORMULAS);
        if (N > TEMPLATE_USABLE_DATA_ROWS) {
          ensureDataRowsBetween7And8(sheet, N, lastHeaderCol, styleRow);
        }
        stripAllFormulasInSheet(sheet);
        if (N === 1) sheet.spliceRows(startRow + 1, 1);
        replaceFormulasWithValuesInRange(sheet, startRow, startRow + N - 1, MAX_COLS_FOR_REPLACE_FORMULAS);
        for (let r = N - 1; r >= 0; r--) {
          for (let c = 1; c <= lastHeaderCol; c++) {
            const cell = sheet.getCell(startRow + r, c);
            copyCellStyle(sheet.getCell(styleRow, c), cell);
            cell.value = null;
          }
        }
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < dataRows[r].length; c++) {
            const cell = sheet.getCell(startRow + r, c + 1);
            copyCellStyle(sheet.getCell(styleRow, c + 1), cell);
            cell.value = sanitizeCellValueForXml((dataRows[r] as unknown[])[c]);
          }
        }
        const sumEndCol = colLetter(lastHeaderCol);
        for (let i = 0; i < N; i++) {
          const rowNum = startRow + i;
          sheet.getCell(rowNum, 7).value = { formula: `SUM(H${rowNum}:${sumEndCol}${rowNum})` };
        }
        writeTotalesRow(sheet, startRow, N, lastHeaderCol);
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Error al exportar VENTAS: ${msg}`);
    }
  };

  const exportComerExcel = async () => {
    const allRecibidos: ComprobanteRow[] = [];
    for (const t of tasks) {
      if (!t.data) continue;
      if (t.status !== "success" && t.status !== "partial") continue;
      allRecibidos.push(...collectRecibidos(t.data));
    }
    try {
      const res = await fetch("/templates/COMPRAS_template.xlsx");
      if (!res.ok) throw new Error("No se pudo cargar la plantilla COMPRAS.");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await res.arrayBuffer(), {
        ignoreNodes: ["mergeCells", "conditionalFormatting"],
      });
      const sheet = wb.worksheets[0];
      if (!sheet) throw new Error("La plantilla COMPRAS no tiene hojas.");

      const suffix = formatMonthSuffix(dateFrom || dateTo);
      const filename =
        `COMPRAS${suffix || new Date().toISOString().slice(5, 7) + new Date().getFullYear().toString().slice(-2)}.xlsx`;

      if (allRecibidos.length > 0) {
        const b2 = sheet.getCell(2, 2);
        if (typeof b2.value === "string") {
          b2.value = sanitizeStringForXml(b2.value);
        }
        if (!b2.alignment) b2.alignment = {};
        b2.alignment.wrapText = false;
        b2.alignment.shrinkToFit = false;
        stripAllFormulasInSheet(sheet);

        const startRow = TEMPLATE_DATA_FIRST_ROW;
        const COMPRAS_COLS = 43;
        const dataRows = buildComerSheetRows(allRecibidos);
        const N = dataRows.length;
        const styleRow = startRow;

        replaceFormulasWithValuesInRange(sheet, startRow, startRow + TEMPLATE_USABLE_DATA_ROWS - 1, MAX_COLS_FOR_REPLACE_FORMULAS);
        if (N > TEMPLATE_USABLE_DATA_ROWS) {
          ensureDataRowsBetween7And8(sheet, N, COMPRAS_COLS, styleRow);
        }
        stripAllFormulasInSheet(sheet);
        if (N === 1) sheet.spliceRows(startRow + 1, 1);
        replaceFormulasWithValuesInRange(sheet, startRow, startRow + N - 1, MAX_COLS_FOR_REPLACE_FORMULAS);
        for (let r = N - 1; r >= 0; r--) {
          for (let c = 1; c <= COMPRAS_COLS; c++) {
            const cell = sheet.getCell(startRow + r, c);
            copyCellStyle(sheet.getCell(styleRow, c), cell);
            cell.value = null;
          }
        }
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < (dataRows[r] as unknown[]).length; c++) {
            const cell = sheet.getCell(startRow + r, c + 1);
            copyCellStyle(sheet.getCell(styleRow, c + 1), cell);
            cell.value = sanitizeCellValueForXml((dataRows[r] as unknown[])[c]);
          }
        }
        for (let i = 0; i < N; i++) {
          const rowNum = startRow + i;
          sheet.getCell(rowNum, 7).value = { formula: `SUM(H${rowNum}:AP${rowNum})` };
        }
        writeTotalesRow(sheet, startRow, N, 42, { nullCol43: true, mergeWithoutStyle: true });
      }

      let buffer: ArrayBuffer | Buffer = await wb.xlsx.writeBuffer();
      buffer = await sanitizeSheet1XmlInXlsxBuffer(buffer);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Error al exportar COMPRAS: ${msg}`);
    }
  };

  /* ---------- SSE event handler ---------- */
  const handleSSEEvent = (event: Record<string, unknown>) => {
    switch (event.type) {
      case "processing": {
        const idx = event.index as number;
        const attempt = event.attempt as number;
        setTasks((prev) =>
          prev.map((t) =>
            t.index === idx
              ? { ...t, status: "processing", attempt }
              : t,
          ),
        );
        break;
      }
      case "item_result": {
        const idx = event.index as number;
        const isFinal = event.isFinal as boolean;
        const success = event.success as boolean;
        const hasErrors = event.hasErrors as boolean;
        const duration = event.duration as number;
        const result = event.result as Record<string, unknown>;
        const attempt = event.attempt as number;

        let status: TaskStatus;
        let error: string | undefined;

        if (isFinal) {
          if (success && !hasErrors) {
            status = "success";
          } else if (success && hasErrors) {
            status = "partial";
          } else {
            status = "failed";
          }
          error = (result.error as string) ?? undefined;
        } else {
          status = "retrying";
          error = (result.error as string) ?? undefined;
        }

        setTasks((prev) =>
          prev.map((t) =>
            t.index === idx
              ? { ...t, status, data: result, error, duration, attempt }
              : t,
          ),
        );
        break;
      }
      case "retry_round": {
        const attempt = event.attempt as number;
        const count = event.count as number;
        setRetryInfo(
          `Reintento ${attempt} de 3 — ${count} cuenta${count !== 1 ? "s" : ""} pendiente${count !== 1 ? "s" : ""}`,
        );
        break;
      }
      case "complete": {
        setRetryInfo(null);
        setRunning(false);
        break;
      }
      case "error": {
        setRetryInfo(null);
        setRunning(false);
        break;
      }
    }
  };

  /* ---------- run bot via streaming bulk endpoint ---------- */
  const runBot = async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setRunning(true);
    setExpandedTask(null);
    setRetryInfo(null);

    // Build API payload in the bulk endpoint format
    const payload = accounts.map((acc) => {
      const queriedCuits = acc.queriedCuits
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      return {
        cuit: acc.cuit,
        password: acc.password,
        queried_cuit:
          queriedCuits.length === 1 ? queriedCuits[0] : queriedCuits,
        date_from: toApiDate(dateFrom),
        date_to: toApiDate(dateTo),
        ...(compType ? { type: compType } : {}),
      };
    });

    // Initialize all tasks as pending
    const initialTasks: TaskResult[] = accounts.map((acc, idx) => ({
      index: idx,
      cuit: acc.cuit,
      queriedCuits: acc.queriedCuits
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      status: "pending" as TaskStatus,
      attempt: 0,
    }));
    setTasks(initialTasks);

    try {
      const response = await fetch("/api/bot/comprobantes/bulk/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(
          err.error || err.details?.join(", ") || "Error del servidor",
        );
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double newline (SSE message boundary)
        const parts = buffer.split("\n\n");
        buffer = parts.pop()!;

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(trimmed.slice(6));
            handleSSEEvent(event);
          } catch {
            // skip malformed events
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim().startsWith("data: ")) {
        try {
          const event = JSON.parse(buffer.trim().slice(6));
          handleSSEEvent(event);
        } catch {
          // skip
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Admin cancelled — mark unfinished tasks
        setTasks((prev) =>
          prev.map((t) =>
            t.status === "pending" ||
            t.status === "processing" ||
            t.status === "retrying"
              ? { ...t, status: "cancelled" }
              : t,
          ),
        );
      } else {
        // Unexpected error — mark all pending as failed
        const msg = err instanceof Error ? err.message : String(err);
        setTasks((prev) =>
          prev.map((t) =>
            t.status === "pending" ||
            t.status === "processing" ||
            t.status === "retrying"
              ? { ...t, status: "failed", error: msg }
              : t,
          ),
        );
      }
    }

    setRetryInfo(null);
    setRunning(false);
  };

  const cancelBot = () => {
    abortControllerRef.current?.abort();
  };

  /* ---------- computed ---------- */
  const succeeded = tasks.filter((t) => t.status === "success").length;
  const partial = tasks.filter((t) => t.status === "partial").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const cancelled = tasks.filter((t) => t.status === "cancelled").length;
  const retrying = tasks.filter((t) => t.status === "retrying").length;
  const inProgress = tasks.filter(
    (t) =>
      t.status === "pending" ||
      t.status === "processing" ||
      t.status === "retrying",
  ).length;
  const total = tasks.length;
  const finished = succeeded + partial + failed;
  const progress = total > 0 ? (finished / total) * 100 : 0;

  const canRun =
    !running &&
    dateFrom !== "" &&
    dateTo !== "" &&
    accounts.length > 0 &&
    accounts.every(
      (a) => a.cuit.trim() && a.password.trim() && a.queriedCuits.trim(),
    );

  /* ---------- render ---------- */
  return (
    <main className="bot-container">
      {/* Navigation */}
      <a
        className="back-link"
        href="/"
        onClick={(e) => {
          e.preventDefault();
          guardedNavigate("/");
        }}
      >
        ← Volver al inicio
      </a>

      {/* Header */}
      <header className="page-header">
        <a
          className="logo-link"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            guardedNavigate("/");
          }}
        >
          <img src="/LOGO.jpeg" alt="Logo" className="page-logo" />
        </a>
        <div>
          <h1>Bot Comprobantes</h1>
          <p className="subtitle">
            Consultar comprobantes de Mis Comprobantes (AFIP) en lote.
            Configurá las cuentas, las fechas, y lanzá el bot.
          </p>
        </div>
      </header>

      {/* ── Configuration ── */}
      <section className="tool-card">
        <h2>⚙️ Configuración general</h2>
        <div className="bot-form-row">
          <div className="bot-field">
            <label htmlFor="date-from">Fecha desde</label>
            <input
              id="date-from"
              type="date"
              className="bot-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={running}
            />
          </div>
          <div className="bot-field">
            <label htmlFor="date-to">Fecha hasta</label>
            <input
              id="date-to"
              type="date"
              className="bot-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={running}
            />
          </div>
          <div className="bot-field" style={{ maxWidth: 200 }}>
            <label htmlFor="comp-type">Tipo</label>
            <select
              id="comp-type"
              className="bot-select"
              value={compType}
              onChange={(e) =>
                setCompType(e.target.value as "" | "E" | "R")
              }
              disabled={running}
            >
              <option value="">Emitidos y Recibidos</option>
              <option value="E">Solo Emitidos</option>
              <option value="R">Solo Recibidos</option>
            </select>
          </div>
        </div>
      </section>

      {/* ── Accounts ── */}
      <section className="tool-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.5rem",
          }}
        >
          <h2>👥 Cuentas ({accounts.length})</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="btn-sm btn-outline"
              onClick={() => {
                setShowImport((v) => !v);
                setImportError("");
              }}
              disabled={running}
            >
              {showImport ? "Cerrar" : "📋 Importar JSON"}
            </button>
            <button
              className="btn-sm btn-outline"
              onClick={() => {
                setCsvImportError("");
                csvFileInputRef.current?.click();
              }}
              disabled={running}
            >
              📥 Importar CSV
            </button>
            <input
              ref={csvFileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={handleCsvInputChange}
            />
          </div>
        </div>

        {/* JSON Import Section */}
        {showImport && (
          <div style={{ marginBottom: "0.75rem" }}>
            <textarea
              className="bot-import-area"
              placeholder={`[\n  {\n    "cuit": "20123456789",\n    "password": "clave",\n    "queried_cuit": ["20111111111", "20222222222"],\n    "date_from": "01/01/2025",\n    "date_to": "31/01/2025"\n  }\n]`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <p className="bot-import-hint">
              Pegá un JSON con el mismo formato del endpoint
              /api/bot/comprobantes/bulk
            </p>
            {importError && (
              <p className="bot-import-error">⚠ {importError}</p>
            )}
            <div style={{ marginTop: "0.4rem" }}>
              <button
                className="btn-sm btn-outline"
                onClick={handleJsonImport}
                disabled={!importText.trim()}
              >
                Importar
              </button>
            </div>
          </div>
        )}

        {csvImportError && (
          <p className="bot-import-error" style={{ marginTop: "0.25rem" }}>
            ⚠ {csvImportError}
          </p>
        )}

        {/* Account rows */}
        {accounts.map((acc, idx) => (
          <div key={acc.id} className="bot-account-row">
            <span className="bot-account-num">{idx + 1}</span>
            <div className="bot-field">
              <label>CUIT</label>
              <input
                className="bot-input"
                placeholder="20123456789"
                value={acc.cuit}
                onChange={(e) =>
                  updateAccount(acc.id, "cuit", e.target.value)
                }
                disabled={running}
              />
            </div>
            <div className="bot-pass-wrapper">
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#1b4332",
                  marginBottom: "0.3rem",
                }}
              >
                Contraseña
              </label>
              <div style={{ position: "relative" }}>
                <input
                  className="bot-input"
                  type={
                    visiblePasswords.has(acc.id) ? "text" : "password"
                  }
                  placeholder="••••••"
                  value={acc.password}
                  onChange={(e) =>
                    updateAccount(acc.id, "password", e.target.value)
                  }
                  disabled={running}
                  style={{ paddingRight: "2rem" }}
                />
                <button
                  type="button"
                  className="bot-pass-toggle"
                  onClick={() => togglePasswordVisibility(acc.id)}
                  tabIndex={-1}
                >
                  {visiblePasswords.has(acc.id) ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <div className="bot-field" style={{ flex: 2 }}>
              <label>CUITs a consultar</label>
              <input
                className="bot-input"
                placeholder="20111111111, 20222222222"
                value={acc.queriedCuits}
                onChange={(e) =>
                  updateAccount(acc.id, "queriedCuits", e.target.value)
                }
                disabled={running}
              />
            </div>
            <button
              className="bot-remove-btn"
              onClick={() => removeAccount(acc.id)}
              disabled={running || accounts.length <= 1}
              title="Eliminar cuenta"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="bot-actions-row">
          <button
            className="btn-sm btn-outline"
            onClick={addAccount}
            disabled={running}
          >
            + Agregar cuenta
          </button>
        </div>
      </section>

      {/* ── Controls ── */}
      <div className="bot-controls">
        <button className="btn primary" onClick={runBot} disabled={!canRun}>
          🚀 Ejecutar Bot
        </button>
        {running && (
          <button className="btn btn-danger" onClick={cancelBot}>
            ✕ Cancelar
          </button>
        )}
        {tasks.length > 0 && !running && (
          <>
            <button
              className="btn-sm btn-outline"
              onClick={exportResults}
            >
              📥 Exportar JSON
            </button>
            <button
              className="btn-sm btn-outline"
              onClick={exportVenerExcel}
            >
              📊 Exportar VENTAS (Emitidos)
            </button>
            <button
              className="btn-sm btn-outline"
              onClick={exportComerExcel}
            >
              📊 Exportar COMPRAS (Recibidos)
            </button>
          </>
        )}
      </div>

      {/* ── Progress & Results ── */}
      {tasks.length > 0 && (
        <section>
          {/* Progress bar */}
          <div className="bot-progress-section">
            <div className="bot-progress-bar">
              <div
                className={`bot-progress-fill${failed > 0 ? " has-errors" : ""}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="bot-progress-text">
              {running
                ? `Procesando… ${finished} de ${total} completados`
                : `Finalizado: ${finished} de ${total} procesados`}
              {cancelled > 0 && ` (${cancelled} cancelados)`}
            </p>
            {retryInfo && (
              <p className="bot-retry-info">🔄 {retryInfo}</p>
            )}
          </div>

          {/* Summary badges */}
          <div className="bot-summary">
            {succeeded > 0 && (
              <span className="bot-stat stat-success">
                ✓ {succeeded} exitosos
              </span>
            )}
            {partial > 0 && (
              <span className="bot-stat stat-partial">
                ⚠ {partial} parciales
              </span>
            )}
            {failed > 0 && (
              <span className="bot-stat stat-failed">
                ✕ {failed} errores
              </span>
            )}
            {retrying > 0 && (
              <span className="bot-stat stat-retrying">
                🔄 {retrying} reintentando
              </span>
            )}
            {inProgress > 0 && running && (
              <span className="bot-stat stat-pending">
                ⏳ {inProgress} pendientes
              </span>
            )}
            {cancelled > 0 && (
              <span className="bot-stat stat-cancelled">
                ⊘ {cancelled} cancelados
              </span>
            )}
          </div>

          {/* Result cards */}
          {tasks.map((task) => (
            <div
              key={task.index}
              className={`bot-result-card status-${task.status}`}
            >
              <div
                className="bot-result-header"
                onClick={() =>
                  setExpandedTask((prev) =>
                    prev === task.index ? null : task.index,
                  )
                }
              >
                <span className={`bot-badge badge-${task.status}`}>
                  {STATUS_LABELS[task.status]}
                </span>
                <span className="bot-result-cuit">{task.cuit}</span>
                <span className="bot-result-arrow">→</span>
                <span className="bot-result-queried">
                  {task.queriedCuits.length <= 2
                    ? task.queriedCuits.join(", ")
                    : `${task.queriedCuits[0]} +${task.queriedCuits.length - 1} más`}
                </span>
                <span className="bot-result-meta">
                  {task.attempt > 0 && (
                    <span className="bot-result-attempt">
                      intento {task.attempt + 1}
                    </span>
                  )}
                  {task.duration !== undefined && (
                    <span className="bot-result-duration">
                      {formatDuration(task.duration)}
                    </span>
                  )}
                  {task.data &&
                    (task.status === "success" ||
                      task.status === "partial") && (
                      <span className="bot-result-summary-text">
                        {getResultSummary(task.data)}
                      </span>
                    )}
                  <span
                    className={`bot-result-chevron${expandedTask === task.index ? " expanded" : ""}`}
                  >
                    ▶
                  </span>
                </span>
              </div>

              {expandedTask === task.index && (
                <div className="bot-result-detail">
                  {/* Error (always visible) */}
                  {task.error && (
                    <div className="bot-result-error">
                      <strong>Error:</strong> {task.error}
                    </div>
                  )}

                  {task.data && (
                    <>
                      {/* Tabs */}
                      <div className="bot-detail-tabs">
                        <button
                          className={`bot-detail-tab${detailTab === "table" ? " active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailTab("table");
                          }}
                        >
                          📊 Tabla
                        </button>
                        <button
                          className={`bot-detail-tab${detailTab === "json" ? " active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailTab("json");
                          }}
                        >
                          {"{ }"} JSON
                        </button>
                      </div>

                      {/* Tab: Table */}
                      {detailTab === "table" && (
                        <div>
                          {extractComprobantesGroups(task.data).length > 0 ? (
                            extractComprobantesGroups(task.data).map(
                              (group, gi) => (
                                <div
                                  key={gi}
                                  className="bot-table-group"
                                >
                                  <h4 className="bot-table-group-title">
                                    {group.label} ({group.count})
                                  </h4>
                                  {group.comprobantes.length > 0 ? (
                                    <div className="bot-table-wrapper">
                                      <table className="bot-table">
                                        <thead>
                                          <tr>
                                            {Object.keys(
                                              group.comprobantes[0],
                                            ).map((col) => (
                                              <th key={col}>
                                                {COL_SHORT[col] ?? col}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {group.comprobantes.map(
                                            (comp, ci) => (
                                              <tr key={ci}>
                                                {Object.keys(
                                                  group.comprobantes[0],
                                                ).map((col) => (
                                                  <td key={col}>
                                                    {comp[col] || "—"}
                                                  </td>
                                                ))}
                                              </tr>
                                            ),
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="bot-table-empty">
                                      Sin comprobantes
                                    </p>
                                  )}
                                </div>
                              ),
                            )
                          ) : (
                            <p
                              style={{
                                color: "#999",
                                fontSize: "0.85rem",
                              }}
                            >
                              No se encontraron comprobantes en la
                              respuesta.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Tab: JSON */}
                      {detailTab === "json" && (
                        <pre className="bot-result-json">
                          {JSON.stringify(task.data, null, 2)}
                        </pre>
                      )}
                    </>
                  )}

                  {!task.data && !task.error && (
                    <p style={{ color: "#999", fontSize: "0.85rem" }}>
                      Sin datos disponibles.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
