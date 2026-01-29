// Variables para la calculadora
let currentInput = '';
let operator = '';
let previousInput = '';

// Funciones de la calculadora
function updateDisplay() {
    const display = document.getElementById('display');
    if (display) {
        display.value = currentInput || '0';
    }
}

function appendNumber(number) {
    currentInput += number;
    updateDisplay();
}

function appendOperator(op) {
    if (currentInput === '' && op === '-') {
        currentInput = '-';
        updateDisplay();
        return;
    }

    if (currentInput === '') return;

    if (previousInput !== '' && operator !== '') {
        calculate();
    }

    previousInput = currentInput;
    operator = op;
    currentInput = '';
}

function calculate() {
    if (previousInput === '' || currentInput === '' || operator === '') {
        return;
    }

    const prev = parseFloat(previousInput);
    const current = parseFloat(currentInput);
    let result;

    switch (operator) {
        case '+':
            result = prev + current;
            break;
        case '-':
            result = prev - current;
            break;
        case '*':
            result = prev * current;
            console.log(`🔢 Multiplicación realizada: ${prev} × ${current} = ${result}`);
            break;
        case '/':
            if (current === 0) {
                alert('Error: No se puede dividir por cero');
                clearDisplay();
                return;
            }
            result = prev / current;
            break;
        default:
            return;
    }

    currentInput = result.toString();
    previousInput = '';
    operator = '';
    updateDisplay();
}

function clearDisplay() {
    currentInput = '';
    previousInput = '';
    operator = '';
    updateDisplay();
}

function deleteLast() {
    currentInput = currentInput.slice(0, -1);
    updateDisplay();
}

// Inicialización cuando la página de la calculadora carga
document.addEventListener('DOMContentLoaded', function() {
    console.log('¡La página de la calculadora se ha cargado correctamente!');
    updateDisplay();
});

