/**
 * Parseo IVA - Herramienta XLSX → CSV
 * Carga un archivo Excel (.xlsx), lo parsea y genera un CSV con el formato IVA.
 * Formato de salida CSV: lo definimos con las reglas que acordemos.
 */

let sheetRows = [];
let sheetHeaders = [];

const fileInput = document.getElementById('file-input');
const fileNameEl = document.getElementById('file-name');
const sheetInfo = document.getElementById('sheet-info');
const sheetPreview = document.getElementById('sheet-preview');
const outputInfo = document.getElementById('output-info');
const btnGenerate = document.getElementById('btn-generate');
const csvPreview = document.getElementById('csv-preview');

// —— Leer XLSX (primera hoja como array de arrays) ——
function readXLSX(arrayBuffer) {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return rows;
}

// —— Cuando el usuario elige un archivo ——
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
        fileNameEl.textContent = 'Ningún archivo elegido';
        sheetRows = [];
        sheetHeaders = [];
        sheetInfo.textContent = 'Sube un archivo para ver la vista previa.';
        sheetPreview.textContent = '';
        csvPreview.textContent = '— Aquí se mostrará cómo quedará el CSV generado —';
        btnGenerate.disabled = true;
        return;
    }

    fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const arrayBuffer = ev.target.result;
        let rows;
        try {
            rows = readXLSX(arrayBuffer);
        } catch (err) {
            sheetInfo.textContent = 'No se pudo leer el archivo. ¿Es un XLSX válido?';
            sheetPreview.textContent = '';
            sheetRows = [];
            sheetHeaders = [];
            btnGenerate.disabled = true;
            return;
        }
        if (rows.length === 0) {
            sheetInfo.textContent = 'La hoja está vacía.';
            sheetPreview.textContent = '';
            sheetRows = [];
            sheetHeaders = [];
            btnGenerate.disabled = true;
            return;
        }
        sheetHeaders = rows[0].map(c => String(c ?? '').trim());
        sheetRows = rows.slice(1);
        sheetInfo.textContent = `${sheetRows.length} fila(s), ${sheetHeaders.length} columna(s). Encabezados: ${sheetHeaders.join(', ')}`;
        sheetPreview.textContent = rows.slice(0, 6).map(r => r.map(c => String(c ?? '')).join(' | ')).join('\n');
        if (rows.length > 6) sheetPreview.textContent += '\n...';
        btnGenerate.disabled = false;
        updateCsvPreview();
    };
    reader.readAsArrayBuffer(file);
});

// —— Escapar campo CSV (si contiene ; o comillas, envolver en comillas) ——
function escapeCsvField(value) {
    const s = String(value ?? '').trim();
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

// —— Buscar índice de columna por nombre de encabezado (sin importar mayúsculas) ——
function findColumnIndex(headers, name) {
    const normalized = name.trim().toUpperCase();
    const idx = headers.findIndex(h => String(h || '').trim().toUpperCase() === normalized);
    return idx >= 0 ? idx : -1;
}

// —— Buscar columna que contenga una palabra (ej. "FECHA") ——
function findColumnIndexContaining(headers, part) {
    const normalized = part.trim().toUpperCase();
    const idx = headers.findIndex(h => String(h || '').toUpperCase().includes(normalized));
    return idx >= 0 ? idx : -1;
}

// —— Formatear fecha a aaaa-mm-dd (YYYY-MM-DD) ——
function formatDateYYYYMMDD(val) {
    if (val === null || val === undefined) return '';
    const s = String(val).trim();
    if (!s) return '';
    // Si es número de Excel (serial)
    const n = parseFloat(s);
    if (!isNaN(n) && n > 0) {
        try {
            if (typeof XLSX !== 'undefined' && XLSX.SSF && XLSX.SSF.parse_date_code) {
                const date = XLSX.SSF.parse_date_code(n);
                if (date && date.y != null) {
                    const d = date.d, m = date.m, y = date.y;
                    return [y, String(m).padStart(2, '0'), String(d).padStart(2, '0')].join('-');
                }
            }
        } catch (e) { /* fallback */ }
        return s;
    }
    // Si ya es texto tipo dd/mm/yyyy o yyyy-mm-dd
    const ddmmyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyy) {
        const [, d, m, y] = ddmmyy;
        return [y, m.padStart(2, '0'), d.padStart(2, '0')].join('-');
    }
    const yyyymmdd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (yyyymmdd) return s.replace(/[\/\-]/g, '-');
    return s;
}

