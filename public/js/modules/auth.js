// ==================================
// js/modules/auth.js
// Lógica de autenticación, tokens y pantallas auth
// ==================================
import { API_CONFIG, STORAGE_CONFIG, SYSTEM_LIMITS, REFRESH_INTERVALS } from './config.js';
import { fetchApi } from './api.js';
import { setCurrentUser, setAppStatus, addNotification } from './state.js';
import { showScreen } from './ui.js';

// --- Variables del módulo ---
let tokenRefreshTimer = null;
let tokenData = null; // Almacena datos decodificados del token (payload)

// --- MANEJO DE TOKEN JWT ---

/**
 * Guarda el token JWT en localStorage y programa su renovación
 * @param {string} token - Token JWT
 */
export function saveToken(token) {
    console.log("[auth] Guardando token en localStorage");
    try {
        localStorage.setItem(STORAGE_CONFIG.TOKEN_KEY, token);
        
        // Decodificar token (sin verificación - solo para obtener exp)
        decodeToken(token);
        
        // Configurar renovación automática
        setupTokenRefresh();
        
    } catch (e) {
        console.error("[auth] Error al guardar token en localStorage:", e);
        addNotification({
            type: 'error',
            title: 'Error de Sesión',
            message: 'No se pudo guardar la sesión. Verifique el almacenamiento de su navegador.'
        });
    }
}

/**
 * Obtiene el token JWT de localStorage
 * @returns {string|null} Token JWT o null si no existe
 */
export function getToken() {
    try {
        return localStorage.getItem(STORAGE_CONFIG.TOKEN_KEY);
    } catch (e) {
        console.error("[auth] Error al leer token de localStorage:", e);
        return null;
    }
}

/**
 * Elimina el token JWT de localStorage y detiene renovación
 */
export function removeToken() {
    console.log("[auth] Eliminando token de localStorage");
    try {
        localStorage.removeItem(STORAGE_CONFIG.TOKEN_KEY);
        
        // Detener timer de renovación
        if (tokenRefreshTimer) {
            clearTimeout(tokenRefreshTimer);
            tokenRefreshTimer = null;
        }
        
        // Limpiar datos del token
        tokenData = null;
        
    } catch (e) {
        console.error("[auth] Error al eliminar token de localStorage:", e);
    }
}

/**
 * Decodifica el token JWT para extraer su payload
 * @param {string} token - Token JWT a decodificar
 * @returns {Object|null} Payload decodificado o null si hubo error
 */
function decodeToken(token) {
    if (!token) return null;
    
    try {
        // Dividir token en partes (header.payload.signature)
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Formato de token inválido');
        
        // Decodificar la parte del payload (índice 1)
        const payload = JSON.parse(atob(parts[1]));
        tokenData = payload;
        
        console.log(`[auth] Token decodificado. Expira: ${new Date(payload.exp * 1000).toLocaleString()}`);
        return payload;
    } catch (error) {
        console.error('[auth] Error al decodificar token:', error);
        return null;
    }
}

/**
 * Verifica si el token actual ha expirado
 * @returns {boolean} true si expiró, false si es válido o no existe
 */
export function isTokenExpired() {
    const token = getToken();
    if (!token) return true;
    
    if (!tokenData) {
        tokenData = decodeToken(token);
    }
    
    if (!tokenData || !tokenData.exp) return true;
    
    const currentTime = Math.floor(Date.now() / 1000); // Timestamp actual en segundos
    return tokenData.exp <= currentTime;
}

/**
 * Configura el temporizador para renovar el token antes de que expire
 */
function setupTokenRefresh() {
    // Limpiar timer existente si hay
    if (tokenRefreshTimer) {
        clearTimeout(tokenRefreshTimer);
        tokenRefreshTimer = null;
    }
    
    if (!tokenData || !tokenData.exp) return;
    
    // Calcular tiempo hasta renovación (15 min antes de expirar)
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToExpire = tokenData.exp - currentTime;
    const refreshTime = Math.max(1, timeToExpire - 900) * 1000; // 15 min antes, mínimo 1 segundo
    
    // Programar renovación
    console.log(`[auth] Programando renovación de token en ${Math.floor(refreshTime/1000/60)} minutos`);
    tokenRefreshTimer = setTimeout(() => refreshToken(), refreshTime);
}

