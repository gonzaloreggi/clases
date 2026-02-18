# Oportunidades de refactor en las funciones de parseo

Este documento describe patrones de codigo duplicado que se encontraron en las funciones de transformacion de cada pagina de parseo (`suss`, `iva`, `arciba`, `sicore-ganancias`), junto con propuestas concretas para mejorarlos.

Todas las propuestas apuntan a agregar funciones compartidas en `lib/parseoUtils.ts`.

---

## 1. Formateo de numeros con coma decimal

### Donde esta el problema

Hay dos funciones casi identicas en paginas distintas:

- **ARCIBA** - `formatNum16(num)`: parsea el numero, formatea a 2 decimales con coma, y rellena con ceros a la izquierda hasta 16 caracteres.
- **SICORE** - `formatNumFixed(num, len)`: hace lo mismo pero acepta un largo configurable y rellena con espacios.

Ambas comparten el 80% de la logica (parseo de coma decimal, `toFixed(2)`, split en parte entera y decimal).

### Propuesta

Crear una unica funcion en `parseoUtils.ts`:

```typescript
/**
 * Formatea un numero con 2 decimales usando coma como separador decimal.
 * Rellena a la izquierda hasta alcanzar `len` caracteres con `padChar`.
 */
export function formatNumber(
  num: number | string,
  len: number,
  padChar: "0" | " " = "0"
): string {
  const n = parseFloat(String(num).replace(",", ".")) || 0;
  const [intPart, decPart] = n.toFixed(2).split(".");
  let s = intPart + "," + (decPart || "00");
  if (s.length > len) s = s.slice(-len);
  else s = s.padStart(len, padChar);
  return s;
}
```

Reemplazos:
- `formatNum16(x)` &rarr; `formatNumber(x, 16, "0")`
- `formatNumFixed(x, 14)` &rarr; `formatNumber(x, 14, " ")`

---

## 2. Ordenar filas por columna de fecha

### Donde esta el problema

ARCIBA y SICORE tienen un bloque identico (copy-paste) para ordenar las filas por fecha:

```typescript
const sortedRows =
  idx.fecha >= 0
    ? [...rows].sort(
        (a, b) =>
          parseFechaSortable(String(a[idx.fecha] ?? "")) -
          parseFechaSortable(String(b[idx.fecha] ?? ""))
      )
    : rows;
```

### Propuesta

Extraer a `parseoUtils.ts`:

```typescript
/** Ordena filas por una columna de fecha (dd/mm/yyyy). Si colIdx < 0, devuelve las filas sin cambios. */
export function sortRowsByFecha(rows: unknown[][], colIdx: number): unknown[][] {
  if (colIdx < 0) return rows;
  return [...rows].sort(
    (a, b) =>
      parseFechaSortable(String(a[colIdx] ?? "")) -
      parseFechaSortable(String(b[colIdx] ?? ""))
  );
}
```

---

## 3. Parsear un importe desde una celda

### Donde esta el problema

El patron de parsear un valor numerico con coma decimal desde una celda aparece al menos 5 veces entre ARCIBA, SICORE y SUSS:

```typescript
// ARCIBA y SICORE:
parseFloat(String(idx.valor >= 0 ? row[idx.valor] ?? "0" : "0").replace(",", ".")) || 0;

// SUSS:
parseFloat(String(row[6] ?? "0").trim().replace(",", ".")) || 0;
```

### Propuesta

```typescript
/** Parsea un valor numerico que puede tener coma como separador decimal. Devuelve 0 si no es valido. */
export function parseAmount(value: unknown): number {
  return parseFloat(String(value ?? "0").trim().replace(",", ".")) || 0;
}
```

Reemplazos:
- `parseFloat(String(...).replace(",", ".")) || 0` &rarr; `parseAmount(row[idx.valor])`
- Se elimina la necesidad de manejar el `idx >= 0` inline si se combina con `cellStr` (ver punto 4).

---

## 4. Lectura segura de una celda como string

### Donde esta el problema

Este micro-patron se repite ~15 veces entre las 4 paginas:

```typescript
idx.something >= 0 ? String(row[idx.something] ?? "").trim() : ""
```

Es verbose y propenso a inconsistencias (a veces se omite el `.trim()`, a veces no se chequea el indice).

### Propuesta

```typescript
/** Lee una celda como string. Si colIdx < 0 devuelve el fallback (default ""). */
export function cellStr(row: unknown[], colIdx: number, fallback = ""): string {
  if (colIdx < 0) return fallback;
  return String(row[colIdx] ?? "").trim();
}
```

Ejemplo de uso:

```typescript
// Antes:
const num_comp = idx.num_comp >= 0 ? String(row[idx.num_comp] ?? "").trim() : "";

// Despues:
const num_comp = cellStr(row, idx.num_comp);
```

---

## 5. Extraccion de CUIT (solo digitos)

### Donde esta el problema

ARCIBA y SICORE tienen la misma linea:

```typescript
const cuit = idx.cuit >= 0 ? String(row[idx.cuit] ?? "").replace(/\D/g, "") : "";
```

### Propuesta

Puede resolverse componiendo `cellStr` con un strip de no-digitos:

```typescript
/** Lee una celda y devuelve solo los digitos. */
export function cellDigits(row: unknown[], colIdx: number): string {
  return cellStr(row, colIdx).replace(/\D/g, "");
}
```

---

## 6. Copia redundante de headers

### Donde esta el problema

Tanto ARCIBA como SICORE hacen:

```typescript
const csvHeaders = headers.map((h) => String(h));
```

Esto es innecesario porque `headers` ya es `string[]` (el componente compartido `ParseoPageLayout` lo garantiza).

### Propuesta

Eliminar esas lineas y usar `headers` directamente en las llamadas a `findCol`.

---

## Resumen

| # | Patron duplicado | Paginas afectadas | Funcion propuesta | Impacto |
|---|---|---|---|---|
| 1 | Formateo numerico con coma decimal | ARCIBA, SICORE | `formatNumber(num, len, padChar)` | Alto - elimina 2 funciones duplicadas |
| 2 | Ordenar filas por fecha | ARCIBA, SICORE | `sortRowsByFecha(rows, colIdx)` | Alto - bloque identico de 6 lineas |
| 3 | Parsear importe con coma decimal | ARCIBA, SICORE, SUSS | `parseAmount(value)` | Medio - simplifica ~5 ocurrencias |
| 4 | Lectura segura de celda | Todas | `cellStr(row, colIdx)` | Medio - reduce ruido en ~15 lugares |
| 5 | Extraccion de CUIT | ARCIBA, SICORE | `cellDigits(row, colIdx)` | Bajo - 2 ocurrencias |
| 6 | Copia redundante de headers | ARCIBA, SICORE | Eliminar | Bajo - 2 lineas |

### Prioridad sugerida

1. `formatNumber` + `sortRowsByFecha` (mayor reduccion de duplicacion)
2. `parseAmount` + `cellStr` (mayor reduccion de ruido repetitivo)
3. `cellDigits` + eliminar copia de headers (limpieza menor)