/**
 * Formato de ENTRADA esperado (Excel):
 * Opcional: columna con encabezado "493" con valor 493 en cada fila (evita error de importación).
 * CUIT | FECHA PERCEPCION | PUNTO DE VENTA | NUMERO DE COMPROBANTE | IMPORTE
 *
 * Formato CSV IVA de SALIDA (7 columnas, separador ;):
 * 1) Valor de columna "493" si existe, si no "493"
 * 2) CUIT
 * 3) Vacío
 * 4) Fecha en aaaa-mm-dd
 * 5) Siempre 1
 * 6) PUNTO DE VENTA + "-" + NUMERO DE COMPROBANTE
 * 7) IMPORTE
 */
function toCsvContent() {
    if (sheetRows.length === 0 || sheetHeaders.length === 0) return '';

    const idxCol493 = findColumnIndex(sheetHeaders, '493');
    const idxCuit = findColumnIndex(sheetHeaders, 'CUIT');
    const idxFecha = findColumnIndex(sheetHeaders, 'FECHA PERCEPCION') >= 0
        ? findColumnIndex(sheetHeaders, 'FECHA PERCEPCION')
        : findColumnIndexContaining(sheetHeaders, 'FECHA');
    const idxPuntoVenta = findColumnIndex(sheetHeaders, 'PUNTO DE VENTA');
    const idxNumeroComprobante = findColumnIndex(sheetHeaders, 'NUMERO DE COMPROBANTE');
    const idxImporte = findColumnIndex(sheetHeaders, 'IMPORTE');

    const delimiter = ';';
    const lines = [];

    for (const row of sheetRows) {
        const col493 = idxCol493 >= 0 ? String(row[idxCol493] ?? '').trim() : '';
        const primeraCol = col493 !== '' ? col493 : '493';
        const cuit = idxCuit >= 0 ? String(row[idxCuit] ?? '').trim() : '';
        const fechaRaw = idxFecha >= 0 ? row[idxFecha] : '';
        const puntoVenta = idxPuntoVenta >= 0 ? String(row[idxPuntoVenta] ?? '').trim() : '';
        const numeroComprobante = idxNumeroComprobante >= 0 ? String(row[idxNumeroComprobante] ?? '').trim() : '';
        const importe = idxImporte >= 0 ? String(row[idxImporte] ?? '').trim() : '';

        const fecha = formatDateYYYYMMDD(fechaRaw);
        const comprobanteFormateado = String(puntoVenta).padStart(5, '0') + '-' + String(numeroComprobante).padStart(8, '0');

        const cells = [
            escapeCsvField(primeraCol),
            escapeCsvField(cuit),
            '',
            escapeCsvField(fecha),
            '1',
            escapeCsvField(comprobanteFormateado),
            escapeCsvField(importe)
        ];
        lines.push(cells.join(delimiter));
    }

    return lines.join('\n');
}

function updateCsvPreview() {
    const content = toCsvContent();
    if (!content) {
        csvPreview.textContent = '— Sube un XLSX para ver la vista previa del CSV —';
        return;
    }
    csvPreview.textContent = content.slice(0, 2000) + (content.length > 2000 ? '\n...' : '');
}

// —— Generar y descargar el CSV (sin BOM para que la primera columna sea exactamente "493") ——
btnGenerate.addEventListener('click', () => {
    let content = toCsvContent();
    if (!content) return;
    // Quitar BOM si existiera
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    // Escribir como UTF-8 sin BOM (bytes crudos) para que ningún programa añada BOM al primer campo
    const bytes = new TextEncoder().encode(content);
    const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'salida_iva.csv';
    a.click();
    URL.revokeObjectURL(url);
});