/**
 * Renueva el token actual antes de que expire
 * @returns {Promise<boolean>} true si se renovó correctamente, false en caso contrario
 */
async function refreshToken() {
    console.log('[auth] Intentando renovar token...');
    
    try {
        setAppStatus({ isLoading: true });
        // Usar el endpoint específico para renovación
        const response = await fetchApi('/auth/refresh-token', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.warn('[auth] No se pudo renovar token:', data.message);
            
            // Si el error es de token inválido o expirado, forzar logout
            if (response.status === 401) {
                console.log('[auth] Token expirado o inválido. Forzando logout...');
                addNotification({
                    type: 'warning',
                    title: 'Sesión Expirada',
                    message: 'Su sesión ha expirado. Por favor, inicie sesión nuevamente.'
                });
                forceLogout();
                return false;
            }
            
            // Para otros errores, programar un nuevo intento
            const retryIn = 60 * 1000; // 1 minuto
            console.log(`[auth] Reintentando renovación en ${retryIn/1000} segundos`);
            tokenRefreshTimer = setTimeout(() => refreshToken(), retryIn);
            return false;
        }
        
        // Renovación exitosa
        console.log('[auth] Token renovado exitosamente');
        saveToken(data.token);
        return true;
        
    } catch (error) {
        console.error('[auth] Error al renovar token:', error);
        
        // Programar un nuevo intento
        const retryIn = 60 * 1000; // 1 minuto
        console.log(`[auth] Reintentando renovación en ${retryIn/1000} segundos`);
        tokenRefreshTimer = setTimeout(() => refreshToken(), retryIn);
        return false;
    } finally {
        setAppStatus({ isLoading: false });
    }
}

/**
 * Fuerza el cierre de sesión y redirecciona al login
 */
export function forceLogout() {
    removeToken();
    setCurrentUser(null);
    showScreen('login-screen');
}

// --- LÓGICA DE LOGIN ---

/**
 * Maneja el proceso de login
 * @param {Event} event - Evento del formulario
 * @returns {Promise<boolean>} true si login exitoso, false en caso contrario
 */
