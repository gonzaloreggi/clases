/**
 * Parseo ARCIBA - CSV consolidado → TXT formato AGIP (retenciones)
 * Input: CSV con ;  columns: fecha;interno;num_comp;razon_social;cuit;valor;reten;alicuota;tipo
 * Output: TXT de ancho fijo según PARSEADO_RETENCIONES_AGIP.txt
 */

let csvRows = [];
let csvHeaders = [];

const csvInput = document.getElementById('csv-input');
const fileNameEl = document.getElementById('file-name');
const csvInfo = document.getElementById('csv-info');
const csvPreview = document.getElementById('csv-preview');
const btnGenerate = document.getElementById('btn-generate');
const txtPreview = document.getElementById('txt-preview');

const DELIMITER = ';';

function parseCSV(text) {
    const rows = [];
    let current = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') inQuotes = false;
            else field += c;
        } else {
            if (c === '"') inQuotes = true;
            else if (c === DELIMITER || c === '\n') {
                current.push(field.trim());
                field = '';
                if (c === '\n') {
                    if (current.some(cell => cell !== '')) rows.push(current);
                    current = [];
                }
            } else field += c;
        }
    }
    if (field !== '' || current.length > 0) {
        current.push(field.trim());
        if (current.some(cell => cell !== '')) rows.push(current);
    }
    return rows;
}

/**
 * eArciba spec: Número 16 = 13 dígitos + "," + 2 decimales (columnas 8, 16, 17, 18, 20, 21).
 * "Los datos de tipo Número se alínean a la derecha y se completan con ceros."
 */
function formatNum16(num) {
    const n = parseFloat(String(num).replace(',', '.')) || 0;
    const [intPart, decPart] = n.toFixed(2).split('.');
    return intPart.padStart(13, '0') + ',' + (decPart || '00');
}

/**
 * Normaliza texto a caracteres válidos para eArciba (evita "Linea con caracteres no válidos").
 * Reemplaza acentos/ñ por ASCII y quita cualquier otro carácter no imprimible.
 */
function sanitizeForEarciba(s) {
    const map = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u',
        'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N', 'Ü': 'U',
        'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u', 'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
        'ã': 'a', 'õ': 'o', 'ç': 'c', 'Ç': 'C'
    };
    let t = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const [k, v] of Object.entries(map)) t = t.split(k).join(v);
    return t.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Alícuota 5 caracteres (pos 179-183): "XX,XX" ej. 00,50 o 03,00. Spec: Número 5, Máximo 99,99. */
function formatAlicuota5(alicuotaNum) {
    const a = parseFloat(alicuotaNum) || 0;
    const intPart = Math.min(99, Math.floor(a));
    const decPart = Math.min(99, Math.round((a % 1) * 100));
    return String(intPart).padStart(2, '0') + ',' + String(decPart).padStart(2, '0');
}

function padRight(s, len) {
    let t = String(s || '').trim()
        .replace(/\s*S\.\s*A\.?/gi, ' SA').replace(/\s*S\.\s*R\.\s*L\.?/gi, ' SRL').replace(/\s*S\.\s*A\.\s*U\.?/gi, ' SAU');
    t = t.replace(/\.\s*$/, '').trim().slice(0, len);
    return t.padEnd(len, ' ');
}

csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
        fileNameEl.textContent = 'Ningún archivo elegido';
        csvRows = [];
        csvHeaders = [];
        csvInfo.textContent = 'Sube un archivo para ver la vista previa.';
        csvPreview.textContent = '';
        txtPreview.textContent = '— Aquí se mostrará cómo quedará el TXT generado —';
        btnGenerate.disabled = true;
        return;
    }
    fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const rows = parseCSV(ev.target.result);
        if (rows.length === 0) {
            csvInfo.textContent = 'El archivo no tiene filas válidas.';
            csvPreview.textContent = '';
            csvRows = [];
            csvHeaders = [];
            btnGenerate.disabled = true;
            return;
        }
        csvHeaders = rows[0];
        csvRows = rows.slice(1);
        csvInfo.textContent = `${csvRows.length} fila(s), ${csvHeaders.length} columna(s).`;
        csvPreview.textContent = rows.slice(0, 5).map(r => r.join(' | ')).join('\n');
        if (rows.length > 5) csvPreview.textContent += '\n...';
        btnGenerate.disabled = false;
        updateTxtPreview();
    };
    reader.readAsText(file, 'UTF-8');
});

function findCol(name) {
    const n = name.trim().toUpperCase();
    const i = csvHeaders.findIndex(h => String(h || '').trim().toUpperCase() === n);
    return i >= 0 ? i : -1;
}

/** Parsea dd/mm/yyyy a número ordenable (yyyy*10000+mm*100+dd) para ordenar ascendente (primer día primero). */
function parseFechaSortable(str) {
    const s = String(str || '').trim();
    const parts = s.split('/');
    if (parts.length !== 3) return 0;
    const dd = parseInt(parts[0], 10) || 0;
    const mm = parseInt(parts[1], 10) || 0;
    const yyyy = parseInt(parts[2], 10) || 0;
    return yyyy * 10000 + mm * 100 + dd;
}

