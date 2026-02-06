import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import TicTacToe from './pages/TicTacToe'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <nav className="app-nav">
        <Link to="/">Home</Link>
        <Link to="/tictactoe">Tic Tac Toe</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tictactoe" element={<TicTacToe />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