export async function handleLogin(event) {
    console.log('[auth/handleLogin] Iniciando proceso de login...');
    if (event) event.preventDefault();

    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const roleInput = document.getElementById('role-selector');
    const localLoginError = document.getElementById('login-error');

    if (!usernameInput || !passwordInput || !roleInput || !localLoginError) {
        console.error("[auth/handleLogin] Elementos del formulario de login no encontrados en el DOM.");
        throw new Error("Error interno: Elementos del formulario de login no encontrados.");
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value; // No hacer trim a la contraseña
    const role = roleInput.value;

    localLoginError.textContent = ""; // Limpiar errores previos

    // Validación básica
    if (!username || !password || !role) {
        localLoginError.textContent = "Todos los campos (Usuario, Contraseña, Rol) son obligatorios.";
        return false;
    }

    console.log('[auth/handleLogin] Datos validados, enviando solicitud...');
    
    try {
        setAppStatus({ isLoading: true });
        const loginData = { username, password, role };

        // Usamos fetchApi (sin token) para el login
        const response = await fetchApi('/auth/login', {
            method: 'POST',
            body: JSON.stringify(loginData)
        });

        const data = await response.json();

        if (!response.ok) {
            console.warn('[auth/handleLogin] Login fallido. Respuesta Backend:', data);
            
            // Incrementar contador de intentos fallidos (podría usarse para limitar intentos)
            const failedAttempts = (parseInt(localStorage.getItem('login_attempts') || '0') + 1);
            localStorage.setItem('login_attempts', failedAttempts.toString());
            
            if (failedAttempts >= SYSTEM_LIMITS.MAX_RETRY_LOGIN) {
                localLoginError.textContent = `Demasiados intentos fallidos. Por favor, intente más tarde.`;
                setTimeout(() => {
                    localStorage.setItem('login_attempts', '0');
                }, 15 * 60 * 1000); // Resetear después de 15 minutos
                return false;
            }
            
            throw new Error(data.message || `Error de autenticación (${response.status})`);
        }

        // Resetear contador de intentos fallidos
        localStorage.setItem('login_attempts', '0');
        
        // --- LOGIN EXITOSO ---
        console.log("[auth/handleLogin] Login exitoso para:", data.user?.name);
        saveToken(data.token);

        // Actualiza el estado global del usuario
        setCurrentUser({
            id: data.user.id,
            username: data.user.username,
            name: data.user.name,
            role: data.user.role,
            photo: data.user.photo || data.user.photo_url,
            default_warehouse_id: data.user.default_warehouse_id
        });

        // Notificación de bienvenida
        addNotification({
            type: 'success',
            title: '¡Bienvenido!',
            message: `Sesión iniciada como ${data.user.name}`
        });

        return true;

    } catch (error) {
        console.error("[auth/handleLogin] Error durante el proceso de login:", error);
        localLoginError.textContent = `Error: ${error.message}`;
        return false;
    } finally {
        setAppStatus({ isLoading: false });
    }
}

// --- LÓGICA DE REGISTRO ---

/**
 * Maneja el envío del formulario de registro
 * @param {Event} event - Evento del formulario
 * @returns {Promise<boolean>} true si registro exitoso, false en caso contrario
 */
export async function handleRegister(event) {
    console.log("[auth/handleRegister] Iniciando registro de cliente...");
    if (event) event.preventDefault();

    const form = document.getElementById('register-form');
    const localRegisterError = document.getElementById('register-error');

    if (!form || !localRegisterError) {
        console.error("[auth/handleRegister] Formulario de registro o div de error no encontrado.");
        return false;
    }

    localRegisterError.textContent = ''; // Limpiar errores previos

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    console.log("[auth/handleRegister] Datos del formulario (antes de validar):", data);

    // Validaciones
    const validationErrors = validateRegistrationData(data);
    if (validationErrors.length > 0) {
        localRegisterError.textContent = validationErrors[0]; // Mostrar primer error
        return false;
    }

    // Limpiar y procesar datos para enviar al backend
    const processedData = processRegistrationData(data);
    console.log("[auth/handleRegister] Enviando datos a /auth/register:", processedData);

    try {
        setAppStatus({ isLoading: true });
        const submitButton = form.querySelector('button[type="submit"]');
        if(submitButton) submitButton.disabled = true;

        const response = await fetchApi('/auth/register', {
            method: 'POST',
            body: JSON.stringify(processedData)
        });

        const result = await response.json();

        if (!response.ok) {
            console.warn('[auth/handleRegister] Registro fallido. Respuesta Backend:', result);
            throw new Error(result.message || `Error en el registro (${response.status})`);
        }

        // Éxito en el registro
        console.log("[auth/handleRegister] Registro exitoso:", result.message);
        alert("¡Registro exitoso! Ahora puedes iniciar sesión.");
        form.reset();
        
        // Notificación
        addNotification({
            type: 'success',
            title: 'Registro Exitoso',
            message: 'Su cuenta ha sido creada correctamente. Ya puede iniciar sesión.'
        });
        
        showScreen('login-screen');
        return true;

    } catch (error) {
        console.error("[auth/handleRegister] Error durante el registro:", error);
        localRegisterError.textContent = `Error: ${error.message}`;
        return false;
    } finally {
        setAppStatus({ isLoading: false });
        const submitButton = form.querySelector('button[type="submit"]');
        if(submitButton) submitButton.disabled = false;
    }
}

/**
 * Valida los datos del formulario de registro
 * @param {Object} data - Datos del formulario
 * @returns {Array} Array de errores encontrados
 */
function validateRegistrationData(data) {
    const errors = [];
    
    // Campos obligatorios
    const requiredFields = ['nombre', 'dni_ruc', 'celular1', 'direccion', 'password', 'passwordConfirm', 'tipo_cliente'];
    requiredFields.forEach(field => {
        if (!data[field]) {
            errors.push(`El campo ${getFieldLabel(field)} es obligatorio.`);
        }
    });
    
    if (errors.length > 0) return errors;
    
    // Coincidencia de contraseñas
    if (data.password !== data.passwordConfirm) {
        errors.push("Las contraseñas no coinciden.");
    }
    
    // Longitud mínima de contraseña
    if (data.password && data.password.length < SYSTEM_LIMITS.PASSWORD_MIN_LENGTH) {
        errors.push(`La contraseña debe tener al menos ${SYSTEM_LIMITS.PASSWORD_MIN_LENGTH} caracteres.`);
    }
    
    // Validar DNI/RUC
    if (data.dni_ruc && !/^\d{8}(\d{3})?$/.test(data.dni_ruc)) {
        errors.push("DNI (8 dígitos) o RUC (11 dígitos) inválido.");
    }
    
    // Validar celular
    if (data.celular1 && !/^\d{9}$/.test(data.celular1)) {
        errors.push("Celular principal debe tener 9 dígitos.");
    }
    
    // Validar email si se proporcionó
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push("El formato del email no es válido.");
    }
    
    return errors;
}

