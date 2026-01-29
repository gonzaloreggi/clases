// Variables para Tic Tac Toe
let board = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let gameActive = true;

// Funciones de Tic Tac Toe
function makeMove(index) {
    const statusElement = document.getElementById('game-status');
    const currentPlayerElement = document.getElementById('current-player');

    if (!statusElement || !currentPlayerElement) {
        return; // No estamos en la página de tic-tac-toe
    }

    if (board[index] !== '' || !gameActive) {
        return;
    }

    board[index] = currentPlayer;
    updateCell(index);

    const winningCells = checkWinner();
    if (winningCells) {
        statusElement.textContent = `¡Ganador: ${currentPlayer}! 🎉`;
        gameActive = false;
        highlightWinningCells(winningCells);
        return;
    }

    if (board.every(cell => cell !== '')) {
        statusElement.textContent = '¡Empate! 🤝';
        gameActive = false;
        return;
    }

    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    currentPlayerElement.textContent = currentPlayer;
}

function updateCell(index) {
    const cells = document.querySelectorAll('.cell');
    if (cells[index]) {
        cells[index].textContent = board[index];
        cells[index].classList.add('filled');
    }
}

function checkWinner() {
    const winningConditions = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6]
    ];

    for (let condition of winningConditions) {
        const [a, b, c] = condition;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return condition;
        }
    }
    return null;
}

function highlightWinningCells(winningCells) {
    const cells = document.querySelectorAll('.cell');
    winningCells.forEach(index => {
        cells[index].classList.add('winner');
    });
}

function resetGame() {
    const statusElement = document.getElementById('game-status');

    if (!statusElement) {
        return; // No estamos en la página de tic-tac-toe
    }

    board = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'X';
    gameActive = true;

    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('filled', 'winner');
    });

    statusElement.innerHTML = 'Turno de: <span id="current-player">X</span>';
}

// Inicialización cuando la página de Tic Tac Toe carga
document.addEventListener('DOMContentLoaded', function() {
    console.log('¡La página de Tic Tac Toe se ha cargado correctamente!');
    resetGame();
});