/** Normaliza fecha a dd/mm/yyyy (siempre 2 dígitos día y mes) para evitar "Fecha Incorrecta". */
function normalizeFecha(str) {
    const s = String(str || '').trim();
    const parts = s.split('/').map(p => p.trim());
    if (parts.length !== 3) return s || '01/01/1900';
    const dd = Math.max(1, Math.min(31, parseInt(parts[0], 10) || 1));
    const mm = Math.max(1, Math.min(12, parseInt(parts[1], 10) || 1));
    const yyyy = parseInt(parts[2], 10) || 1900;
    return String(dd).padStart(2, '0') + '/' + String(mm).padStart(2, '0') + '/' + String(yyyy);
}

/**
 * Formato TXT AGIP (ancho fijo) según PARSEADO_RETENCIONES_AGIP.txt
 * CSV: fecha;interno;num_comp;razon_social;cuit;valor;reten;alicuota;tipo
 * Las filas se ordenan por fecha ascendente (primer día primero).
 */
function csvToTxtContent() {
    if (csvRows.length === 0 || csvHeaders.length === 0) return '';
    const idx = {
        fecha: findCol('fecha'),
        interno: findCol('interno'),
        num_comp: findCol('num_comp'),
        razon_social: findCol('razon_social'),
        cuit: findCol('cuit'),
        valor: findCol('valor'),
        reten: findCol('reten'),
        alicuota: findCol('alicuota'),
        tipo: findCol('tipo')
    };
    const sortedRows = idx.fecha >= 0
        ? [...csvRows].sort((a, b) => parseFechaSortable(a[idx.fecha]) - parseFechaSortable(b[idx.fecha]))
        : csvRows;
    const lines = [];
    for (const row of sortedRows) {
        const fechaRaw = idx.fecha >= 0 ? String(row[idx.fecha] || '').trim() : '';
        const fecha = normalizeFecha(fechaRaw);
        const num_comp = idx.num_comp >= 0 ? String(row[idx.num_comp] || '').trim() : '';
        const valorNum = parseFloat(String((idx.valor >= 0 ? row[idx.valor] : '0') || '0').replace(',', '.')) || 0;
        const retenNum = parseFloat(String((idx.reten >= 0 ? row[idx.reten] : '0') || '0').replace(',', '.')) || 0;
        const alicuotaNum = parseFloat(String((idx.alicuota >= 0 ? row[idx.alicuota] : '0') || '0').replace(',', '.')) || 0;
        const cuit = idx.cuit >= 0 ? String(row[idx.cuit] || '').replace(/\D/g, '') : '';
        const cuit11 = cuit ? cuit.padStart(11, '0').slice(-11) : '00000000000';
        const tipoDoc = '3';
        let razon = idx.razon_social >= 0 ? String(row[idx.razon_social] || '').trim() : '';
        razon = razon.replace(/\s*S\.\s*A\.?/gi, ' SA').replace(/\s*S\.\s*R\.\s*L\.?/gi, ' SRL').replace(/\s*S\.\s*A\.\s*U\.?/gi, ' SAU').trim();
        razon = sanitizeForEarciba(razon);
        const razon30 = padRight(razon, 30);
        const alicuota5 = formatAlicuota5(alicuotaNum);
        const montoComprobante = formatNum16(valorNum);
        const importeOtros = formatNum16(0);
        const importeIva = formatNum16(0);
        const montoSujeto = formatNum16(valorNum);
        const retenPracticada = formatNum16(retenNum);
        const numComp16 = (num_comp || '').padStart(16, '0').slice(-16);
        const line = [
            '1',
            '029',
            fecha,
            '01',
            'A',
            numComp16,
            fecha,
            montoComprobante,
            '                ',
            tipoDoc,
            cuit11,
            '4',
            '00000000000',
            '1',
            razon30,
            importeOtros,
            importeIva,
            montoSujeto,
            alicuota5,
            retenPracticada,
            retenPracticada,
            ' ',                    // Campo 22 Aceptación (1 espacio)
            ' '.repeat(10)          // Campo 23 Fecha Aceptación Expresa (10 espacios)
        ].join('');
        lines.push(line);
    }
    return lines.join('\n') + '\n';
}

function updateTxtPreview() {
    const content = csvToTxtContent();
    if (!content) {
        txtPreview.textContent = '— Sube un CSV para ver la vista previa del TXT —';
        return;
    }
    txtPreview.textContent = content.slice(0, 1500) + (content.length > 1500 ? '\n...' : '');
}

btnGenerate.addEventListener('click', () => {
    const content = csvToTxtContent();
    if (!content) return;
    const bytes = new TextEncoder().encode(content);
    const blob = new Blob([bytes], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'parseado_retenciones_agip.txt';
    a.click();
    URL.revokeObjectURL(a.href);
});