/**
 * Obtiene etiqueta legible para un campo
 * @param {string} fieldName - Nombre técnico del campo
 * @returns {string} Etiqueta legible
 */
function getFieldLabel(fieldName) {
    const labels = {
        'nombre': 'Nombre completo',
        'dni_ruc': 'DNI/RUC',
        'celular1': 'Celular principal',
        'celular2': 'Celular secundario',
        'direccion': 'Dirección',
        'email': 'Email',
        'password': 'Contraseña',
        'passwordConfirm': 'Confirmación de contraseña',
        'tipo_cliente': 'Tipo de cliente',
        'cumple': 'Fecha de nacimiento',
        'referral': 'Código de referido'
    };
    return labels[fieldName] || fieldName;
}

/**
 * Procesa los datos del registro para adecuarlos al formato del backend
 * @param {Object} data - Datos originales
 * @returns {Object} Datos procesados
 */
function processRegistrationData(data) {
    const processed = { ...data };
    
    // Eliminar confirmación de contraseña
    delete processed.passwordConfirm;
    
    // Convertir lat/lon a números o null
    processed.latitud = processed.latitud ? parseFloat(processed.latitud) : null;
    processed.longitud = processed.longitud ? parseFloat(processed.longitud) : null;
    
    // Asegurar que los opcionales vacíos sean null
    processed.celular2 = processed.celular2 || null;
    processed.email = processed.email || null;
    processed.cumple = processed.cumple || null;
    processed.referral = processed.referral || null;
    
    return processed;
}

// --- RECUPERACIÓN DE CONTRASEÑA ---

/**
 * Envía solicitud para recuperar contraseña
 * @param {string} username - Nombre de usuario o email
 * @returns {Promise<boolean>} true si se envió correctamente, false en caso contrario
 */
