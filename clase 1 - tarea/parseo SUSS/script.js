/**
 * Parseo SUSS - Herramienta CSV → TXT
 * Carga un CSV, lo parsea y genera un TXT con el formato que definamos.
 */

let csvRows = [];
let csvHeaders = [];

const csvInput = document.getElementById('csv-input');
const fileName = document.getElementById('file-name');
const csvInfo = document.getElementById('csv-info');
const csvPreview = document.getElementById('csv-preview');
const outputInfo = document.getElementById('output-info');
const btnGenerate = document.getElementById('btn-generate');
const txtPreview = document.getElementById('txt-preview');

// —— Parsing del CSV (separador ; y soporta comillas) ——
function parseCSV(text) {
    const rows = [];
    let current = [];
    let field = '';
    let inQuotes = false;
    const delimiter = ';';

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                inQuotes = false;
            } else {
                field += c;
            }
        } else {
            if (c === '"') {
                inQuotes = true;
            } else if (c === delimiter || c === '\n') {
                current.push(field.trim());
                field = '';
                if (c === '\n') {
                    if (current.some(cell => cell !== '')) rows.push(current);
                    current = [];
                }
            } else {
                field += c;
            }
        }
    }
    if (field !== '' || current.length > 0) {
        current.push(field.trim());
        if (current.some(cell => cell !== '')) rows.push(current);
    }
    return rows;
}

// —— Cuando el usuario elige un archivo ——
csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
        fileName.textContent = 'Ningún archivo elegido';
        csvRows = [];
        csvHeaders = [];
        csvInfo.textContent = 'Sube un archivo para ver la vista previa.';
        csvPreview.textContent = '';
        txtPreview.textContent = '— Aquí se mostrará cómo quedará el TXT generado —';
        btnGenerate.disabled = true;
        return;
    }

    fileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const text = ev.target.result;
        const rows = parseCSV(text);
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
        csvInfo.textContent = `${csvRows.length} fila(s), ${csvHeaders.length} columna(s). Encabezados: ${csvHeaders.join(', ')}`;
        csvPreview.textContent = rows.slice(0, 6).map(r => r.join(' | ')).join('\n');
        if (rows.length > 6) csvPreview.textContent += '\n...';
        btnGenerate.disabled = false;
        updateTxtPreview();
    };
    reader.readAsText(file, 'UTF-8');
});

/**
 * Convierte los datos del CSV al formato TXT SUSS.
 * Columnas CSV: 0=CUIT, 1=Denominación, 2=Impuesto, 3=Régimen, 4=Número Certificado, 5=Fecha, 6=Importe
 * Formato TXT: CUIT + Fecha + Número Certificado + espacios + Importe (2 decimales, punto, alineado derecha 12 chars)
 */
function csvToTxtContent() {
    if (csvRows.length === 0) return '';

    const AMOUNT_WIDTH = 15;

    const lines = csvRows.map(row => {
        const cuit = (row[0] || '').trim();
        const fecha = (row[5] || '').trim();
        const numeroCert = (row[4] || '').trim();
        let importeStr = (row[6] || '0').trim().replace(',', '.');
        const importeNum = parseFloat(importeStr) || 0;
        const importeFormatted = importeNum.toFixed(2);
        const importePadded = importeFormatted.padStart(AMOUNT_WIDTH, ' ');
        return cuit + fecha + numeroCert + importePadded;
    });

    return lines.join('\n');
}

function updateTxtPreview() {
    const content = csvToTxtContent();
    if (!content) {
        txtPreview.textContent = '— Sube un CSV para ver la vista previa del TXT —';
        return;
    }
    txtPreview.textContent = content.slice(0, 2000) + (content.length > 2000 ? '\n...' : '');
}

// —— Generar y descargar el TXT ——
btnGenerate.addEventListener('click', () => {
    const content = csvToTxtContent();
    if (!content) return;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'salida.txt';
    a.click();
    URL.revokeObjectURL(url);
});
