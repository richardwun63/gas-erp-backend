// ==================================
// js/modules/ui.js
// Funciones relacionadas con la interfaz de usuario (DOM)
// ==================================
import { getCurrentUser, getSelectedWarehouseId, getCurrentWarehouses, getGlobalConfigState } from './state.js';

// --- Referencias DOM (se buscan al inicio y cuando sea necesario) ---
let loginScreen, registerScreen, appContainer, mainContent, headerElement, footerElement;
let userNameDisplay, userRoleDisplay, userPhoto, warehouseHeaderSelector, globalWarehouseSelect, currentWarehouseNameDisplay, logoutButton;
let currentYearSpan;

/**
 * Busca los elementos principales del DOM de forma segura
 * @returns {boolean} - True si todos los elementos esenciales fueron encontrados
 */
function findMainElements() {
    console.log('[ui/findMainElements] Buscando elementos principales del DOM...');
    loginScreen = document.getElementById('login-screen');
    registerScreen = document.getElementById('register-screen');
    appContainer = document.getElementById('app-container');
    mainContent = document.getElementById('main-content');
    headerElement = document.getElementById('app-header');
    footerElement = document.getElementById('app-footer');
    
    const elementsFound = loginScreen && registerScreen && appContainer && mainContent;
    
    if (!elementsFound) {
        console.error("[ui/findMainElements] Elementos críticos no encontrados:", {
            loginScreen: !!loginScreen,
            registerScreen: !!registerScreen,
            appContainer: !!appContainer,
            mainContent: !!mainContent
        });
    }
    
    return elementsFound;
}

// Llamar una vez al cargar el módulo
const initialElementsFound = findMainElements();
if (!initialElementsFound) {
    console.warn("[ui/findMainElements] Espere hasta que el DOM esté completamente cargado");
    document.addEventListener('DOMContentLoaded', findMainElements);
}

// --- Funciones Exportadas ---

/**
 * Muestra una pantalla principal ('login-screen', 'register-screen', 'app-container')
 * y oculta las demás de forma segura.
 * @param {string} screenId ID de la pantalla a mostrar.
 * @returns {boolean} Indica si la operación fue exitosa
 */
export function showScreen(screenId) {
    console.log(`[ui/showScreen] Solicitado mostrar: ${screenId}`);
    
    // Re-verificar elementos por si el DOM se modificó
    if (!loginScreen || !registerScreen || !appContainer) {
        const elementsFound = findMainElements();
        if (!elementsFound) {
            console.error('[ui/showScreen] Elementos de pantalla críticos no encontrados. Abortando.');
            return false;
        }
    }

    // Pantallas válidas disponibles
    const validScreens = ['login-screen', 'register-screen', 'app-container'];
    if (!validScreens.includes(screenId)) {
        console.error(`[ui/showScreen] ID de pantalla inválido: ${screenId}`);
        screenId = 'login-screen'; // Fallback a login si el ID no es válido
    }

    // Ocultar todas las pantallas .screen (login, register)
    console.log('[ui/showScreen] Ocultando .screen...');
    [loginScreen, registerScreen].forEach(screen => {
        if(screen) screen.classList.remove('active');
    });

    // Manejar #app-container
    if (screenId === 'app-container') {
        appContainer.classList.remove('app-container-hidden');
        console.log("[ui/showScreen] Mostrando #app-container.");
    } else {
        appContainer.classList.add('app-container-hidden');
        console.log("[ui/showScreen] Ocultando #app-container.");

        // Mostrar la pantalla específica (login o register)
        const screenToShow = document.getElementById(screenId);
        if (screenToShow) {
            screenToShow.classList.add('active');
            console.log(`[ui/showScreen] Mostrando #${screenId}.`);
        } else {
            console.error(`[ui/showScreen] Pantalla con ID ${screenId} no encontrada.`);
            // Fallback MUY importante: si la pantalla pedida no existe, mostrar login
            if (loginScreen) {
                loginScreen.classList.add('active');
                console.warn(`[ui/showScreen] Fallback: Mostrando #login-screen porque #${screenId} no existe.`);
            }
        }
    }
    console.log(`[ui/showScreen] Visualización actualizada.`);
    return true;
}
// Exponer globalmente para onclicks simples (botón atrás registro)
window.showScreen = showScreen;

/**
 * Busca elementos del header/footer y configura listeners globales
 * (Logout y cambio de Almacén Global).
 * @param {Function} logoutHandler - Función a llamar al pulsar Salir.
 * @param {Function} warehouseChangeHandler - Función a llamar al cambiar almacén global.
 * @returns {boolean} Indica si la operación fue exitosa
 */
