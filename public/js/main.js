// ==================================
// js/main.js
// Punto de entrada principal y orquestador de la aplicación modular
// ==================================
console.log('[main.js] Iniciando aplicación modular...');

// --- Importaciones de Módulos Centrales ---
import { API_BASE_URL } from './modules/config.js';
import { fetchApi, fetchWithAuth } from './modules/api.js';
import { getToken, removeToken, handleLogin, handleRegister, setupLoginScreenHTMLIfNeeded, setupRegisterScreenHTMLIfNeeded } from './modules/auth.js';
import { setCurrentUser, getCurrentUser, setSelectedWarehouseId, setCurrentWarehouses, getSelectedWarehouseId, getCurrentWarehouses, setGlobalConfigState } from './modules/state.js';
import { showScreen, findAndSetupHeaderFooter, updateHeaderUserInfo, toggleWarehouseSelectorHeader, loadRoleDashboard, populateWarehouseSelectors, updateCurrentWarehouseName, showGlobalError } from './modules/ui.js';

// --- Configuración de Parámetros Globales ---
const MAX_SESSION_IDLE_TIME = 30 * 60 * 1000; // 30 minutos en ms
const SESSION_CHECK_INTERVAL = 60 * 1000; // Verificar sesión cada minuto
const CONFIG_REFRESH_INTERVAL = 10 * 60 * 1000; // Actualizar config cada 10 minutos
let idleSessionTimer = null;
let configRefreshTimer = null;

// --- Definición de Funciones Principales de Flujo ---

/**
 * Carga la configuración pública inicial (beneficios, whatsapp).
 * @returns {Promise<boolean>} - true si la carga fue exitosa, false en caso contrario.
 */
async function loadPublicConfig() {
    console.log("[main/loadPublicConfig] Cargando configuración pública...");
    try {
        const response = await fetchApi('/config/public', {}, 3); // Máximo 3 reintentos
        if (!response.ok) {
            const d = await response.json().catch(()=>({}));
            throw new Error(d.message || `Error ${response.status} cargando config`);
        }
        const configData = await response.json();
        console.log("[main/loadPublicConfig] Config pública recibida:", configData);
        
        // Validar datos mínimos necesarios
        if (!configData.benefits_description) {
            configData.benefits_description = "Acumula puntos con cada compra y canjéalos por descuentos.";
        }
        
        setGlobalConfigState(configData);
        console.log("[main/loadPublicConfig] Estado global de config actualizado.");
        return true;
    } catch (error) {
        console.error("[main/loadPublicConfig] Error al cargar config:", error);
        setGlobalConfigState({ 
            benefits_description: "No se pudo cargar la información de beneficios.",
            whatsapp_number: null
        });
        showGlobalError("No se pudo cargar la configuración inicial: " + error.message);
        return false;
    }
}

/**
 * Carga los almacenes desde la API y actualiza el estado.
 * @param {string} role - El rol del usuario actual.
 * @returns {Promise<boolean>} - true si la carga fue exitosa, false en caso contrario.
 */