export async function requestPasswordReset(username) {
    if (!username) return false;
    
    console.log("[auth/requestPasswordReset] Solicitando recuperación de contraseña para:", username);
    
    try {
        setAppStatus({ isLoading: true });
        const response = await fetchApi('/auth/request-password-reset', {
            method: 'POST',
            body: JSON.stringify({ username })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            console.warn('[auth/requestPasswordReset] Solicitud fallida:', result);
            throw new Error(result.message || `Error al solicitar recuperación (${response.status})`);
        }
        
        console.log("[auth/requestPasswordReset] Solicitud exitosa");
        addNotification({
            type: 'success',
            title: 'Solicitud Enviada',
            message: 'Si el usuario existe, recibirá instrucciones para restablecer su contraseña.'
        });
        
        return true;
        
    } catch (error) {
        console.error("[auth/requestPasswordReset] Error:", error);
        addNotification({
            type: 'error',
            title: 'Error',
            message: error.message
        });
        return false;
    } finally {
        setAppStatus({ isLoading: false });
    }
}

/**
 * Verifica el token de recuperación y establece nueva contraseña
 * @param {string} token - Token de recuperación
 * @param {string} newPassword - Nueva contraseña
 * @returns {Promise<boolean>} true si se restableció correctamente, false en caso contrario
 */
export async function resetPassword(token, newPassword) {
    if (!token || !newPassword) return false;
    
    console.log("[auth/resetPassword] Restableciendo contraseña con token");
    
    try {
        setAppStatus({ isLoading: true });
        const response = await fetchApi('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, newPassword })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            console.warn('[auth/resetPassword] Restablecimiento fallido:', result);
            throw new Error(result.message || `Error al restablecer contraseña (${response.status})`);
        }
        
        console.log("[auth/resetPassword] Contraseña restablecida exitosamente");
        addNotification({
            type: 'success',
            title: 'Contraseña Restablecida',
            message: 'Su contraseña ha sido restablecida exitosamente. Ya puede iniciar sesión.'
        });
        
        return true;
        
    } catch (error) {
        console.error("[auth/resetPassword] Error:", error);
        addNotification({
            type: 'error',
            title: 'Error',
            message: error.message
        });
        return false;
    } finally {
        setAppStatus({ isLoading: false });
    }
}

// --- INYECCIÓN HTML PARA PANTALLAS AUTH ---

/** Inyecta el HTML del formulario de login si no existe */
export function setupLoginScreenHTMLIfNeeded() {
    console.log("[auth/setupLogin] Verificando HTML de login...");
    const loginScreenDiv = document.getElementById('login-screen');
    if (!loginScreenDiv) {
        console.error("[auth/setupLogin] ERROR FATAL: #login-screen no existe.");
        return;
    }
    
    const loginAuthContainer = loginScreenDiv.querySelector('.auth-container');
    console.log("[auth/setupLogin] Contenedor .auth-container:", loginAuthContainer ? 'Encontrado' : 'No encontrado');

    if (loginAuthContainer && loginAuthContainer.children.length === 0) {
        console.log("[auth/setupLogin] Injectando HTML del formulario de login...");
        const loginHtml = `
            <img src="/assets/logo.png" alt="Logo Gas Ayacucho" class="logo">
            <h2>Gas ERP Ayacucho</h2>
            <p class="subtitle">Ingrese sus credenciales</p>
            <form id="login-form" novalidate>
                <div class="input-group">
                    <label for="login-username"><i class="fas fa-user"></i>Usuario:</label>
                    <input type="text" id="login-username" name="username" required autocomplete="username">
                </div>
                <div class="input-group">
                    <label for="login-password"><i class="fas fa-key"></i>Contraseña:</label>
                    <input type="password" id="login-password" name="password" required autocomplete="current-password">
                </div>
                <div class="input-group">
                    <label for="role-selector"><i class="fas fa-id-badge"></i>Tipo Usuario:</label>
                    <select id="role-selector" name="role" required>
                        <option value="" disabled selected>-- Seleccione Rol --</option>
                        <option value="cliente">Cliente</option>
                        <option value="repartidor">Repartidor</option>
                        <option value="base">Base</option>
                        <option value="contabilidad">Contabilidad</option>
                        <option value="gerente">Gerente</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="fas fa-sign-in-alt"></i> Ingresar
                </button>
                <div id="login-error" class="error-message" aria-live="assertive"></div>
            </form>
            <div class="auth-links">
                <a href="#" id="register-button">Registrarse como Cliente</a>
                <a href="#" id="forgot-password-link">Olvidé mi contraseña</a>
            </div>
        `;
        loginAuthContainer.innerHTML = loginHtml;
        
        // Adjuntar listener para link de recuperación de contraseña
        const forgotPasswordLink = loginAuthContainer.querySelector('#forgot-password-link');
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                setupPasswordResetScreenHTMLIfNeeded();
                showScreen('password-reset-screen');
            });
        }
        
        console.log("[auth/setupLogin] HTML inyectado.");
    } else if (loginAuthContainer) {
        console.log("[auth/setupLogin] El contenedor de login ya tiene contenido.");
    } else {
        console.error("[auth/setupLogin] Contenedor '.auth-container' no encontrado en #login-screen");
    }
    console.log("[auth/setupLogin] Completado.");
}