export function findAndSetupHeaderFooter(logoutHandler, warehouseChangeHandler) {
    console.log("[ui/findAndSetup] Buscando elementos y configurando listeners header/footer...");
    
    // Re-buscar elementos del header/footer
    headerElement = document.getElementById('app-header');
    footerElement = document.getElementById('app-footer');

    if (!headerElement) {
        console.warn("[ui/findAndSetup] #app-header NO encontrado.");
        return false;
    }

    // Busca elementos internos
    userNameDisplay = headerElement.querySelector('#user-name-display');
    userRoleDisplay = headerElement.querySelector('#user-role-display');
    userPhoto = headerElement.querySelector('#user-photo');
    logoutButton = headerElement.querySelector('#logout-button');
    warehouseHeaderSelector = headerElement.querySelector('#warehouse-selector-header');
    globalWarehouseSelect = warehouseHeaderSelector?.querySelector('#global-warehouse-select');
    currentWarehouseNameDisplay = headerElement.querySelector('#current-warehouse-name-display');

    const allElementsFound = userNameDisplay && userRoleDisplay && userPhoto && logoutButton;
    if (!allElementsFound) {
        console.warn("[ui/findAndSetup] Elementos dentro del header incompletos:", {
            userNameDisplay: !!userNameDisplay,
            userRoleDisplay: !!userRoleDisplay,
            userPhoto: !!userPhoto,
            logoutButton: !!logoutButton
        });
    }

    // Configura listener Logout
    if (logoutButton && typeof logoutHandler === 'function') {
        // Elimina listener anterior ANTES de añadir uno nuevo
        const newLogoutButton = logoutButton.cloneNode(true); // Clona para quitar listeners
        if (logoutButton.parentNode) {
            logoutButton.parentNode.replaceChild(newLogoutButton, logoutButton);
        }
        logoutButton = newLogoutButton; // Re-asigna la referencia
        logoutButton.addEventListener('click', logoutHandler);
        console.log("[ui/findAndSetup] Listener Logout OK.");
    } else {
        console.warn("[ui/findAndSetup] Botón o Handler de Logout no válido/encontrado.");
    }

    // Configura listener Cambio Almacén Global
    if (globalWarehouseSelect && typeof warehouseChangeHandler === 'function') {
        // Elimina listener anterior ANTES de añadir uno nuevo
        const newGlobalWarehouseSelect = globalWarehouseSelect.cloneNode(true); // Clona
        if (globalWarehouseSelect.parentNode) {
            globalWarehouseSelect.parentNode.replaceChild(newGlobalWarehouseSelect, globalWarehouseSelect);
        }
        globalWarehouseSelect = newGlobalWarehouseSelect; // Re-asigna la referencia
        
        if (globalWarehouseSelect) { // Verifica si aún existe después de clonar
            globalWarehouseSelect.addEventListener('change', warehouseChangeHandler);
            console.log("[ui/findAndSetup] Listener Almacén Global OK.");
        } else {
            console.warn("[ui/findAndSetup] Select Almacén Global desapareció después de clonar.");
        }
    } else {
        console.warn("[ui/findAndSetup] Select o Handler de Almacén Global no válido/encontrado.");
    }

    // Actualiza año en footer
    if (footerElement) {
        currentYearSpan = footerElement.querySelector('#current-year');
        if(currentYearSpan) {
            currentYearSpan.textContent = new Date().getFullYear();
            console.log("[ui/findAndSetup] Año en footer actualizado.");
        } else {
            console.warn("[ui/findAndSetup] Span #current-year no encontrado en footer.");
        }
    } else {
        console.warn("[ui/findAndSetup] #app-footer NO encontrado.");
    }
    
    console.log("[ui/findAndSetup] Setup Header/Footer completado.");
    return true;
}

/**
 * Actualiza la información del usuario (nombre, rol, foto) en el header.
 * @returns {boolean} Indica si la operación fue exitosa
 */
