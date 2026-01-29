// Función que cambia el texto cuando haces clic en el botón
function cambiarTexto() {
    const mensaje = document.getElementById('mensaje');
    if (!mensaje) return;

    mensaje.textContent = '¡JavaScript funciona! Has hecho clic en el botón.';
    mensaje.style.color = 'blue';
    mensaje.style.fontWeight = 'bold';
    console.log('¡JavaScript funciona! Has hecho clic en el botón.');
}

// Inicialización cuando la página de inicio carga
document.addEventListener('DOMContentLoaded', function() {
    console.log('¡La página de inicio se ha cargado correctamente!');

    window.addEventListener('load', function() {
        console.log('Todo está listo en la página de inicio');
    });
});