async function loadWarehousesIfNeeded(role) {
    const rolesThatNeedWarehouses = ['base', 'contabilidad', 'gerente', 'repartidor'];
    if (!rolesThatNeedWarehouses.includes(role)) {
        console.log(`[main/loadWarehouses] Rol '${role}' no requiere lista de almacenes.`);
        setCurrentWarehouses([]);
        setSelectedWarehouseId(getCurrentUser()?.default_warehouse_id || null);
        return true;
    }

    console.log(`[main/loadWarehouses] Rol '${role}' requiere almacenes. Obteniendo...`);
    try {
        const response = await fetchWithAuth('/warehouses', {}, 3); // Máximo 3 reintentos
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error ${response.status} al cargar almacenes`);
        }

        const data = await response.json();
        
        // Verificar si hay datos válidos
        if (!Array.isArray(data)) {
            throw new Error("Respuesta de almacenes con formato inválido");
        }
        
        setCurrentWarehouses(data);
        console.log(`[main/loadWarehouses] ${data.length} almacenes recibidos.`);

        // Lógica de selección de almacén por defecto
        const warehouses = getCurrentWarehouses();
        const currentUser = getCurrentUser();
        let currentSelection = getSelectedWarehouseId();
        let newSelection = null;

        // Verificar si el almacén actual es válido y activo
        const currentWarehouseIsValid = warehouses.some(w => 
            w.warehouse_id === currentSelection && w.is_active);

        if (!currentWarehouseIsValid) {
            console.log("[main/loadWarehouses] Selección actual no válida o inexistente.");
            
            // Prioridad 1: Usar el almacén predeterminado del usuario si es activo
            const userDefaultWarehouse = warehouses.find(w => 
                w.warehouse_id === currentUser?.default_warehouse_id && w.is_active);
                
            // Prioridad 2: Usar el primer almacén activo
            const firstActiveWarehouse = warehouses.find(w => w.is_active);
            
            // Prioridad 3: Usar cualquier almacén disponible (incluso inactivo)
            if (userDefaultWarehouse) {
                newSelection = userDefaultWarehouse.warehouse_id;
                console.log(`[main/loadWarehouses] Usando default del usuario: ${newSelection}`);
            } else if (firstActiveWarehouse) {
                newSelection = firstActiveWarehouse.warehouse_id;
                console.log(`[main/loadWarehouses] Usando primer almacén activo: ${newSelection}`);
            } else if (warehouses.length > 0) {
                newSelection = warehouses[0].warehouse_id;
                console.warn(`[main/loadWarehouses] No hay almacenes activos. Usando el primero: ${newSelection}`);
            }
        } else {
            newSelection = currentSelection;
            console.log(`[main/loadWarehouses] Selección actual (${currentSelection}) es válida.`);
        }
        
        setSelectedWarehouseId(newSelection);
        return true;
    } catch (error) {
        console.error(`[main/loadWarehouses] Error al cargar almacenes:`, error);
        setCurrentWarehouses([]);
        setSelectedWarehouseId(null);
        showGlobalError("Error al cargar la lista de almacenes: " + error.message);
        return false;
    }
}

/**
 * Actualiza la configuración periódicamente en segundo plano.
 * @param {boolean} start - Indica si iniciar o detener el proceso.
 */
function togglePeriodicConfigUpdate(start = true) {
    if (configRefreshTimer) {
        clearInterval(configRefreshTimer);
        configRefreshTimer = null;
    }
    
    if (start) {
        configRefreshTimer = setInterval(async () => {
            console.log("[main/periodicConfigUpdate] Actualizando configuración en segundo plano...");
            // Solo cargar config si el usuario está autenticado
            if (getToken()) {
                await loadPublicConfig();
                
                // Actualizar almacenes si es necesario
                const currentUser = getCurrentUser();
                if (currentUser && ['base', 'contabilidad', 'gerente', 'repartidor'].includes(currentUser.role)) {
                    await loadWarehousesIfNeeded(currentUser.role);
                    populateWarehouseSelectors();
                    updateCurrentWarehouseName();
                }
            }
        }, CONFIG_REFRESH_INTERVAL);
        
        console.log("[main/periodicConfigUpdate] Timer de actualización configurado.");
    }
}

/**
 * Gestiona el tiempo de inactividad de la sesión.
 * @param {boolean} start - Indica si iniciar o detener el control.
 */
function toggleIdleSessionControl(start = true) {
    if (idleSessionTimer) {
        clearTimeout(idleSessionTimer);
        idleSessionTimer = null;
    }
    
    if (start) {
        let lastActivity = Date.now();
        
        // Escuchar eventos de actividad del usuario
        const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
        const resetTimer = () => { lastActivity = Date.now(); };
        
        activityEvents.forEach(event => {
            document.addEventListener(event, resetTimer, { passive: true });
        });
        
        // Verificar inactividad periódicamente
        idleSessionTimer = setInterval(() => {
            const idleTime = Date.now() - lastActivity;
            if (idleTime >= MAX_SESSION_IDLE_TIME) {
                console.warn("[main/idleSessionControl] Sesión inactiva por mucho tiempo, cerrando...");
                // Mostrar mensaje al usuario
                alert("Tu sesión ha sido cerrada por inactividad.");
                // Cerrar sesión
                handleLogout();
                clearInterval(idleSessionTimer);
                idleSessionTimer = null;
            }
        }, SESSION_CHECK_INTERVAL);
        
        console.log("[main/idleSessionControl] Control de inactividad configurado.");
    }
}

/**
 * Orquesta la carga completa de la aplicación después de un login exitoso
 * o si se encuentra un token válido al inicio.
 */
async function loadApp() {
    console.log("[main/loadApp] Iniciando carga de aplicación...");
    let loggedUser;

    try {
        // 1. Obtener/Verificar Datos del Usuario
        loggedUser = getCurrentUser();
        if (!loggedUser?.id) {
            console.log("[main/loadApp] Obteniendo perfil desde API...");
            const profileResponse = await fetchWithAuth('/users/me', {}, 2);
            
            if (!profileResponse.ok) {
                const d = await profileResponse.json().catch(()=>({}));
                throw new Error(d?.message || `Error ${profileResponse.status} al obtener perfil`);
            }
            
            const userData = await profileResponse.json();
            
            // Validar datos mínimos necesarios
            if (!userData?.user_id || !userData?.role_name) {
                throw new Error("Respuesta de perfil inválida o incompleta.");
            }

            loggedUser = {
                id: userData.user_id,
                username: userData.username,
                name: userData.full_name,
                role: userData.role_name,
                photo: userData.photo_url,
                details: userData.details,
                default_warehouse_id: userData.default_warehouse_id
            };
            
            setCurrentUser(loggedUser);
        } else {
            console.log("[main/loadApp] Usando datos de usuario del estado local.");
        }
        
        console.log("[main/loadApp] Usuario:", loggedUser);
        
        if (!loggedUser?.role) {
            throw new Error("Rol de usuario no definido o no válido.");
        }

        // 2. Cargar Almacenes (si es necesario para el rol)
        const warehousesSuccess = await loadWarehousesIfNeeded(loggedUser.role);
        if (!warehousesSuccess && ['base', 'contabilidad', 'gerente', 'repartidor'].includes(loggedUser.role)) {
            throw new Error("Error crítico: No se pudieron cargar los almacenes necesarios para este rol.");
        }

        // 3. Configurar UI del Header/Footer con handlers
        const handleGlobalWarehouseChange = (event) => {
            const newWarehouseId = parseInt(event.target.value);
            console.log(`[main/handleGlobalWarehouseChange] Nuevo ID seleccionado: ${newWarehouseId}`);
            
            if (!isNaN(newWarehouseId) && newWarehouseId !== getSelectedWarehouseId()) {
                setSelectedWarehouseId(newWarehouseId);
                updateCurrentWarehouseName();
                
                // Recargar datos específicos del dashboard
                reloadDashboardData(loggedUser.role);
            }
        };
        
        findAndSetupHeaderFooter(handleLogout, handleGlobalWarehouseChange);

        // 4. Actualizar Info del Usuario en Header
        updateHeaderUserInfo();

        // 5. Mostrar/Ocultar Selector de Almacén en Header
        toggleWarehouseSelectorHeader(loggedUser.role);

        // 6. Cargar HTML del Dashboard del Rol
        const templateLoaded = loadRoleDashboard(loggedUser.role);
        if (!templateLoaded) {
            throw new Error(`No se pudo cargar la estructura HTML para el rol ${loggedUser.role}.`);
        }

        // 7. Importar y Ejecutar JS Específico del Rol
        console.log(`[main/loadApp] Importando JS para rol: ${loggedUser.role}...`);
        try {
            // Importación dinámica del módulo del rol
            // Usamos una sintaxis de importación diferente que evita problemas con algunos navegadores
            import(`./roles/${loggedUser.role}.js`).then(async (roleModule) => {
                console.log(`[main/loadApp] Módulo JS './roles/${loggedUser.role}.js' importado.`);

                // Nombre esperado de la función setup (ej: setupClienteDashboard)
                const setupFunctionName = `setup${loggedUser.role.charAt(0).toUpperCase() + loggedUser.role.slice(1)}Dashboard`;

                if (roleModule && typeof roleModule[setupFunctionName] === 'function') {
                    console.log(`[main/loadApp] Ejecutando ${setupFunctionName}()...`);
                    await roleModule[setupFunctionName]();
                    console.log(`[main/loadApp] ${setupFunctionName}() completado.`);
                    
                    // Si el módulo tiene un objeto default, lo usamos para exponer funciones globalmente
                    if (roleModule.default) {
                        Object.assign(window, roleModule.default);
                    }
                } else if (roleModule.default && typeof roleModule.default.setupGerenteDashboard === 'function') {
                    // Caso especial para gerente que podría tener la función principal en default
                    console.log(`[main/loadApp] Ejecutando setupGerenteDashboard() desde default...`);
                    await roleModule.default.setupGerenteDashboard();
                    console.log(`[main/loadApp] setupGerenteDashboard() completado.`);
                    
                    // Exponer las funciones del objeto default globalmente
                    Object.assign(window, roleModule.default);
                } else {
                    console.warn(`[main/loadApp] Función ${setupFunctionName} no encontrada en ${loggedUser.role}.js`);
                    const mainCt = document.getElementById('main-content');
                    if (mainCt) {
                        mainCt.innerHTML += `<div class='info-message'>Funcionalidad para rol '${loggedUser.role}' no implementada completamente.</div>`;
                    }
                }
            }).catch((importError) => {
                console.error(`[main/loadApp] Error importando módulo ${loggedUser.role}.js:`, importError);
                const mainCt = document.getElementById('main-content');
                if (mainCt) {
                    mainCt.innerHTML += `<div class='error-message'>Error al cargar funcionalidad para el rol '${loggedUser.role}'. ${importError.message}</div>`;
                }
                showGlobalError(`Error al cargar el dashboard para ${loggedUser.role}: ${importError.message}`);
            });
        } catch (importError) {
            console.error(`[main/loadApp] Error importando módulo ${loggedUser.role}.js:`, importError);
            const mainCt = document.getElementById('main-content');
            if (mainCt) {
                mainCt.innerHTML += `<div class='error-message'>Error al cargar funcionalidad para el rol '${loggedUser.role}'. ${importError.message}</div>`;
            }
            showGlobalError(`Error al cargar el dashboard para ${loggedUser.role}: ${importError.message}`);
        }

        // 8. Iniciar controles de sesión y actualización periódica
        toggleIdleSessionControl(true);
        togglePeriodicConfigUpdate(true);

        // 9. Mostrar Contenedor Principal de la App
        showScreen('app-container');
        console.log("[main/loadApp] Carga de aplicación completada con éxito.");

    } catch (error) {
        console.error("[main/loadApp] Error crítico durante la carga:", error);
        
        // Mensajes específicos según el tipo de error
        if (error.message.includes("401") || 
            error.message.includes("token") || 
            error.message.includes("Sesión")) {
            alert("Tu sesión ha expirado o es inválida. Por favor, inicia sesión nuevamente.");
        } else {
            showGlobalError(`Error al cargar la aplicación: ${error.message}`);
        }
        
        // Forzar logout
        handleLogout();
    }
}

/**
 * Recarga los datos dinámicos del dashboard al cambiar el almacén global.
 * @param {string} currentRole - El rol del usuario actual.
 */
async function reloadDashboardData(currentRole) {
    console.log(`[main/reloadDashboardData] Recargando datos para rol ${currentRole} y almacén ${getSelectedWarehouseId()}`);
    try {
        // Módulos y funciones específicas a recargar según el rol
        const roleModules = {
            base: {
                module: './roles/base.js',
                functions: ['reloadBaseStock', 'reloadBasePedidosPendientes', 'reloadBasePedidosActivos']
            },
            contabilidad: {
                module: './roles/contabilidad.js',
                functions: ['reloadContaInventario']
            },
            gerente: {
                module: './roles/gerente.js',
                functions: ['reloadGerenteInventario']
            },
            repartidor: {
                module: './roles/repartidor.js',
                functions: ['reloadRepartidorInventario']
            }
        };

        // Verificar si hay configuración para el rol actual
        if (roleModules[currentRole]) {
            const config = roleModules[currentRole];
            
            try {
                // Usamos dynamic import para mayor compatibilidad
                import(config.module).then(async (roleModule) => {
                    console.log(`[main/reloadDashboardData] Módulo ${config.module} importado.`);
                    
                    // Ejecutar todas las funciones de recarga definidas
                    for (const funcName of config.functions) {
                        // Verificar si la función está en el módulo principal o en default
                        if (typeof roleModule[funcName] === 'function') {
                            console.log(`[main/reloadDashboardData] Ejecutando ${funcName}()...`);
                            await roleModule[funcName]();
                        } else if (roleModule.default && typeof roleModule.default[funcName] === 'function') {
                            console.log(`[main/reloadDashboardData] Ejecutando ${funcName}() desde default...`);
                            await roleModule.default[funcName]();
                        }
                    }
                    
                    console.log(`[main/reloadDashboardData] Recarga completada para rol ${currentRole}.`);
                }).catch((moduleError) => {
                    console.error(`[main/reloadDashboardData] Error importando módulo ${config.module}:`, moduleError);
                    throw moduleError;
                });
            } catch (moduleError) {
                console.error(`[main/reloadDashboardData] Error importando módulo ${config.module}:`, moduleError);
                throw moduleError;
            }
        } else {
            console.log(`[main/reloadDashboardData] No hay configuración de recarga para rol ${currentRole}.`);
        }
    } catch (error) {
        console.error(`[main/reloadDashboardData] Error al recargar datos:`, error);
        showGlobalError("Error al actualizar los datos del dashboard. Intente de nuevo.");
    }
}

/**
 * Maneja el proceso de cierre de sesión.
 */
function handleLogout() {
    console.log("[main/handleLogout] Iniciando cierre de sesión...");
    
    // Detener timers de sesión y actualización
    toggleIdleSessionControl(false);
    togglePeriodicConfigUpdate(false);
    
    // Limpiar datos de autenticación y estado
    removeToken();
    setCurrentUser(null);
    setSelectedWarehouseId(null);
    setCurrentWarehouses([]);
    
    console.log("[main/handleLogout] Estado y token limpiados.");

    // Actualizar UI
    updateHeaderUserInfo();
    const whSelector = document.getElementById('warehouse-selector-header');
    if (whSelector) whSelector.style.display = 'none';

    const mainCt = document.getElementById('main-content');
    if (mainCt) mainCt.innerHTML = '';

    // Preparar y mostrar pantalla de login
    setupLoginScreenHTMLIfNeeded();
    showScreen('login-screen');

    // Re-adjuntar listener al botón de registro
    const registerButtonEl = document.getElementById('register-button');
    if (registerButtonEl) {
        registerButtonEl.replaceWith(registerButtonEl.cloneNode(true));
        document.getElementById('register-button').addEventListener('click', (e) => {
            e.preventDefault();
            console.log("[Register Button] Clic detectado.");
            setupRegisterScreenHTMLIfNeeded();
            showScreen('register-screen');
        });
        console.log("[main/handleLogout] Listener de botón registro re-adjuntado.");
    }

    console.log("[main/handleLogout] Logout completado. Mostrando login.");
}

/**
 * Configura los listeners para los formularios de login y registro.
 */
function setupFormListeners() {
    console.log('[main/setupFormListeners] Configurando listeners para autenticación...');

    // Listener para Formulario Login (delegación de eventos)
    const loginScreenDiv = document.getElementById('login-screen');
    if (loginScreenDiv) {
        loginScreenDiv.addEventListener('submit', async (e) => {
            if (e.target && e.target.id === 'login-form') {
                e.preventDefault();
                console.log('[main/setupFormListeners] Login form submit detectado.');
                
                const loginFormEl = e.target;
                const submitButton = loginFormEl.querySelector('button[type="submit"]');
                const errorDisplay = document.getElementById('login-error');

                if (!errorDisplay || !submitButton) {
                    console.error("[main/setupFormListeners] Error: Falta #login-error o botón submit!");
                    return;
                }

                errorDisplay.textContent = '';
                submitButton.disabled = true;
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';

                try {
                    const loginSuccess = await handleLogin(e);
                    console.log(`[main/setupFormListeners] Login resultado: ${loginSuccess}`);
                    
                    if (loginSuccess) {
                        await loadApp();
                    }
                } catch (error) {
                    console.error('[main/setupFormListeners] Error inesperado en login:', error);
                    errorDisplay.textContent = `Error inesperado: ${error.message}`;
                } finally {
                    submitButton.disabled = false;
                    submitButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
                }
            }
        });

        // Listener para botón de registro
        loginScreenDiv.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'register-button') {
                e.preventDefault();
                console.log("[main/setupFormListeners] Register button clic.");
                setupRegisterScreenHTMLIfNeeded();
                showScreen('register-screen');
            }
        });

        console.log('[main/setupFormListeners] Listeners para Login configurados.');
    } else {
        console.error('[main/setupFormListeners] Error: #login-screen no encontrado!');
    }

    // Listener para Formulario Registro
    const registerScreenDiv = document.getElementById('register-screen');
    if (registerScreenDiv) {
        registerScreenDiv.addEventListener('submit', async (e) => {
            if (e.target && e.target.id === 'register-form') {
                e.preventDefault();
                console.log('[main/setupFormListeners] Register form submit detectado.');
                await handleRegister(e);
            }
        });
        console.log('[main/setupFormListeners] Listener para Registro configurado.');
    } else {
        console.error('[main/setupFormListeners] Error: #register-screen no encontrado!');
    }
}

/**
 * Función de inicialización principal.
 */
async function initializeApp() {
    console.log("=============================================");
    console.log("[initializeApp] INICIANDO Gas ERP Ayacucho");
    console.log("=============================================");

    try {
        // 1. Cargar configuración pública
        await loadPublicConfig();

        // 2. Preparar HTML para autenticación
        setupLoginScreenHTMLIfNeeded();
        setupRegisterScreenHTMLIfNeeded();

        // 3. Configurar listeners de formularios
        setupFormListeners();

        // 4. Verificar si hay un token válido
        const token = getToken();

        if (token) {
            console.log("[initializeApp] Token encontrado. Intentando cargar app...");
            await loadApp();
        } else {
            console.log("[initializeApp] No hay token. Mostrando login.");
            showScreen('login-screen');
        }

        console.log("[initializeApp] Inicialización completada con éxito.");

    } catch (initError) {
        console.error("==== ERROR CRÍTICO DE INICIALIZACIÓN ====", initError);
        document.body.innerHTML = `
            <div style='padding: 30px; text-align: center; border: 2px solid red; background-color: #fee; color: #a00;'>
                <h1>Error Crítico</h1>
                <p>No se pudo iniciar la aplicación correctamente.</p>
                <p><strong>Detalles:</strong> ${initError.message}</p>
                <p>Por favor, recargue la página o contacte al soporte técnico.</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 15px; cursor: pointer;">
                    Recargar Aplicación
                </button>
            </div>`;
    }
}

// --- Iniciar la aplicación al cargar el DOM ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// --- Hacer funciones principales disponibles globalmente ---
window.handleLogout = handleLogout;
window.loadApp = loadApp;

// --- Exports ---
export { loadApp, handleLogout }