export function updateHeaderUserInfo() {
    console.log("[ui/updateHeader] Actualizando info usuario...");
    const user = getCurrentUser(); // Obtiene usuario del estado

    // Re-buscar elementos por si acaso
    if (!userNameDisplay || !userRoleDisplay || !userPhoto) {
        userNameDisplay = headerElement?.querySelector('#user-name-display');
        userRoleDisplay = headerElement?.querySelector('#user-role-display');
        userPhoto = headerElement?.querySelector('#user-photo');
    }

    if (!userNameDisplay || !userRoleDisplay || !userPhoto) {
        // No es fatal si no se encuentran, puede que el header no esté visible
        console.warn("[ui/updateHeader] Elementos UI del header no encontrados.");
        return false;
    }

    if (!user) { // Limpiar si no hay usuario
        userNameDisplay.textContent = 'Usuario';
        userRoleDisplay.textContent = 'Rol';
        userPhoto.src = '/assets/placeholder-user.png'; // Path base
        userPhoto.alt = 'Foto Usuario';
        console.log("[ui/updateHeader] Header limpiado (valores por defecto).");
    } else { // Poner datos del usuario
        const roleName = user.role || 'Desconocido';
        userNameDisplay.textContent = user.name || 'Usuario Anónimo';
        userRoleDisplay.textContent = roleName.charAt(0).toUpperCase() + roleName.slice(1);
        userPhoto.src = user.photo || '/assets/placeholder-user.png'; // Path base
        userPhoto.alt = `Foto de ${user.name || 'Usuario'}`;
        console.log("[ui/updateHeader] Header actualizado para:", user.name);
    }
    
    return true;
}

/**
 * Muestra u oculta el selector de almacén en el header según el rol.
 * @param {string} role - El rol del usuario actual.
 * @returns {boolean} Indica si la operación fue exitosa
 */
export function toggleWarehouseSelectorHeader(role) {
    console.log(`[ui/toggleWarehouse] Evaluando para rol: ${role}`);
    
    if (!role) {
        console.error("[ui/toggleWarehouse] Rol no proporcionado");
        return false;
    }
    
    warehouseHeaderSelector = headerElement?.querySelector('#warehouse-selector-header'); // Re-buscar
    
    if (!warehouseHeaderSelector) {
        console.warn("[ui/toggleWarehouse] Selector header no encontrado.");
        return false;
    }

    const rolesWithSelector = ['base', 'contabilidad', 'gerente', 'repartidor'];

    if (rolesWithSelector.includes(role)) {
        warehouseHeaderSelector.style.display = 'flex';
        console.log("[ui/toggleWarehouse] Mostrando selector.");
        // Asegurarse de que esté poblado y el nombre actual visible
        populateWarehouseSelectors(warehouseHeaderSelector);
        updateCurrentWarehouseName();
    } else {
        warehouseHeaderSelector.style.display = 'none';
        console.log("[ui/toggleWarehouse] Ocultando selector.");
    }
    
    return true;
}

/**
 * Actualiza el texto del nombre del almacén actual en el header.
 * @returns {boolean} Indica si la operación fue exitosa
 */
export function updateCurrentWarehouseName() {
    console.log("[ui/updateWarehouseName] Actualizando nombre almacén mostrado...");
    
    if (!currentWarehouseNameDisplay) {
        currentWarehouseNameDisplay = headerElement?.querySelector('#current-warehouse-name-display'); // Re-buscar
    }
    
    if (!currentWarehouseNameDisplay) {
        console.warn("[ui/updateWarehouseName] Elemento #current-warehouse-name-display no encontrado");
        return false;
    }
    
    const warehouses = getCurrentWarehouses(); // Obtiene del estado
    const currentId = getSelectedWarehouseId(); // Obtiene del estado

    if (Array.isArray(warehouses)) {
        const selectedWarehouse = warehouses.find(w => w.warehouse_id === currentId);
        const nameToShow = selectedWarehouse?.name || (currentId ? `ID: ${currentId}` : 'N/A');

        currentWarehouseNameDisplay.textContent = nameToShow;
        currentWarehouseNameDisplay.style.display = currentId ? 'inline' : 'none'; // Muestra si hay ID
        console.log(`[ui/updateWarehouseName] Nombre en header actualizado a: ${nameToShow}`);
        return true;
    } else {
        currentWarehouseNameDisplay.textContent = 'N/A';
        currentWarehouseNameDisplay.style.display = 'none';
        console.log("[ui/updateWarehouseName] No se pudo mostrar nombre (sin almacenes o elemento DOM).");
        return false;
    }
}

/**
 * Rellena TODOS los <select> de almacenes encontrados dentro de un contenedor DOM.
 * Usa la lista de almacenes y el ID seleccionado del estado global.
 * @param {Element} [container=document] - El elemento contenedor donde buscar selectores.
 * @returns {boolean} Indica si la operación fue exitosa
 */
