// ==================================
// js/modules/config.js
// Configuración centralizada del sistema
// ==================================

// Determinar entorno de ejecución
const ENV = {
    DEV: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    STAGING: window.location.hostname === 'staging.gaserp-ayacucho.com',
    PROD: window.location.hostname === 'app.gaserp-ayacucho.com' || window.location.hostname.includes('gaserp-ayacucho.com')
};

// --- URL Base de la API según entorno ---
let apiBaseUrl = '';
if (ENV.DEV) {
    apiBaseUrl = 'http://localhost:3001/api'; // Desarrollo local
} else if (ENV.STAGING) {
    apiBaseUrl = 'https://staging-api.gaserp-ayacucho.com/api'; // Entorno de pruebas
} else if (ENV.PROD) {
    apiBaseUrl = 'https://api.gaserp-ayacucho.com/api'; // Producción
} else {
    // Fallback para cualquier otro entorno
    apiBaseUrl = '/api'; // URL relativa al servidor actual
}

// --- Configuración de la API ---
const API_CONFIG = {
    BASE_URL: apiBaseUrl,
    TIMEOUT: 30000, // 30 segundos
    MAX_RETRIES: 2,
    RETRY_DELAY_BASE: 1000, // Retraso base para reintentos (1 segundo)
    HEADERS: {
        'Content-Type': 'application/json'
    }
};

// --- Configuración de caché y almacenamiento ---
const STORAGE_CONFIG = {
    TOKEN_KEY: 'token',
    SETTINGS_KEY: 'user_settings',
    CACHE_TTL: 15 * 60 * 1000 // 15 minutos en milisegundos
};

// --- Rutas de Recursos Estáticos ---
const STATIC_RESOURCES = {
    IMAGES: {
        USER_PLACEHOLDER: '/assets/placeholder-user.png',
        LOGO: '/assets/logo.png',
        FAVICON: '/assets/favicon.ico'
    },
    TEMPLATES: {
        ERROR: '/templates/error.html',
        LOADING: '/templates/loading.html'
    }
};

// --- Configuración Global de Formatos ---
const FORMAT_CONFIG = {
    DATE: 'DD/MM/YYYY',
    TIME: 'HH:mm',
    DATETIME: 'DD/MM/YYYY HH:mm',
    CURRENCY: {
        CODE: 'PEN',
        SYMBOL: 'S/',
        LOCALE: 'es-PE',
        DECIMAL_PLACES: 2
    }
};

// --- Tiempos de Refresco Automático ---
const REFRESH_INTERVALS = {
    DASHBOARD_KPI: 5 * 60 * 1000, // 5 minutos
    INVENTORY_STATUS: 10 * 60 * 1000, // 10 minutos
    ORDERS_PENDING: 30 * 1000, // 30 segundos
    TOKEN_REFRESH: 45 * 60 * 1000 // 45 minutos (antes de que expire el token)
};

// --- Límites del Sistema ---
const SYSTEM_LIMITS = {
    UPLOAD_MAX_SIZE: 5 * 1024 * 1024, // 5MB
    RESULTS_PER_PAGE: 25,
    MAX_RETRY_LOGIN: 5,
    PASSWORD_MIN_LENGTH: 6
};

// --- Exports ---
export {
    ENV,
    API_CONFIG,
    STORAGE_CONFIG,
    STATIC_RESOURCES,
    FORMAT_CONFIG,
    REFRESH_INTERVALS,
    SYSTEM_LIMITS
};

// Alias para compatibilidad con código existente
export const API_BASE_URL = API_CONFIG.BASE_URL;

console.log('[config.js] Módulo de configuración cargado. Entorno:', 
    ENV.DEV ? 'Desarrollo' : ENV.STAGING ? 'Staging' : ENV.PROD ? 'Producción' : 'Desconocido');
console.log('[config.js] API Base:', API_CONFIG.BASE_URL);