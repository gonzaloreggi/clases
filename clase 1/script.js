// Variables para la calculadora
let currentInput = '';
let operator = '';
let previousInput = '';

// Funciones de la calculadora
function updateDisplay() {
    document.getElementById('display').value = currentInput || '0';
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
            // Console log para multiplicación
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

// Función que cambia el texto cuando haces clic en el botón
function cambiarTexto() {
    const mensaje = document.getElementById('mensaje');
    mensaje.textContent = '¡JavaScript funciona! Has hecho clic en el botón.';
    mensaje.style.color = 'blue';
    mensaje.style.fontWeight = 'bold';
    console.log('¡JavaScript funciona! Has hecho clic en el botón.');
}

// Inicialización cuando la página carga
document.addEventListener('DOMContentLoaded', function() {
    // Mensaje en la consola cuando la página carga
    console.log('¡La página se ha cargado correctamente!');
    
    // Inicializar display de la calculadora
    updateDisplay();
    
    // Mostrar mensaje cuando todo está listo
    window.addEventListener('load', function() {
        console.log('Todo está listo para usar JavaScript');
    });
});