export function populateWarehouseSelectors(container = document) {
    if (!container) container = document; // Fallback
    console.log(`[ui/populateWHSelectors] Poblando selectores en:`, container.id || container.tagName);

    const selectors = container.querySelectorAll('select[name="warehouse_id"], select[name="default_warehouse_id"], #global-warehouse-select');
    console.log(`[ui/populateWHSelectors] ${selectors.length} selectores encontrados.`);
    
    if (selectors.length === 0) {
        console.warn("[ui/populateWHSelectors] No se encontraron selectores para poblar");
        return false;
    }

    const warehouses = getCurrentWarehouses(); // De state.js
    if (!Array.isArray(warehouses) || warehouses.length === 0) {
        console.warn("[ui/populateWHSelectors] No hay almacenes disponibles en estado");
        return false;
    }
    
    const currentSelectedId = getSelectedWarehouseId(); // De state.js

    selectors.forEach(select => {
        if (!select) return; // Seguridad adicional
        
        const isGlobal = select.id === 'global-warehouse-select';
        const previousValue = select.value; // Guardar valor actual si existe
        let hasActiveOptions = false;

        // Guardar el placeholder si existe y es válido
        const placeholderOptionElement = select.options[0];
        const placeholder = placeholderOptionElement && (placeholderOptionElement.value === "" || placeholderOptionElement.disabled)
            ? { 
                value: placeholderOptionElement.value, 
                text: placeholderOptionElement.text, 
                disabled: placeholderOptionElement.disabled 
              }
            : null;

        select.innerHTML = ''; // Limpiar opciones existentes

        // Re-añadir placeholder guardado (o uno por defecto)
        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = placeholder?.value ?? ""; // Usa ?? para default
        placeholderOpt.textContent = placeholder?.text ?? "-- Seleccione --";
        placeholderOpt.disabled = placeholder?.disabled ?? true;
        placeholderOpt.selected = true; // Siempre seleccionar placeholder inicialmente
        select.appendChild(placeholderOpt);

        // Añadir almacenes ACTIVOS
        if (warehouses && warehouses.length > 0) {
            warehouses.forEach(w => {
                if (w.is_active) {
                    hasActiveOptions = true;
                    const option = document.createElement('option');
                    option.value = w.warehouse_id;
                    option.textContent = w.name;
                    select.appendChild(option);
                }
            });
        }

        // Intentar seleccionar el valor correcto
        let valueToSet = placeholderOpt.value; // Empezar con placeholder
        const isValidCurrentSelected = warehouses.some(w => w.warehouse_id === currentSelectedId && w.is_active);
        const isValidPreviousValue = warehouses.some(w => w.warehouse_id == previousValue && w.is_active); // Usar == para comparar string con number

        if (isGlobal && isValidCurrentSelected) {
            valueToSet = currentSelectedId.toString(); // Usar global si es válido
        } else if (!isGlobal && isValidPreviousValue) {
            valueToSet = previousValue; // Restaurar previo si es válido (para selects no globales)
        } else if (hasActiveOptions && valueToSet === "") {
            // Si no se pudo seleccionar nada y hay opciones activas, seleccionar la primera activa
            const firstActiveOption = select.querySelector('option:not([disabled]):not([value=""])');
            if (firstActiveOption) {
                valueToSet = firstActiveOption.value;
            }
        }

        select.value = valueToSet; // Establecer el valor final
        console.log(`[ui/populateWHSelectors] Valor final para #${select.id || '?'}: ${select.value}`);

        // Si no hay opciones activas y no había placeholder original, añadir mensaje
        if (!hasActiveOptions && !placeholder) {
            placeholderOpt.textContent = "-- Sin Almacenes Activos --";
        }
    });
    
    console.log("[ui/populateWHSelectors] Poblamiento completado.");
    return true;
}

/**
 * Carga el TEMPLATE HTML del dashboard para un rol específico en #main-content.
 * NO ejecuta el JS específico del rol.
 * @param {string} role - El rol del usuario (ej: 'cliente', 'gerente').
 * @returns {boolean} - True si el template HTML se cargó, false en caso contrario.
 */