/** Inyecta el HTML del formulario de registro si no existe */
export function setupRegisterScreenHTMLIfNeeded() {
    console.log("[auth/setupRegister] Verificando HTML de registro...");
    const registerScreenDiv = document.getElementById('register-screen');
    if (!registerScreenDiv) {
        console.error("[auth/setupRegister] ERROR FATAL: #register-screen no existe.");
        return;
    }
    
    const registerAuthContainer = registerScreenDiv.querySelector('.auth-container');
    console.log("[auth/setupRegister] Contenedor .auth-container:", registerAuthContainer ? 'Encontrado' : 'No encontrado');

    if (registerAuthContainer && registerAuthContainer.children.length === 0) {
        console.log("[auth/setupRegister] Injectando HTML del formulario de registro...");
        const registerHtml = `
            <button type="button" class="back-button" onclick="window.showScreen('login-screen')"><i class="fas fa-arrow-left"></i> Volver a Login</button>
            <h2>Registro de Cliente</h2>
            <form id="register-form" novalidate>
                <div class="input-group"> <label for="reg-nombre">Nombre Completo:</label> <input type="text" id="reg-nombre" name="nombre" required> </div>
                <div class="input-group"> <label for="reg-dni">DNI/RUC:</label> <input type="text" id="reg-dni" name="dni_ruc" required pattern="\\d{8}|\\d{11}" title="Ingrese 8 dígitos para DNI o 11 para RUC"> </div>
                <div class="input-group"> <label for="reg-cel1">Celular Principal:</label> <input type="tel" id="reg-cel1" name="celular1" required pattern="\\d{9}" title="Ingrese 9 dígitos"> </div>
                <div class="input-group"> <label for="reg-cel2">Celular Secundario (Opcional):</label> <input type="tel" id="reg-cel2" name="celular2" pattern="\\d{9}" title="Ingrese 9 dígitos"> </div>
                <div class="input-group"> <label for="reg-email">Email (Opcional):</label> <input type="email" id="reg-email" name="email"> </div>
                <div class="input-group"> <label for="reg-cumple">Fecha Nacimiento (Opcional):</label> <input type="date" id="reg-cumple" name="cumple"> </div>
                <div class="input-group"> <label for="reg-direccion">Dirección Principal:</label> <textarea id="reg-direccion" name="direccion" rows="3" required></textarea> </div>
                <div class="input-group location-group"> <label>Ubicación (Opcional): <button type="button" class="btn btn-secondary btn-sm" onclick="window.getCurrentLocation(true)">Obtener Actual</button></label> <div class="coords"> <input type="number" step="any" id="reg-latitud" name="latitud" placeholder="Latitud"> <input type="number" step="any" id="reg-longitud" name="longitud" placeholder="Longitud"> </div> </div>
                <div class="input-group"> <label for="reg-tipo">Tipo Cliente:</label> <select id="reg-tipo" name="tipo_cliente" required> <option value="domicilio" selected>Domicilio</option> <option value="restaurante">Restaurante</option> <option value="negocio">Negocio</option> <option value="institucion">Institución</option> <option value="otro">Otro</option> </select> </div>
                <div class="input-group"> <label for="reg-referral">Código Referido (Opcional):</label> <input type="text" id="reg-referral" name="referral"> </div>
                <hr>
                <div class="input-group"> <label for="reg-password">Contraseña (mín. 6 caracteres):</label> <input type="password" id="reg-password" name="password" required minlength="6" autocomplete="new-password"> </div>
                <div class="input-group"> <label for="reg-passwordConfirm">Confirmar Contraseña:</label> <input type="password" id="reg-passwordConfirm" name="passwordConfirm" required minlength="6" autocomplete="new-password"> </div>
                <button type="submit" class="btn btn-success btn-block"> <i class="fas fa-user-plus"></i> Registrarme </button>
                <div id="register-error" class="error-message" aria-live="assertive"></div>
            </form>
        `;
        registerAuthContainer.innerHTML = registerHtml;
        console.log("[auth/setupRegister] HTML inyectado.");
    } else if (registerAuthContainer) {
        console.log("[auth/setupRegister] El contenedor de registro ya tiene contenido.");
    } else {
        console.error("[auth/setupRegister] Contenedor '.auth-container' no encontrado en #register-screen");
    }
    console.log("[auth/setupRegister] Completado.");
}

