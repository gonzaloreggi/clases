/**
 * Parseo SICORE GANANCIAS - CSV → TXT retenciones ganancias
 * Formato Estándar Retenciones Versión 9.0 - 145 caracteres por línea.
 * Input: CSV ; columns: fecha;num_comp;punto_venta;interno;razon_social;cuit;valor;reten
 * Posiciones: 1-2 código comp, 3-12 fecha emisión comp, 13-28 nro comp, 29-44 importe comp,
 * 45-48 código impuesto, 49-51 régimen, 52 operación, 53-66 base cálculo, 67-76 fecha emisión ret,
 * 77-78 condición, 79 suspendidos, 80-93 importe retención, 94-99 % exclusión, 100-109 fecha pub,
 * 110-111 tipo doc, 112-131 nro documento, 132-145 nro certificado original.
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

/** Normaliza fecha a dd/mm/yyyy: siempre 10 caracteres (2 dígitos día, mes y 4 año). */
function normalizeFecha(str) {
    const s = String(str || '').trim();
    const parts = s.split('/').map(p => p.trim());
    if (parts.length !== 3) return '01/01/1900';
    const dd = Math.max(1, Math.min(31, parseInt(parts[0], 10) || 1));
    const mm = Math.max(1, Math.min(12, parseInt(parts[1], 10) || 1));
    const yyyy = parseInt(parts[2], 10) || 1900;
    const year4 = String(yyyy).padStart(4, '0').slice(-4);
    return String(dd).padStart(2, '0') + '/' + String(mm).padStart(2, '0') + '/' + year4;
}

/** Parsea dd/mm/yyyy a número para ordenar (yyyy*10000+mm*100+dd). */
function parseFechaSortable(str) {
    const s = String(str || '').trim();
    const parts = s.split('/');
    if (parts.length !== 3) return 0;
    const dd = parseInt(parts[0], 10) || 0;
    const mm = parseInt(parts[1], 10) || 0;
    const yyyy = parseInt(parts[2], 10) || 0;
    return yyyy * 10000 + mm * 100 + dd;
}

/** Número con coma decimal: exactamente len caracteres (relleno a la izquierda; si sobra, trunca por la izquierda). */
function formatNumFixed(num, len) {
    const n = parseFloat(String(num).replace(',', '.')) || 0;
    const [intPart, decPart] = n.toFixed(2).split('.');
    let s = intPart + ',' + (decPart || '00');
    s = s.length > len ? s.slice(-len) : s.padStart(len, ' ');
    return s;
}

function findCol(name) {
    const n = name.trim().toUpperCase();
    const i = csvHeaders.findIndex(h => String(h || '').trim().toUpperCase() === n);
    return i >= 0 ? i : -1;
}

function csvToTxtContent() {
    if (csvRows.length === 0 || csvHeaders.length === 0) return '';
    const idx = {
        fecha: findCol('fecha'),
        num_comp: findCol('num_comp'),
        punto_venta: findCol('punto_venta'),
        interno: findCol('interno'),
        razon_social: findCol('razon_social'),
        cuit: findCol('cuit'),
        valor: findCol('valor'),
        reten: findCol('reten')
    };
    const sortedRows = idx.fecha >= 0
        ? [...csvRows].sort((a, b) => parseFechaSortable(a[idx.fecha]) - parseFechaSortable(b[idx.fecha]))
        : csvRows;
    const lines = [];
    const firstDate = sortedRows.length && idx.fecha >= 0 ? normalizeFecha(sortedRows[0][idx.fecha]) : '01/01/2025';
    const [, mFirst, yFirst] = firstDate.split('/');
    const year = (yFirst || '2025').slice(-4);
    const yy = (yFirst || '2025').slice(-2);
    const mm = mFirst || '12';
    let lineNum = 1;
    for (const row of sortedRows) {
        const fecha = normalizeFecha(idx.fecha >= 0 ? row[idx.fecha] : '');
        const num_comp = idx.num_comp >= 0 ? String(row[idx.num_comp] || '').trim() : '';
        const punto_venta = idx.punto_venta >= 0 ? String(row[idx.punto_venta] || '').trim() : '';
        const valorNum = parseFloat(String((idx.valor >= 0 ? row[idx.valor] : '0') || '0').replace(',', '.')) || 0;
        const retenNum = parseFloat(String((idx.reten >= 0 ? row[idx.reten] : '0') || '0').replace(',', '.')) || 0;
        const cuit = idx.cuit >= 0 ? String(row[idx.cuit] || '').replace(/\D/g, '') : '';
        const numComprobanteDig = ((punto_venta || '') + (num_comp || '')).replace(/\D/g, '') || '0';
        const first = numComprobanteDig.slice(0, 1);
        const rest = numComprobanteDig.slice(1).padStart(5, '0').slice(-5);
        const numComprobante = ('0000' + first + '000' + rest + '   ').slice(0, 16);
        const cuit20 = ((cuit || '') + '                    ').slice(0, 20);
        const lineSeq = String(lineNum).padStart(2, '0');
        const certVal = year + yy + mm + lineSeq;
        const certificado = ('000000000000000000' + certVal).slice(-28);
        const fecha10 = (fecha + '          ').slice(0, 10);
        const line = (
            '01' +                                   // 1-2   Código comprobante
            fecha10 +                                // 3-12  Fecha emisión comprobante (10)
            numComprobante +                         // 13-28 Número del comprobante (16)
            formatNumFixed(valorNum, 16) +           // 29-44 Importe del comprobante
            '0217' +                                 // 45-48 Código de impuesto
            '078' +                                  // 49-51 Código de régimen
            '1' +                                    // 52    Código de operación
            formatNumFixed(valorNum, 14) +           // 53-66 Base de cálculo
            fecha10 +                                // 67-76 Fecha emisión retención
            '01' +                                   // 77-78 Código de condición
            '0' +                                    // 79    Retención suspendidos
            formatNumFixed(retenNum, 14) +           // 80-93 Importe de la retención
            '  0,00' +                               // 94-99 Porcentaje exclusión (6)
            '          ' +                           // 100-109 Fecha publicación (10 espacios)
            '80' +                                   // 110-111 Tipo documento (80 = CUIT)
            cuit20 +                                 // 112-131 Número documento (20)
            certificado                              // 132-159 Número certificado original (28: 18 ceros + aammnn)
        );
        const expectedLen = 159;
        if (line.length !== expectedLen) {
            console.warn('Línea con longitud incorrecta:', line.length, 'esperado', expectedLen);
        }
        lines.push(line);
        lineNum++;
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

btnGenerate.addEventListener('click', () => {
    const content = csvToTxtContent();
    if (!content) return;
    const bytes = new TextEncoder().encode(content);
    const blob = new Blob([bytes], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'parseado_retenciones_ganancias.txt';
    a.click();
    URL.revokeObjectURL(a.href);
});