export function loadRoleDashboard(role) {
    console.log(`[ui/loadRoleDashboard] Cargando TEMPLATE HTML para rol: ${role}`);
    
    if (!role) {
        console.error("[ui/loadRoleDashboard] No se proporcionó un rol válido");
        return false;
    }
    
    if (!mainContent) {
        mainContent = document.getElementById('main-content'); // Re-buscar por si acaso
    }

    if (!mainContent) {
        console.error("[ui/loadRoleDashboard] Elemento #main-content no encontrado!");
        return false;
    }

    // Mostrar placeholder mientras se carga el template
    mainContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando estructura interfaz...</div>';

    const templateId = `${role}-dashboard`;
    const dashboardTemplate = document.getElementById(templateId);

    if (!dashboardTemplate || !dashboardTemplate.content) { // Chequeo más robusto
        console.error(`[ui/loadRoleDashboard] Template #${templateId} no encontrado o inválido.`);
        mainContent.innerHTML = `<div class="error-message">Error: Interfaz de usuario no disponible (${role}). Template HTML no encontrado.</div>`;
        return false;
    }

    try {
        // Clonar el contenido del template
        const dashboardContent = document.importNode(dashboardTemplate.content, true);

        // Limpiar el mainContent (quitar placeholder) y añadir el clon
        mainContent.innerHTML = '';
        mainContent.appendChild(dashboardContent);

        console.log(`[ui/loadRoleDashboard] Template ${templateId} añadido al DOM.`);
        return true; // Éxito
    } catch (error) {
        console.error(`[ui/loadRoleDashboard] Error clonando/añadiendo template ${templateId}:`, error);
        mainContent.innerHTML = `<div class="error-message">Error al cargar la estructura de la interfaz (${role}): ${error.message}</div>`;
        return false; // Fallo
    }
}

// --- MODALES ---

/**
 * Abre un modal por su ID de forma segura.
 * @param {string} modalId - El ID del elemento modal.
 * @returns {boolean} Indica si la operación fue exitosa
 */
export function openModal(modalId) {
    console.log(`[ui/openModal] Abriendo modal: #${modalId}`);
    
    if (!modalId) {
        console.error("[ui/openModal] ID de modal no proporcionado");
        return false;
    }
    
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`[ui/openModal] Modal con ID ${modalId} no encontrado.`);
        return false;
    }
    
    modal.style.display = "block";
    
    // Enfocar primer elemento interactivo dentro del modal (mejora accesibilidad)
    try {
        const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) {
            // Pequeño delay para asegurar que el modal sea visible antes de enfocar
            setTimeout(() => focusable.focus(), 50);
        }
    } catch (e) {
        console.warn(`[ui/openModal] Error al intentar enfocar elemento en modal #${modalId}:`, e);
    }
    
    return true;
}
window.openModal = openModal; // Exponer globalmente si se usa en onclick

/**
 * Cierra un modal por su ID de forma segura.
 * @param {string} modalId - El ID del elemento modal.
 * @returns {boolean} Indica si la operación fue exitosa
 */
export function closeModal(modalId) {
    console.log(`[ui/closeModal] Cerrando modal: #${modalId}`);
    
    if (!modalId) {
        console.error("[ui/closeModal] ID de modal no proporcionado");
        return false;
    }
    
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.warn(`[ui/closeModal] Modal con ID ${modalId} no encontrado para cerrar.`);
        return false;
    }
    
    modal.style.display = "none";
    return true;
}
window.closeModal = closeModal; // Exponer globalmente si se usa en onclick

/** Listener global para cerrar modales al hacer clic fuera */
window.onclick = function(event) {
    if (!event || !event.target) return;
    
    const modals = document.querySelectorAll('.modal');
    if (!modals || modals.length === 0) return;
    
    modals.forEach(modal => {
        if (event.target === modal) { // Si se hizo clic DIRECTAMENTE en el fondo del modal
            console.log(`[ui/window.onclick] Clic fuera detectado, cerrando modal: #${modal.id}`);
            closeModal(modal.id);
        }
    });
};

// --- TABS ---
/**
 * Cambia la pestaña activa en una navegación por pestañas de forma segura.
 * @param {Event} evt - El evento click del enlace de la pestaña.
 * @param {string} tabName - El ID del contenido de la pestaña a mostrar.
 * @returns {boolean} Indica si la operación fue exitosa
 */
