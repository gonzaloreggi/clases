import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import ParseoIva from './pages/ParseoIva';
import ParseoSuss from './pages/ParseoSuss';
import ParseoArciba from './pages/ParseoArciba';
import ParseoSicoreGanancias from './pages/ParseoSicoreGanancias';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/parseo-iva" element={<ParseoIva />} />
        <Route path="/parseo-suss" element={<ParseoSuss />} />
        <Route path="/parseo-arciba" element={<ParseoArciba />} />
        <Route path="/parseo-sicore-ganancias" element={<ParseoSicoreGanancias />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
