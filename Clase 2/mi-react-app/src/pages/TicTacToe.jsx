import { useState } from 'react'
import './TicTacToe.css'

function Square({ value, onSquareClick, isWinner }) {
  return (
    <button
      type="button"
      className={`tictactoe-square ${isWinner ? 'tictactoe-square--winner' : ''}`}
      onClick={onSquareClick}
    >
      {value}
    </button>
  )
}

function calculateWinner(squares) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ]
  for (const [a, b, c] of lines) {
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return { player: squares[a], line: [a, b, c] }
    }
  }
  return null
}

export default function TicTacToe() {
  const [squares, setSquares] = useState(Array(9).fill(null))
  const [isXNext, setIsXNext] = useState(true)

  const winnerInfo = calculateWinner(squares)
  const winner = winnerInfo?.player ?? null
  const winningLine = winnerInfo?.line ?? []
  const isDraw = !winner && squares.every((cell) => cell !== null)

  const handleClick = (i) => {
    if (squares[i] || winner) return
    const next = [...squares]
    next[i] = isXNext ? 'X' : 'O'
    setSquares(next)
    setIsXNext(!isXNext)
  }

  const reset = () => {
    setSquares(Array(9).fill(null))
    setIsXNext(true)
  }

  const status = winner
    ? `Winner: ${winner}`
    : isDraw
      ? "It's a draw!"
      : `Next player: ${isXNext ? 'X' : 'O'}`

  return (
    <div className="tictactoe-page">
      <h1>Tic Tac Toe</h1>
      <p className="tictactoe-status">{status}</p>
      <div className="tictactoe-board">
        {squares.map((value, i) => (
          <Square
            key={i}
            value={value}
            isWinner={winningLine.includes(i)}
            onSquareClick={() => handleClick(i)}
          />
        ))}
      </div>
      <button type="button" className="tictactoe-reset" onClick={reset}>
        New game
      </button>
    </div>
  )
}
