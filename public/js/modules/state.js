// ==================================
// js/modules/state.js
// Gestión del estado global de la aplicación
// ==================================
import { STORAGE_CONFIG } from './config.js';

// --- Definición de Estado Inicial ---
const initialState = {
    currentUser: null,
    selectedWarehouseId: null,
    currentWarehouses: [],
    currentCylinderTypes: [],
    currentOtherProducts: [],
    globalConfig: {
        benefits_description: "Cargando beneficios...",
        whatsapp_number: null
    },
    appStatus: {
        isLoading: false,
        lastSyncTime: null,
        networkStatus: 'online',
        pendingSync: false,
        syncErrors: []
    },
    notifications: []
};

// --- Estado Principal (Privado) ---
let _state = { ...initialState };

// --- Suscripciones a Cambios ---
const _subscribers = {
    user: [],
    warehouse: [],
    products: [],
    config: [],
    status: [],
    notifications: [],
    all: []
};

// --- LocalStorage Persistence ---
const _persistentKeys = ['currentUser', 'selectedWarehouseId', 'globalConfig'];

/**
 * Guarda el estado persistente en localStorage
 */
function _saveToLocalStorage() {
    const persistentState = {};
    _persistentKeys.forEach(key => {
        if (_state[key] !== undefined) {
            persistentState[key] = _state[key];
        }
    });
    
    try {
        localStorage.setItem(STORAGE_CONFIG.SETTINGS_KEY, JSON.stringify(persistentState));
    } catch (error) {
        console.error('[state] Error al guardar estado en localStorage:', error);
    }
}

/**
 * Carga el estado persistente desde localStorage
 */
function _loadFromLocalStorage() {
    try {
        const savedState = localStorage.getItem(STORAGE_CONFIG.SETTINGS_KEY);
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            
            // Restaurar solo las claves permitidas
            _persistentKeys.forEach(key => {
                if (parsedState[key] !== undefined) {
                    _state[key] = parsedState[key];
                }
            });
            
            console.log('[state] Estado cargado desde localStorage');
        }
    } catch (error) {
        console.error('[state] Error al cargar estado desde localStorage:', error);
    }
}

/**
 * Notifica a los suscriptores sobre cambios en el estado
 * @param {string} domain - Dominio de estado que ha cambiado
 * @param {*} newValue - Nuevo valor
 * @param {*} oldValue - Valor anterior
 */
function _notifySubscribers(domain, newValue, oldValue) {
    // Notificar a suscriptores específicos del dominio
    if (_subscribers[domain]) {
        _subscribers[domain].forEach(callback => {
            try {
                callback(newValue, oldValue);
            } catch (error) {
                console.error(`[state] Error en suscriptor de ${domain}:`, error);
            }
        });
    }
    
    // Notificar a suscriptores globales
    _subscribers.all.forEach(callback => {
        try {
            callback({ domain, newValue, oldValue });
        } catch (error) {
            console.error('[state] Error en suscriptor global:', error);
        }
    });
}

// --- GETTERS ---

export function getCurrentUser() {
    return _state.currentUser ? { ..._state.currentUser } : null;
}

export function getSelectedWarehouseId() {
    return _state.selectedWarehouseId;
}

export function getCurrentWarehouses() {
    return [..._state.currentWarehouses];
}

export function getGlobalConfigState() {
    return { ..._state.globalConfig };
}

export function getCurrentCylinderTypes() {
    return [..._state.currentCylinderTypes];
}

export function getCurrentOtherProducts() {
    return [..._state.currentOtherProducts];
}

export function getAppStatus() {
    return { ..._state.appStatus };
}

export function getNotifications() {
    return [..._state.notifications];
}

// --- SETTERS ---

export function setCurrentUser(user) {
    const oldValue = _state.currentUser;
    console.log('[state] Estableciendo currentUser:', user);
    
    _state.currentUser = user ? { ...user } : null;
    _saveToLocalStorage();
    _notifySubscribers('user', _state.currentUser, oldValue);
}

export function setSelectedWarehouseId(warehouseId) {
    const newId = warehouseId !== undefined ? Number(warehouseId) || null : null;
    const oldValue = _state.selectedWarehouseId;
    
    if (_state.selectedWarehouseId !== newId) {
        console.log(`[state] Estableciendo selectedWarehouseId: ${newId}`);
        _state.selectedWarehouseId = newId;
        _saveToLocalStorage();
        _notifySubscribers('warehouse', newId, oldValue);
    } else {
        console.log(`[state] selectedWarehouseId ya era: ${newId}`);
    }
}

export function setCurrentWarehouses(warehouses) {
    const oldValue = _state.currentWarehouses;
    console.log('[state] Estableciendo currentWarehouses:', warehouses);
    
    _state.currentWarehouses = Array.isArray(warehouses) ? [...warehouses] : [];
    _notifySubscribers('warehouse', _state.currentWarehouses, oldValue);
}

