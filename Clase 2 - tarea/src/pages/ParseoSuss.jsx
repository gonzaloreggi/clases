import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { parseCSV } from '../utils/parseCsv';

const AMOUNT_WIDTH = 15;

function csvToTxtContent(csvRows) {
  if (csvRows.length === 0) return '';
  return csvRows
    .map((row) => {
      const cuit = (row[0] || '').trim();
      const fecha = (row[5] || '').trim();
      const numeroCert = (row[4] || '').trim();
      let importeStr = (row[6] || '0').trim().replace(',', '.');
      const importeNum = parseFloat(importeStr) || 0;
      const importeFormatted = importeNum.toFixed(2);
      const importePadded = importeFormatted.padStart(AMOUNT_WIDTH, ' ');
      return cuit + fecha + numeroCert + importePadded;
    })
    .join('\n');
}

export default function ParseoSuss() {
  const [fileName, setFileName] = useState('Ningún archivo elegido');
  const [csvInfo, setCsvInfo] = useState('Sube un archivo para ver la vista previa.');
  const [csvPreviewText, setCsvPreviewText] = useState('');
  const [txtPreview, setTxtPreview] = useState('— Aquí se mostrará cómo quedará el TXT generado —');
  const [canGenerate, setCanGenerate] = useState(false);
  const [csvRows, setCsvRows] = useState([]);

  useEffect(() => {
    if (csvRows.length === 0) return;
    const content = csvToTxtContent(csvRows);
    setTxtPreview(content.slice(0, 2000) + (content.length > 2000 ? '\n...' : ''));
  }, [csvRows]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setFileName('Ningún archivo elegido');
      setCsvRows([]);
      setCsvInfo('Sube un archivo para ver la vista previa.');
      setCsvPreviewText('');
      setTxtPreview('— Aquí se mostrará cómo quedará el TXT generado —');
      setCanGenerate(false);
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setCsvInfo('El archivo no tiene filas válidas.');
        setCsvPreviewText('');
        setCsvRows([]);
        setCanGenerate(false);
        return;
      }
      const headers = rows[0];
      const dataRows = rows.slice(1);
      setCsvRows(dataRows);
      setCsvInfo(
        `${dataRows.length} fila(s), ${headers.length} columna(s). Encabezados: ${headers.join(', ')}`
      );
      setCsvPreviewText(
        rows.slice(0, 6).map((r) => r.join(' | ')).join('\n') + (rows.length > 6 ? '\n...' : '')
      );
      setCanGenerate(true);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleGenerate = () => {
    const content = csvToTxtContent(csvRows);
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'salida.txt';
    a.click();
    URL.revokeObjectURL(url);
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
          <h1>Parseo SUSS</h1>
          <p className="subtitle">Sube un archivo CSV y obtén un TXT con el formato definido.</p>
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
        <p className="info">El archivo TXT se generará con el formato que definamos.</p>
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