export function openTab(evt, tabName) {
    console.log(`[ui/openTab] Cambiando a tab: ${tabName}`);
    
    if (!evt || !tabName) {
        console.error("[ui/openTab] Parámetros incompletos", { event: !!evt, tabName });
        return false;
    }
    
    try {
        // Busca el contenedor padre que contiene todo el sistema de tabs
        const tabContainer = evt.currentTarget?.closest('.dashboard') || document; 
        if (!tabContainer) {
            console.error("[ui/openTab] No se pudo encontrar contenedor de tabs");
            return false;
        }

        // Ocultar todo el contenido de las pestañas dentro del contenedor
        const tabcontent = tabContainer.querySelectorAll(".tab-content");
        if (!tabcontent || tabcontent.length === 0) {
            console.warn("[ui/openTab] No se encontró contenido de tabs (.tab-content)");
        } else {
            for (let i = 0; i < tabcontent.length; i++) {
                tabcontent[i].style.display = "none";
                tabcontent[i].classList.remove("active");
            }
        }

        // Quitar clase "active" de todos los botones/links de pestaña
        const tablinks = tabContainer.querySelectorAll(".tab-link");
        if (!tablinks || tablinks.length === 0) {
            console.warn("[ui/openTab] No se encontraron botones de tabs (.tab-link)");
        } else {
            for (let i = 0; i < tablinks.length; i++) {
                tablinks[i].classList.remove("active");
            }
        }

        // Mostrar el contenido de la pestaña actual y añadir clase "active" al botón
        const currentTabContent = tabContainer.querySelector(`#${tabName}`);
        if (currentTabContent) {
            currentTabContent.style.display = "block";
            currentTabContent.classList.add("active");
            console.log(`[ui/openTab] Tab content #${tabName} mostrado.`);
        } else {
            console.error(`[ui/openTab] Contenido de tab con ID ${tabName} no encontrado.`);
            return false;
        }
        
        // Añadir clase activa al botón que disparó el evento
        if (evt.currentTarget) {
            evt.currentTarget.classList.add("active");
        }

        // Cargar datos específicos de la pestaña (si es necesario y la función existe)
        if (typeof window.loadTabData === 'function') {
            try {
                window.loadTabData(tabName); // Asume que loadTabData está definida globalmente o importada
            } catch (loadError) {
                console.warn(`[ui/openTab] Error al ejecutar loadTabData para tab ${tabName}:`, loadError);
                // No fallamos aquí porque mostrar el tab es más importante que cargar los datos
            }
        }
        
        return true;
    } catch (error) {
        console.error(`[ui/openTab] Error al cambiar a tab ${tabName}:`, error);
        return false;
    }
}
window.openTab = openTab; // Exponer globalmente para onclick

// --- MANEJO DE ERRORES GLOBALES ---

/**
 * Muestra un mensaje de error global de forma elegante.
 * @param {string} message - El mensaje de error a mostrar.
 * @param {number} [duration=5000] - Duración en ms que se mostrará el mensaje (0 = permanente)
 * @returns {HTMLElement|null} El elemento de error creado o null si falló
 */
export function showGlobalError(message, duration = 5000) {
    if (!message) {
        console.error(`[ui/showGlobalError] No se proporcionó mensaje de error`);
        return null;
    }
    
    console.error(`[ui/showGlobalError] ERROR: ${message}`);
    
    try {
        // Buscar si ya existe un contenedor de errores global
        let errorContainer = document.getElementById('global-error-container');
        
        // Si no existe, crearlo
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.id = 'global-error-container';
            errorContainer.style.position = 'fixed';
            errorContainer.style.top = '10px';
            errorContainer.style.right = '10px';
            errorContainer.style.zIndex = '10000';
            errorContainer.style.maxWidth = '400px';
            document.body.appendChild(errorContainer);
        }
        
        // Crear el elemento de error específico
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.backgroundColor = '#f8d7da';
        errorDiv.style.color = '#721c24';
        errorDiv.style.padding = '10px 15px';
        errorDiv.style.margin = '5px 0';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        errorDiv.style.position = 'relative';
        errorDiv.style.wordBreak = 'break-word';
        
        // Botón de cierre
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '5px';
        closeBtn.style.right = '10px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.fontWeight = 'bold';
        closeBtn.style.fontSize = '20px';
        closeBtn.onclick = () => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        };
        
        errorDiv.textContent = message;
        errorDiv.appendChild(closeBtn);
        errorContainer.appendChild(errorDiv);
        
        // Auto-eliminar después de duration ms (si no es 0)
        if (duration > 0) {
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.parentNode.removeChild(errorDiv);
                }
            }, duration);
        }
        
        return errorDiv;
    } catch (error) {
        console.error('[ui/showGlobalError] Error creando notificación:', error);
        // Fallback a alert si falla la creación del error visual
        alert(`Error: ${message}`);
        return null;
    }
}

console.log('[ui.js] Módulo UI cargado.');