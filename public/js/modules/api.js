// ==================================
// js/modules/api.js
// Funciones API (VERSIÓN CORREGIDA)
// ==================================

// Importamos la configuración desde el módulo correspondiente
import { API_BASE_URL } from './config.js';

console.log('[api.js] Módulo cargado. API Base:', API_BASE_URL);

/**
 * Tiempo de espera para peticiones fetch en milisegundos
 * Después de este tiempo, la petición se cancela automáticamente
 */
const FETCH_TIMEOUT = 30000; // 30 segundos

/**
 * Número máximo de reintentos para peticiones fallidas por problemas de red
 */
const MAX_RETRIES = 2;

/**
 * Realiza una petición fetch con tiempo de espera
 * @param {string} url - URL a la que hacer la petición
 * @param {Object} options - Opciones para fetch
 * @param {number} timeout - Tiempo máximo de espera en ms
 * @returns {Promise<Response>} - Promesa que resuelve a la respuesta
 */
async function fetchWithTimeout(url, options, timeout = FETCH_TIMEOUT) {
    // Crear un controlador de aborto para manejar el timeout
    const controller = new AbortController();
    const { signal } = controller;
    
    // Configurar el timeout
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeout);
    
    try {
        // Realizar la petición con el signal del controlador
        const response = await fetch(url, { ...options, signal });
        
        // Si llegamos aquí, la petición no ha sido abortada por timeout
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        // Limpiar el timeout para evitar memory leaks
        clearTimeout(timeoutId);
        
        // Si fue abortado por timeout, lanzar un error más descriptivo
        if (error.name === 'AbortError') {
            throw new Error(`La petición a ${url} excedió el tiempo de espera de ${timeout}ms`);
        }
        
        // Relanzar otros errores
        throw error;
    }
}

/**
 * Realiza una llamada fetch genérica a la API (SIN autenticación) con reintentos
 * @param {string} endpoint - Ruta relativa de la API
 * @param {Object} options - Opciones para fetch
 * @param {number} retries - Número de reintentos
 * @returns {Promise<Response>} - Respuesta del servidor
 */
async function fetchApi(endpoint, options = {}, retries = MAX_RETRIES) {
    // Construir URL completa usando la base definida en config.js
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`[fetchApi] -> ${options.method || 'GET'} ${url}`);
    
    // Headers por defecto
    const defaultHeaders = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Si el body es un objeto y no un FormData, convertirlo a JSON
    let optionsWithBody = { ...options };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        optionsWithBody.body = JSON.stringify(options.body);
    }
    
    try {
        // Realizar la petición con timeout
        const response = await fetchWithTimeout(
            url, 
            {
                ...optionsWithBody,
                headers: defaultHeaders,
            }
        );
        
        console.log(`[fetchApi] <- ${response.status} ${url}`);
        
        // Comprobar respuesta del servidor para token renovado
        checkForNewToken(response);
        
        return response;
    } catch (error) {
        // Comprobar si debemos reintentar
        if (retries > 0 && (error.message.includes('excedió el tiempo') || error.message.includes('fetch failed') || error.name === 'TypeError')) {
            console.warn(`[fetchApi] Error de conexión en ${url}, reintentando (${retries} intentos restantes):`, error);
            
            // Esperar antes de reintentar (tiempo exponencial)
            const delay = 1000 * (MAX_RETRIES - retries + 1);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Reintentar la petición
            return fetchApi(endpoint, options, retries - 1);
        }
        
        // Si no hay más reintentos o no es un error de red, propagar el error
        console.error(`[fetchApi] Error en fetch para ${url}:`, error);
        
        // Mostrar alerta solo para errores de red
        if (error.name === 'TypeError' || error.message.includes('excedió el tiempo')) {
            alert(`Error de conexión con el servidor. Por favor, verifica tu conexión a internet.`);
        }
        
        throw error;
    }
}