/** Inyecta el HTML del formulario de recuperación de contraseña si no existe */
export function setupPasswordResetScreenHTMLIfNeeded() {
    console.log("[auth/setupPasswordReset] Verificando HTML de recuperación...");
    
    // Verificar si existe el contenedor principal
    let resetScreenDiv = document.getElementById('password-reset-screen');
    if (!resetScreenDiv) {
        console.log("[auth/setupPasswordReset] Creando contenedor #password-reset-screen");
        resetScreenDiv = document.createElement('div');
        resetScreenDiv.id = 'password-reset-screen';
        resetScreenDiv.className = 'screen';
        
        // Buscar el contenedor padre donde insertar (junto a login y register)
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen && loginScreen.parentNode) {
            loginScreen.parentNode.appendChild(resetScreenDiv);
        } else {
            console.error("[auth/setupPasswordReset] No se encontró un lugar adecuado para insertar screen");
            return;
        }
    }
    
    // Verificar si existe el contenedor auth-container dentro
    let resetAuthContainer = resetScreenDiv.querySelector('.auth-container');
    if (!resetAuthContainer) {
        console.log("[auth/setupPasswordReset] Creando .auth-container en password-reset-screen");
        resetAuthContainer = document.createElement('div');
        resetAuthContainer.className = 'auth-container';
        resetScreenDiv.appendChild(resetAuthContainer);
    }
    
    console.log("[auth/setupPasswordReset] Contenedor .auth-container:", resetAuthContainer ? 'Encontrado' : 'No encontrado');

    if (resetAuthContainer && resetAuthContainer.children.length === 0) {
        console.log("[auth/setupPasswordReset] Injectando HTML del formulario de recuperación...");
        const resetHtml = `
            <button type="button" class="back-button" onclick="window.showScreen('login-screen')"><i class="fas fa-arrow-left"></i> Volver a Login</button>
            <h2>Recuperación de Contraseña</h2>
            <p class="subtitle">Ingrese su usuario o email para recibir instrucciones de recuperación</p>
            <form id="password-reset-form" novalidate>
                <div class="input-group">
                    <label for="reset-username"><i class="fas fa-user"></i>Usuario o Email:</label>
                    <input type="text" id="reset-username" name="username" required>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="fas fa-paper-plane"></i> Enviar Instrucciones
                </button>
                <div id="reset-error" class="error-message" aria-live="assertive"></div>
                <div id="reset-success" class="success-message" style="display:none;"></div>
            </form>
        `;
        resetAuthContainer.innerHTML = resetHtml;
        
        // Adjuntar listener al formulario
        const resetForm = resetAuthContainer.querySelector('#password-reset-form');
        if (resetForm) {
            resetForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('reset-username')?.value?.trim();
                const errorDiv = document.getElementById('reset-error');
                const successDiv = document.getElementById('reset-success');
                const submitBtn = resetForm.querySelector('button[type="submit"]');
                
                if (!username) {
                    if (errorDiv) errorDiv.textContent = "Por favor, ingrese un usuario o email.";
                    return;
                }
                
                if (errorDiv) errorDiv.textContent = "";
                if (successDiv) successDiv.style.display = "none";
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
                }
                
                try {
                    const success = await requestPasswordReset(username);
                    if (success && successDiv) {
                        successDiv.textContent = "Si el usuario existe, recibirá instrucciones por email para restablecer su contraseña.";
                        successDiv.style.display = "block";
                        resetForm.reset();
                    }
                } catch (error) {
                    if (errorDiv) errorDiv.textContent = error.message;
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Instrucciones';
                    }
                }
            });
        }
        
        console.log("[auth/setupPasswordReset] HTML inyectado.");
    } else if (resetAuthContainer.children.length > 0) {
        console.log("[auth/setupPasswordReset] El contenedor de recuperación ya tiene contenido.");
    }
    console.log("[auth/setupPasswordReset] Completado.");
}

// --- Verificar token al cargar módulo ---
const currentToken = getToken();
if (currentToken) {
    // Intentar decodificar y configurar renovación
    decodeToken(currentToken);
    if (tokenData) {
        setupTokenRefresh();
    }
}

console.log('[auth.js] Módulo de autenticación inicializado.');