// utils/simulatedData.js
// Datos simulados para desarrollo y pruebas
// Este archivo puede usarse para proporcionar datos de respaldo en caso de que la base de datos no esté disponible

const simulatedData = {
    // Datos de muestra para clientes
    customers: [
        { id: 1, name: "Juan Pérez", dni: "12345678", phone: "999888777", address: "Av. Principal 123" },
        { id: 2, name: "María López", dni: "87654321", phone: "999111222", address: "Jr. Las Flores 456" },
        { id: 3, name: "Carlos Gómez", dni: "45678912", phone: "999333444", address: "Urb. Los Pinos 789" }
    ],
    
    // Datos de muestra para productos
    products: {
        cylinders: [
            { id: 1, name: "5kg", price_new: 80.00, price_exchange: 25.00 },
            { id: 2, name: "10kg", price_new: 120.00, price_exchange: 48.50 },
            { id: 3, name: "15kg", price_new: 180.00, price_exchange: 70.00 },
            { id: 4, name: "45kg", price_new: 450.00, price_exchange: 210.00 }
        ],
        others: [
            { id: 1, name: "Manguera Premium (mt)", price: 8.00, unit: "metro" },
            { id: 2, name: "Válvula Regular", price: 15.00, unit: "unidad" },
            { id: 3, name: "Abrazadera (par)", price: 2.00, unit: "par" }
        ]
    },
    
    // Datos de muestra para pedidos
    orders: [
        { 
            id: 1, 
            customer_id: 1, 
            status: "delivered", 
            total: 48.50, 
            items: [{ product_id: 2, quantity: 1, type: "cylinder" }],
            date: "2023-07-15"
        },
        { 
            id: 2, 
            customer_id: 2, 
            status: "pending_assignment", 
            total: 25.00, 
            items: [{ product_id: 1, quantity: 1, type: "cylinder" }],
            date: "2023-07-16"
        }
    ],
    
    // Datos de muestra para stock
    inventory: {
        warehouse1: {
            cylinders: [
                { type_id: 1, full: 20, empty: 5, damaged: 1 },
                { type_id: 2, full: 30, empty: 10, damaged: 2 },
                { type_id: 3, full: 15, empty: 5, damaged: 0 },
                { type_id: 4, full: 8, empty: 3, damaged: 1 }
            ],
            others: [
                { product_id: 1, quantity: 50 }, // Metros de manguera
                { product_id: 2, quantity: 20 }, // Válvulas
                { product_id: 3, quantity: 40 }  // Pares de abrazaderas
            ]
        }
    }
};

module.exports = { simulatedData };