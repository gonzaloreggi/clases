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
