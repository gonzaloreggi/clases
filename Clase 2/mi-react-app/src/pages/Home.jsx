import { useState } from 'react'
import { Link } from 'react-router-dom'
import reactLogo from '../assets/react.svg'
import viteLogo from '/vite.svg'
import '../App.css'

function DigitButton({ digit, onClick }) {
  return (
    <button className="calc-btn" onClick={() => onClick(digit)}>
      {digit}
    </button>
  )
}

function OpButton({ op, onClick }) {
  return (
    <button className="calc-btn calc-op" onClick={() => onClick(op)}>
      {op}
    </button>
  )
}

export default function Home() {
  const [count, setCount] = useState(0)
  const [display, setDisplay] = useState('0')
  const [previousValue, setPreviousValue] = useState(null)
  const [operation, setOperation] = useState(null)

  const handleDigit = (digit) => {
    setDisplay((prev) => {
      if (prev === '0' && digit !== '.') return digit
      if (digit === '.' && prev.includes('.')) return prev
      if (digit === '.' && prev === '0') return '0.'
      return prev + digit
    })
  }

  const handleOperation = (op) => {
    const num = parseFloat(display)
    if (previousValue === null) {
      setPreviousValue(num)
      setOperation(op)
      setDisplay('0')
    } else {
      const result = calculate(previousValue, num, operation)
      setPreviousValue(result)
      setOperation(op)
      setDisplay('0')
    }
  }

  const calculate = (a, b, op) => {
    switch (op) {
      case '+': return a + b
      case '-':
      case '−': return a - b
      case '×': return a * b
      case '÷': return b === 0 ? 'Error' : a / b
      default: return b
    }
  }

  const handleEquals = () => {
    if (operation === null) return
    const num = parseFloat(display)
    const result = calculate(previousValue, num, operation)
    setDisplay(String(result))
    setPreviousValue(null)
    setOperation(null)
  }

  const handleClear = () => {
    setDisplay('0')
    setPreviousValue(null)
    setOperation(null)
  }

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React * Gonza y tomi</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>

      <section className="calculator-section">
        <h2>Calculator</h2>
        <div className="calculator">
          <div className="calculator-display">{display}</div>
          <div className="calculator-buttons">
            <button className="calc-btn calc-clear" onClick={handleClear}>C</button>
            <OpButton op="÷" onClick={handleOperation} />
            <OpButton op="×" onClick={handleOperation} />
            <OpButton op="−" onClick={handleOperation} />
            {['7', '8', '9'].map((d) => <DigitButton key={d} digit={d} onClick={handleDigit} />)}
            <OpButton op="+" onClick={handleOperation} />
            {['4', '5', '6'].map((d) => <DigitButton key={d} digit={d} onClick={handleDigit} />)}
            <button className="calc-btn calc-equals" onClick={handleEquals}>=</button>
            {['1', '2', '3'].map((d) => <DigitButton key={d} digit={d} onClick={handleDigit} />)}
            <DigitButton digit="0" onClick={handleDigit} />
            <DigitButton digit="." onClick={handleDigit} />
          </div>
        </div>
      </section>

      <p className="read-the-docs">
        <Link to="/tictactoe">Play Tic Tac Toe</Link> · Click on the Vite and React logos to learn more
      </p>
    </>
  )
}
