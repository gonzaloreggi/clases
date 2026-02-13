/** Shared utility functions used across multiple parseo transforms. */

/** Find column index by exact header name match (case-insensitive). Returns -1 if not found. */
export function findCol(headers: string[], name: string): number {
  const n = name.trim().toUpperCase();
  const i = headers.findIndex((h) => String(h || "").trim().toUpperCase() === n);
  return i >= 0 ? i : -1;
}

/** Find column index where header contains the given substring (case-insensitive). Returns -1 if not found. */
export function findColContaining(headers: string[], part: string): number {
  const normalized = part.trim().toUpperCase();
  const idx = headers.findIndex((h) => String(h || "").toUpperCase().includes(normalized));
  return idx >= 0 ? idx : -1;
}

/** Normalize date string dd/mm/yyyy with zero-padding. */
export function normalizeFecha(str: string): string {
  const s = String(str || "").trim();
  const parts = s.split("/").map((p) => p.trim());
  if (parts.length !== 3) return "01/01/1900";
  const dd = Math.max(1, Math.min(31, parseInt(parts[0], 10) || 1));
  const mm = Math.max(1, Math.min(12, parseInt(parts[1], 10) || 1));
  const yyyy = parseInt(parts[2], 10) || 1900;
  const year4 = String(yyyy).padStart(4, "0").slice(-4);
  return String(dd).padStart(2, "0") + "/" + String(mm).padStart(2, "0") + "/" + year4;
}

/** Convert dd/mm/yyyy to a sortable number yyyymmdd. */
export function parseFechaSortable(str: string): number {
  const s = String(str || "").trim();
  const parts = s.split("/");
  if (parts.length !== 3) return 0;
  const dd = parseInt(parts[0], 10) || 0;
  const mm = parseInt(parts[1], 10) || 0;
  const yyyy = parseInt(parts[2], 10) || 0;
  return yyyy * 10000 + mm * 100 + dd;
}

/** Sort rows by a date column (dd/mm/yyyy). If colIdx < 0, returns rows unchanged. */
export function sortRowsByFecha(rows: unknown[][], colIdx: number): unknown[][] {
  if (colIdx < 0) return rows;
  return [...rows].sort(
    (a, b) =>
      parseFechaSortable(String(a[colIdx] ?? "")) - parseFechaSortable(String(b[colIdx] ?? ""))
  );
}

/** Parse numeric value with optional comma as decimal separator. Returns 0 if invalid. */
export function parseAmount(value: unknown): number {
  return parseFloat(String(value ?? "0").trim().replace(",", ".")) || 0;
}

/** Read cell as string. If colIdx < 0 returns fallback (default ""). */
export function cellStr(row: unknown[], colIdx: number, fallback = ""): string {
  if (colIdx < 0) return fallback;
  return String(row[colIdx] ?? "").trim();
}

/** Read cell and return only digits. */
export function cellDigits(row: unknown[], colIdx: number): string {
  return cellStr(row, colIdx).replace(/\D/g, "");
}

/**
 * Format number with 2 decimal places, comma as decimal separator.
 * - For len=16, padChar="0": ARCIBA behavior (13 digits + comma + 2 decimals).
 * - Otherwise: SICORE behavior (pad or truncate to len with padChar).
 */
export function formatNumber(
  num: number | string,
  len: number,
  padChar: "0" | " " = "0"
): string {
  const n = parseFloat(String(num).replace(",", ".")) || 0;
  const [intPart, decPart] = n.toFixed(2).split(".");
  const s = intPart + "," + (decPart || "00");
  if (len === 16 && padChar === "0") {
    return intPart.padStart(13, "0") + "," + (decPart || "00");
  }
  return s.length > len ? s.slice(-len) : s.padStart(len, padChar);
}