export function setGlobalConfigState(config) {
    console.log('[state] Estableciendo/Actualizando globalConfigState:', config);
    
    if (config && typeof config === 'object') {
        const oldValue = { ..._state.globalConfig };
        const updatedConfig = { ..._state.globalConfig };
        
        // Actualizar solo las claves proporcionadas
        Object.keys(config).forEach(key => {
            if (config[key] !== undefined) {
                updatedConfig[key] = config[key];
            }
        });
        
        _state.globalConfig = updatedConfig;
        _saveToLocalStorage();
        _notifySubscribers('config', _state.globalConfig, oldValue);
    }
}

export function setCurrentCylinderTypes(types) {
    const oldValue = _state.currentCylinderTypes;
    console.log('[state] Estableciendo currentCylinderTypes:', types);
    
    _state.currentCylinderTypes = Array.isArray(types) ? [...types] : [];
    _notifySubscribers('products', { cylinderTypes: _state.currentCylinderTypes }, { cylinderTypes: oldValue });
}

export function setCurrentOtherProducts(products) {
    const oldValue = _state.currentOtherProducts;
    console.log('[state] Estableciendo currentOtherProducts:', products);
    
    _state.currentOtherProducts = Array.isArray(products) ? [...products] : [];
    _notifySubscribers('products', { otherProducts: _state.currentOtherProducts }, { otherProducts: oldValue });
}

export function setAppStatus(status) {
    if (status && typeof status === 'object') {
        const oldValue = { ..._state.appStatus };
        const updatedStatus = { ..._state.appStatus, ...status };
        
        _state.appStatus = updatedStatus;
        _notifySubscribers('status', _state.appStatus, oldValue);
    }
}

export function addNotification(notification) {
    if (!notification || !notification.message) return;
    
    const newNotification = {
        id: Date.now(), // Timestamp como ID único
        type: notification.type || 'info',
        message: notification.message,
        title: notification.title || '',
        timestamp: new Date(),
        read: false,
        ...notification
    };
    
    const oldNotifications = [..._state.notifications];
    _state.notifications = [newNotification, ..._state.notifications];
    
    _notifySubscribers('notifications', _state.notifications, oldNotifications);
    return newNotification.id;
}

export function markNotificationAsRead(notificationId) {
    const oldNotifications = [..._state.notifications];
    
    _state.notifications = _state.notifications.map(notif => 
        notif.id === notificationId ? { ...notif, read: true } : notif
    );
    
    _notifySubscribers('notifications', _state.notifications, oldNotifications);
}

export function clearNotifications() {
    const oldNotifications = [..._state.notifications];
    _state.notifications = [];
    _notifySubscribers('notifications', _state.notifications, oldNotifications);
}

// --- Suscripción y Sincronización ---

/**
 * Suscribe una función callback a cambios en un dominio específico del estado
 * @param {string} domain - Dominio de estado ('user', 'warehouse', 'products', 'config', 'status', 'notifications', 'all')
 * @param {Function} callback - Función a llamar cuando cambie el estado
 * @returns {Function} Función para cancelar la suscripción
 */
export function subscribe(domain, callback) {
    if (!_subscribers[domain]) {
        console.warn(`[state] Dominio de suscripción desconocido: ${domain}`);
        return () => {};
    }
    
    _subscribers[domain].push(callback);
    
    // Devolver función para cancelar suscripción
    return () => {
        _subscribers[domain] = _subscribers[domain].filter(cb => cb !== callback);
    };
}

/**
 * Reinicia el estado a sus valores por defecto
 * @param {boolean} clearPersistent - Si true, limpia también localStorage
 */
export function resetState(clearPersistent = false) {
    const oldState = { ..._state };
    _state = { ...initialState };
    
    if (clearPersistent) {
        try {
            localStorage.removeItem(STORAGE_CONFIG.SETTINGS_KEY);
        } catch (error) {
            console.error('[state] Error al limpiar localStorage:', error);
        }
    }
    
    // Notificar a todos los dominios
    Object.keys(_subscribers).forEach(domain => {
        if (domain !== 'all') {
            _notifySubscribers(domain, _state[domain], oldState[domain]);
        }
    });
    
    console.log('[state] Estado reiniciado', clearPersistent ? '(incluyendo datos persistentes)' : '');
}

// Cargar estado persistente al iniciar
_loadFromLocalStorage();

// Sincronizar con localStorage cuando cambie
window.addEventListener('beforeunload', _saveToLocalStorage);

// Monitorear estado de red
window.addEventListener('online', () => {
    setAppStatus({ networkStatus: 'online' });
    console.log('[state] Red conectada');
});

window.addEventListener('offline', () => {
    setAppStatus({ networkStatus: 'offline' });
    console.log('[state] Red desconectada');
});

console.log('[state.js] Módulo de estado inicializado.');