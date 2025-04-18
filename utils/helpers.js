// utils/helpers.js (Ejemplo - Lógica de precio ahora integrada en Controller)

// Esta función es ahora más compleja y se integró en getProductDetailsForOrder
// Podrías mover lógica de cálculo de puntos o validaciones comunes aquí.

// Ejemplo:
const calculatePoints = (totalAmount, pointsPerSol) => {
    return Math.floor(totalAmount * (pointsPerSol || 0));
};

module.exports = {
    calculatePoints,
    // getCustomerPrice // Ya no se usa directamente aquí si se integró
};