/**
 * Realiza una llamada fetch a la API incluyendo el token JWT (CON autenticación)
 * @param {string} endpoint - Ruta relativa de la API
 * @param {Object} options - Opciones para fetch
 * @param {number} retries - Número de reintentos
 * @returns {Promise<Response>} - Respuesta del servidor
 */
async function fetchWithAuth(endpoint, options = {}, retries = MAX_RETRIES) {
    // Construir URL completa usando la base definida en config.js
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`[fetchWithAuth] -> ${options.method || 'GET'} ${url}`);

    // Obtener token del localStorage
    const token = localStorage.getItem('token');

    // Si no hay token, rechazar la promesa con un mensaje claro
    if (!token) {
        console.warn("[fetchWithAuth] Token no encontrado en localStorage.");
        
        // Si estamos en desarrollo y la URL es segura, podríamos intentar sin token
        if (process.env.NODE_ENV === 'development' && endpoint.startsWith('/config/public')) {
            console.warn("[fetchWithAuth] Intentando petición sin token en desarrollo...");
            return fetchApi(endpoint, options, retries);
        }
        
        return Promise.reject(new Error("No se encontró token de autenticación. Por favor, inicia sesión nuevamente."));
    }

    // Headers con autenticación
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
    };

    // Si el body es un objeto y no un FormData, convertirlo a JSON
    let optionsWithBody = { ...options };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        optionsWithBody.body = JSON.stringify(options.body);
    }

    try {
        // Realizar la petición con timeout
        const response = await fetchWithTimeout(
            url, 
            {
                ...optionsWithBody,
                headers: authHeaders,
            }
        );

        console.log(`[fetchWithAuth] <- ${response.status} ${url}`);
        
        // Comprobar respuesta del servidor para token renovado
        checkForNewToken(response);

        // Manejar respuesta 401 - Token inválido o expirado
        if (response.status === 401) {
            console.warn("[fetchWithAuth] Token inválido o expirado (401).");
            
            // Si la respuesta contiene un mensaje específico, intentar extraerlo
            try {
                const errorData = await response.clone().json();
                // Si es error de token expirado, limpiar token actual
                if (errorData.code === 'token_expired' || errorData.code === 'invalid_token') {
                    localStorage.removeItem('token');
                    
                    // En aplicación real, aquí se redirigiría al login o se mostraría un modal
                    alert(errorData.message || "Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
                    window.location.reload(); // Forzar recarga para volver al login
                }
            } catch (e) {
                // Si no se puede parsear la respuesta, simplemente devolver la respuesta 401
            }
        }
        
        return response;
    } catch (error) {
        // Lógica de reintento similar a fetchApi
        if (retries > 0 && (error.message.includes('excedió el tiempo') || error.message.includes('fetch failed') || error.name === 'TypeError')) {
            console.warn(`[fetchWithAuth] Error de conexión en ${url}, reintentando (${retries} intentos restantes):`, error);
            
            // Esperar antes de reintentar (tiempo exponencial)
            const delay = 1000 * (MAX_RETRIES - retries + 1);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Reintentar la petición
            return fetchWithAuth(endpoint, options, retries - 1);
        }
        
        console.error(`[fetchWithAuth] Error en fetch para ${url}:`, error);
        
        // Mostrar alerta solo para errores de red
        if (error.name === 'TypeError' || error.message.includes('excedió el tiempo')) {
            alert(`Error de conexión con el servidor. Por favor, verifica tu conexión a internet.`);
        }
        
        throw error;
    }
}

/**
 * Verifica si la respuesta contiene un nuevo token y lo actualiza
 * @param {Response} response - Respuesta del servidor
 */
function checkForNewToken(response) {
    const newToken = response.headers.get('X-New-Token');
    if (newToken) {
        console.log('[api] Token renovado automáticamente');
        localStorage.setItem('token', newToken);
    }
}

// Exportamos las funciones
export { fetchApi, fetchWithAuth };