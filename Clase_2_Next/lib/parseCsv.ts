/**
 * Parse CSV with delimiter ; and quoted fields.
 * Used by SUSS, ARCIBA, SICORE GANANCIAS.
 */
export function parseCSV(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delimiter || c === "\n") {
        current.push(field.trim());
        field = "";
        if (c === "\n") {
          if (current.some((cell) => cell !== "")) rows.push(current);
          current = [];
        }
      } else field += c;
    }
  }
  if (field !== "" || current.length > 0) {
    current.push(field.trim());
    if (current.some((cell) => cell !== "")) rows.push(current);
  }
  return rows;
}
