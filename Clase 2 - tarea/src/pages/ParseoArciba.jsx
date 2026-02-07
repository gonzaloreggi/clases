import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { parseCSV } from '../utils/parseCsv';

function findCol(headers, name) {
  const n = name.trim().toUpperCase();
  const i = headers.findIndex((h) => String(h || '').trim().toUpperCase() === n);
  return i >= 0 ? i : -1;
}

function formatNum16(num) {
  const n = parseFloat(String(num).replace(',', '.')) || 0;
  const [intPart, decPart] = n.toFixed(2).split('.');
  return intPart.padStart(13, '0') + ',' + (decPart || '00');
}

function sanitizeForEarciba(s) {
  const map = {
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u',
    Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', Ü: 'U',
    à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u', â: 'a', ê: 'e', î: 'i', ô: 'o', û: 'u',
    ã: 'a', õ: 'o', ç: 'c', Ç: 'C',
  };
  let t = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [k, v] of Object.entries(map)) t = t.split(k).join(v);
  return t.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatAlicuota5(alicuotaNum) {
  const a = parseFloat(alicuotaNum) || 0;
  const intPart = Math.min(99, Math.floor(a));
  const decPart = Math.min(99, Math.round((a % 1) * 100));
  return String(intPart).padStart(2, '0') + ',' + String(decPart).padStart(2, '0');
}

function padRight(s, len) {
  let t = String(s || '')
    .trim()
    .replace(/\s*S\.\s*A\.?/gi, ' SA')
    .replace(/\s*S\.\s*R\.\s*L\.?/gi, ' SRL')
    .replace(/\s*S\.\s*A\.\s*U\.?/gi, ' SAU');
  t = t.replace(/\.\s*$/, '').trim().slice(0, len);
  return t.padEnd(len, ' ');
}

function parseFechaSortable(str) {
  const s = String(str || '').trim();
  const parts = s.split('/');
  if (parts.length !== 3) return 0;
  const dd = parseInt(parts[0], 10) || 0;
  const mm = parseInt(parts[1], 10) || 0;
  const yyyy = parseInt(parts[2], 10) || 0;
  return yyyy * 10000 + mm * 100 + dd;
}

function normalizeFecha(str) {
  const s = String(str || '').trim();
  const parts = s.split('/').map((p) => p.trim());
  if (parts.length !== 3) return s || '01/01/1900';
  const dd = Math.max(1, Math.min(31, parseInt(parts[0], 10) || 1));
  const mm = Math.max(1, Math.min(12, parseInt(parts[1], 10) || 1));
  const yyyy = parseInt(parts[2], 10) || 1900;
  return String(dd).padStart(2, '0') + '/' + String(mm).padStart(2, '0') + '/' + String(yyyy);
}

function csvToTxtContent(csvHeaders, csvRows) {
  if (csvRows.length === 0 || csvHeaders.length === 0) return '';
  const idx = {
    fecha: findCol(csvHeaders, 'fecha'),
    num_comp: findCol(csvHeaders, 'num_comp'),
    razon_social: findCol(csvHeaders, 'razon_social'),
    cuit: findCol(csvHeaders, 'cuit'),
    valor: findCol(csvHeaders, 'valor'),
    reten: findCol(csvHeaders, 'reten'),
    alicuota: findCol(csvHeaders, 'alicuota'),
  };
  const sortedRows =
    idx.fecha >= 0
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
      '3',
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
      ' ',
      ' '.repeat(10),
    ].join('');
    lines.push(line);
  }
  return lines.join('\n') + '\n';
}

export default function ParseoArciba() {
  const [fileName, setFileName] = useState('Ningún archivo elegido');
  const [csvInfo, setCsvInfo] = useState('Sube un archivo para ver la vista previa.');
  const [csvPreviewText, setCsvPreviewText] = useState('');
  const [txtPreview, setTxtPreview] = useState('— Aquí se mostrará cómo quedará el TXT generado —');
  const [canGenerate, setCanGenerate] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);

  useEffect(() => {
    if (csvRows.length === 0 || csvHeaders.length === 0) return;
    const content = csvToTxtContent(csvHeaders, csvRows);
    setTxtPreview(content.slice(0, 1500) + (content.length > 1500 ? '\n...' : ''));
  }, [csvHeaders, csvRows]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setFileName('Ningún archivo elegido');
      setCsvRows([]);
      setCsvHeaders([]);
      setCsvInfo('Sube un archivo para ver la vista previa.');
      setCsvPreviewText('');
      setTxtPreview('— Aquí se mostrará cómo quedará el TXT generado —');
      setCanGenerate(false);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      if (rows.length === 0) {
        setCsvInfo('El archivo no tiene filas válidas.');
        setCsvPreviewText('');
        setCsvRows([]);
        setCsvHeaders([]);
        setCanGenerate(false);
        return;
      }
      setCsvHeaders(rows[0]);
      setCsvRows(rows.slice(1));
      setCsvInfo(`${rows.length - 1} fila(s), ${rows[0].length} columna(s).`);
      setCsvPreviewText(rows.slice(0, 5).map((r) => r.join(' | ')).join('\n') + (rows.length > 5 ? '\n...' : ''));
      setCanGenerate(true);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleGenerate = () => {
    const content = csvToTxtContent(csvHeaders, csvRows);
    if (!content) return;
    const bytes = new TextEncoder().encode(content);
    const blob = new Blob([bytes], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'parseado_retenciones_agip.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="tool-container">
      <Link to="/" className="back-link">
        ← Volver a Herramientas de parseo
      </Link>
      <header className="page-header">
        <Link to="/" className="logo-link">
          <img src="/LOGO.jpeg" alt="Logo" className="page-logo" />
        </Link>
        <div className="page-title-wrap">
          <h1>Parseo ARCIBA</h1>
          <p className="subtitle">Sube el consolidado CSV (Arciba) y obtené el TXT para retenciones AGIP.</p>
        </div>
      </header>

      <section className="tool-card">
        <h2>1. Subir CSV</h2>
        <label className="file-label">
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
          <span className="file-button">Elegir archivo CSV</span>
          <span className="file-name">{fileName}</span>
        </label>
      </section>

      <section className="tool-card">
        <h2>2. Vista previa del CSV</h2>
        <p className="info">{csvInfo}</p>
        <div className="preview-box">{csvPreviewText}</div>
      </section>

      <section className="tool-card">
        <h2>3. Generar y descargar TXT</h2>
        <p className="info">El archivo TXT se generará con el formato AGIP (retenciones).</p>
        <button type="button" className="btn primary" disabled={!canGenerate} onClick={handleGenerate}>
          Generar archivo TXT
        </button>
      </section>

      <section className="tool-card">
        <h2>Vista previa del TXT (formato de salida)</h2>
        <pre className="txt-preview">{txtPreview}</pre>
      </section>
    </main>
  );
}
