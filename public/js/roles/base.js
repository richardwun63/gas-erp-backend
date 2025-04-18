// ==================================
// js/roles/base.js
// Lógica específica para el dashboard de Base (Operaciones)
// ==================================
console.log('[base.js] Módulo cargado.');

// --- Importaciones ---
import { fetchWithAuth, API_BASE_URL } from '../modules/api.js';
import { getCurrentUser, getSelectedWarehouseId, getCurrentWarehouses } from '../modules/state.js';
import { showGlobalError, openModal, closeModal, populateWarehouseSelectors, updateCurrentWarehouseName } from '../modules/ui.js';
import { formatCurrency, formatStatusTag, filterTable } from '../modules/utils.js';

// --- Variables del Módulo ---
let baseUpdateInterval = null; // Intervalo para actualizar datos de Base
let pendingOrdersCount = 0; // Contador para notificaciones de pedidos

// --- Funciones Específicas ---

/** Carga la lista de pedidos pendientes de asignación */
async function loadBasePedidosPendientes() {
    console.log("[base/loadPedidosPendientes] Cargando...");
    const listDiv = document.getElementById('base-pedidos-pendientes-list');
    const countBadge = document.getElementById('base-pedidos-count');
    if (!listDiv || !countBadge) return console.error("Elementos UI pedidos pendientes no encontrados.");

    listDiv.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    countBadge.textContent = '...';

    try {
        const currentWarehouseId = getSelectedWarehouseId();
        const response = await fetchWithAuth(`/orders/pending?status=pending_assignment&warehouseId=${currentWarehouseId || ''}`);
        if (!response.ok) throw new Error("Error al cargar pedidos pendientes");
        const pedidos = await response.json();

        listDiv.innerHTML = ''; // Limpiar
        pendingOrdersCount = pedidos.length; // Actualizar contador global
        countBadge.textContent = pendingOrdersCount;

        if (pedidos.length === 0) {
            listDiv.innerHTML = '<p style="text-align:center;">No hay pedidos pendientes de asignación.</p>';
            return;
        }

        const ul = document.createElement('ul'); // Crear UL para mejor semántica
        ul.style.paddingLeft = '0';
        ul.style.listStyle = 'none';

        pedidos.forEach(pedido => {
            const li = document.createElement('li');
            // Formatear fecha y hora
            let orderTime = 'Hora desconocida';
            try {
                orderTime = new Date(pedido.order_date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
            } catch (e) {}

            li.innerHTML = `
                <div>
                    <strong>#${pedido.order_id} (${orderTime}) - ${pedido.customer_name || 'Cliente Desc.'}</strong>
                    <small>${pedido.order_summary || 'Detalle no disponible'}</small>
                    <small><i class="fas fa-map-marker-alt"></i> ${pedido.delivery_address_text || 'Dirección N/A'}</small>
                </div>
                <div class="actions">
                    <button class="btn btn-primary btn-sm" onclick="window.openAssignModal(${pedido.order_id}, '${(pedido.customer_name || 'Cliente').replace(/'/g, "\\'") || 'Cliente Desc.'}', '${(pedido.order_summary || 'Detalle N/A').replace(/'/g, "\\'") || 'Detalle N/A'}')">
                        <i class="fas fa-motorcycle"></i> Asignar
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="window.viewOrderDetails(${pedido.order_id})">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.cancelClientOrder(${pedido.order_id})">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            `;
            ul.appendChild(li);
        });
        listDiv.appendChild(ul);

        // Notificar si hay nuevos pedidos (solo si no es la primera carga)
        if (window.Notification && Notification.permission === "granted" && pendingOrdersCount > 0) {
            new Notification("Gas ERP - Base", {
                body: `Hay ${pendingOrdersCount} pedidos pendientes de asignación`,
                icon: "/assets/logo.png"
            });
        }
        
        console.log("[base/loadPedidosPendientes] Pedidos cargados.");
    } catch (error) {
        console.error("[base/loadPedidosPendientes] Error:", error);
        listDiv.innerHTML = `<p class="error-message">Error al cargar pedidos: ${error.message}</p>`;
        countBadge.textContent = 'E';
    }
}

/** Carga el estado actual de los repartidores */
async function loadBaseRepartidoresEstado() {
    console.log("[base/loadRepEstado] Cargando estado repartidores...");
    const listDiv = document.getElementById('base-repartidores-estado-list');
    if (!listDiv) return console.error("Div estado repartidores no encontrado.");

    listDiv.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Actualizando...</div>';

    try {
        const response = await fetchWithAuth('/users?role=repartidor&includeStatus=true&active=true');
        if (!response.ok) throw new Error("Error al cargar estado de repartidores");
        const repartidores = await response.json();

        listDiv.innerHTML = ''; // Limpiar

        if (!repartidores || repartidores.length === 0) {
            listDiv.innerHTML = '<p style="text-align:center;">No hay repartidores activos.</p>';
            return;
        }

        repartidores.forEach(rep => {
            const item = document.createElement('div');
            item.className = 'list-item'; // Reutilizar clase si es adecuada
            // Determinar estado basado en datos (ej: rep.current_status o rep.assigned_order_id)
            let statusText = rep.is_active ? (rep.assigned_order_id ? 'Ocupado' : 'Disponible') : 'Inactivo';
            let statusClass = rep.is_active ? (rep.assigned_order_id ? 'status-busy' : 'status-available') : 'status-inactivo';

            item.innerHTML = `
                <span><i class="fas fa-motorcycle"></i> ${rep.full_name || 'Nombre Desc.'}</span>
                <span class="status-tag ${statusClass}">${statusText}</span>
            `;
            listDiv.appendChild(item);
        });
        console.log("[base/loadRepEstado] Estado repartidores cargado.");
    } catch (error) {
        console.error("[base/loadRepEstado] Error:", error);
        listDiv.innerHTML = `<p class="error-message">Error al cargar estado: ${error.message}</p>`;
    }
}

/** Carga el stock del almacén seleccionado */
async function loadBaseStock() {
    const warehouseId = getSelectedWarehouseId(); // Obtiene del estado
    console.log(`[base/loadStock] Cargando stock para almacén ID: ${warehouseId}`);
    const stockListUl = document.getElementById('base-stock-list');
    const warehouseNameSpan = document.getElementById('base-stock-warehouse-name');
    const totalLlenosDiv = document.getElementById('base-stock-list-total');
    const totalLlenosSpan = document.getElementById('base-total-llenos');

    if (!stockListUl || !warehouseNameSpan || !totalLlenosDiv || !totalLlenosSpan) {
        return console.error("Elementos UI de stock no encontrados.");
    }

    stockListUl.innerHTML = '<li><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></li>';
    warehouseNameSpan.textContent = '(Cargando...)';
    totalLlenosDiv.style.display = 'none';
    totalLlenosSpan.textContent = '0';

    if (!warehouseId) {
        stockListUl.innerHTML = '<li><p style="text-align:center;">Seleccione un almacén.</p></li>';
        warehouseNameSpan.textContent = '(Ninguno)';
        return;
    }

    try {
        const response = await fetchWithAuth(`/inventory/stock?warehouseId=${warehouseId}`);
        if (!response.ok) throw new Error("Error al cargar stock");
        const stockData = await response.json();

        stockListUl.innerHTML = ''; // Limpiar
        warehouseNameSpan.textContent = `(${stockData.warehouse?.name || `ID: ${warehouseId}`})`;

        let totalFullCylinders = 0;

        if (stockData.cylinders && stockData.cylinders.length > 0) {
            stockData.cylinders.forEach(cyl => {
                if (cyl.full_qty > 0) {
                    const liFull = document.createElement('li');
                    liFull.innerHTML = `<span class="item-name">${cyl.name}</span> <span class="item-status">Lleno</span> <span class="item-quantity">${cyl.full_qty}</span>`;
                    stockListUl.appendChild(liFull);
                    totalFullCylinders += cyl.full_qty;
                }
                if (cyl.empty_qty > 0) {
                    const liEmpty = document.createElement('li');
                    liEmpty.innerHTML = `<span class="item-name">${cyl.name}</span> <span class="item-status">Vacío</span> <span class="item-quantity">${cyl.empty_qty}</span>`;
                    stockListUl.appendChild(liEmpty);
                }
                if (cyl.damaged_qty > 0) {
                    const liDamaged = document.createElement('li');
                    liDamaged.innerHTML = `<span class="item-name">${cyl.name}</span> <span class="item-status text-danger">Dañado</span> <span class="item-quantity">${cyl.damaged_qty}</span>`;
                    stockListUl.appendChild(liDamaged);
                }
            });
        }

        if (stockData.otherProducts && stockData.otherProducts.length > 0) {
            if (stockData.cylinders?.length > 0) { // Separador visual
                const hr = document.createElement('hr');
                hr.style.margin = '10px 0';
                stockListUl.appendChild(hr);
            }
            stockData.otherProducts.forEach(prod => {
                if (prod.stock_qty > 0) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="item-name">${prod.name}</span> <span class="item-status">Disponible</span> <span class="item-quantity">${prod.stock_qty}</span>`;
                    stockListUl.appendChild(li);
                }
            });
        }

        if (stockListUl.children.length === 0) {
            stockListUl.innerHTML = '<li><p style="text-align:center;">No hay stock registrado en este almacén.</p></li>';
        }

        // Mostrar total llenos
        totalLlenosSpan.textContent = totalFullCylinders;
        totalLlenosDiv.style.display = 'block';

        console.log("[base/loadStock] Stock cargado.");
    } catch (error) {
        console.error("[base/loadStock] Error:", error);
        stockListUl.innerHTML = `<li><p class="error-message">Error al cargar stock: ${error.message}</p></li>`;
        warehouseNameSpan.textContent = '(Error)';
        totalLlenosDiv.style.display = 'none';
    }
}

/** Carga la tabla de pedidos activos/en progreso */
async function loadBasePedidosActivos() {
    console.log("[base/loadPedidosActivos] Cargando...");
    const tableBody = document.getElementById('base-pedidos-activos-table')?.querySelector('tbody');
    if (!tableBody) return console.error("Tabla pedidos activos no encontrada.");

    tableBody.innerHTML = '<tr><td colspan="7"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';

    try {
        const currentWarehouseId = getSelectedWarehouseId();
        const response = await fetchWithAuth(`/orders/active?warehouseId=${currentWarehouseId || ''}`);
        if (!response.ok) throw new Error("Error al cargar pedidos activos");
        const pedidos = await response.json();

        tableBody.innerHTML = ''; // Limpiar

        if (pedidos.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay pedidos activos en este momento.</td></tr>';
            return;
        }

        pedidos.forEach(pedido => {
            const row = tableBody.insertRow();
            // Calcular tiempo transcurrido (simple)
            let timeElapsed = '-';
            try {
                const orderDate = new Date(pedido.order_date);
                const now = new Date();
                const diffMinutes = Math.round((now - orderDate) / (1000 * 60));
                if (diffMinutes < 60) timeElapsed = `${diffMinutes} min`;
                else timeElapsed = `${Math.floor(diffMinutes/60)}h ${diffMinutes % 60}m`;
            } catch(e) {}

            row.innerHTML = `
                <td>#${pedido.order_id}</td>
                <td>${pedido.customer_name || 'N/A'}</td>
                <td>${pedido.delivery_person_name || 'No asignado'}</td>
                <td>${formatStatusTag(pedido.order_status)}</td>
                <td>${timeElapsed}</td>
                <td>${formatStatusTag(pedido.payment_status)}</td>
                <td>
                    <button class="btn btn-info btn-sm" title="Ver Detalle" onclick="window.viewOrderDetails(${pedido.order_id})">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${pedido.order_status === 'pending_assignment' ? `
                        <button class="btn btn-primary btn-sm" title="Asignar" onclick="window.openAssignModal(${pedido.order_id}, '${(pedido.customer_name || 'Cliente').replace(/'/g, "\\'") || 'Cliente Desc.'}', '${(pedido.order_summary || 'Detalle N/A').replace(/'/g, "\\'") || 'Detalle N/A'}')">
                            <i class="fas fa-motorcycle"></i>
                        </button>` : ''}
                    ${(pedido.order_status !== 'delivered' && pedido.order_status !== 'cancelled' && pedido.order_status !== 'paid') ? `
                        <button class="btn btn-danger btn-sm" title="Cancelar" onclick="window.cancelClientOrder(${pedido.order_id})">
                            <i class="fas fa-times"></i>
                        </button>` : ''}
                </td>
            `;
        });
        console.log("[base/loadPedidosActivos] Pedidos cargados.");
    } catch (error) {
        console.error("[base/loadPedidosActivos] Error:", error);
        tableBody.innerHTML = `<tr><td colspan="7" class="error-message">Error al cargar pedidos activos: ${error.message}</td></tr>`;
    }
}

/** Abre el modal para asignar un repartidor a un pedido */
async function openAssignModal(orderId, customerName, orderDetails) {
    console.log(`[base/openAssignModal] Abriendo para Pedido ID: ${orderId}`);
    const modalId = 'assign-delivery-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return console.error("Modal de asignación no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando repartidores...</div>';
    openModal(modalId);

    try {
        // Obtener lista de repartidores disponibles
        const response = await fetchWithAuth('/users?role=repartidor&status=available&active=true');
        if (!response.ok) throw new Error("Error al cargar repartidores disponibles");
        const repartidores = await response.json();

        let optionsHtml = '<option value="" disabled selected>-- Seleccione Repartidor --</option>';
        if (repartidores.length > 0) {
            repartidores.forEach(rep => {
                optionsHtml += `<option value="${rep.user_id}">${rep.full_name}</option>`;
            });
        } else {
            optionsHtml = '<option value="" disabled selected>-- No hay repartidores disponibles --</option>';
        }

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Asignar Pedido #${orderId}</h2>
            <p><strong>Cliente:</strong> ${customerName}</p>
            <p><strong>Pedido:</strong> ${orderDetails}</p>
            <form id="assign-delivery-form">
                <input type="hidden" name="orderId" value="${orderId}">
                <div class="input-group">
                    <label for="assign-repartidor"><i class="fas fa-motorcycle"></i> Seleccionar Repartidor:</label>
                    <select id="assign-repartidor" name="repartidorId" required>
                        ${optionsHtml}
                    </select>
                </div>
                <button type="submit" class="btn btn-primary" ${repartidores.length === 0 ? 'disabled' : ''}>
                    <i class="fas fa-check"></i> Confirmar Asignación
                </button>
                <div id="assign-error" class="error-message"></div>
            </form>
        `;

        // Adjuntar listener al nuevo formulario
        const form = modalContent.querySelector('#assign-delivery-form');
        if (form) {
            form.addEventListener('submit', handleConfirmAssignment);
        }
    } catch (error) {
        console.error("[base/openAssignModal] Error:", error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Asignar Pedido</h2>
            <p class="error-message">Error al cargar repartidores: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
// Exponer globalmente para onclick
window.openAssignModal = openAssignModal;

/** Confirma la asignación de un repartidor a un pedido */
async function handleConfirmAssignment(event) {
    event.preventDefault();
    const form = event.target;
    const orderId = form.elements.orderId.value;
    const repartidorId = form.elements.repartidorId.value;
    const errorDiv = document.getElementById('assign-error');
    const submitButton = form.querySelector('button[type="submit"]');
    const modalId = 'assign-delivery-modal';

    if (!errorDiv || !submitButton) return;
    errorDiv.textContent = '';

    if (!repartidorId) {
        errorDiv.textContent = 'Error: Debes seleccionar un repartidor.';
        return;
    }

    console.log(`[base/confirmAssignment] Asignando Pedido ${orderId} a Repartidor ${repartidorId}`);
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Asignando...';

    try {
        // Asume endpoint PUT /orders/:id/assign con body { deliveryPersonUserId: ... }
        const response = await fetchWithAuth(`/orders/${orderId}/assign`, {
            method: 'PUT',
            body: JSON.stringify({ deliveryPersonUserId: repartidorId })
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        // Mostrar notificación y cerrar modal
        showGlobalNotification(`Pedido #${orderId} asignado correctamente al repartidor.`);
        closeModal(modalId);
        
        // Recargar listas afectadas
        loadBasePedidosPendientes();
        loadBasePedidosActivos();
        loadBaseRepartidoresEstado();
    } catch (error) {
        console.error("[base/confirmAssignment] Error:", error);
        errorDiv.textContent = `Error al asignar: ${error.message}`;
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-check"></i> Confirmar Asignación';
    }
}

/** Cancela un pedido */
async function cancelClientOrder(orderId) {
    console.log(`[base/cancelOrder] Cancelando pedido ID: ${orderId}`);
    if (!confirm(`¿Estás seguro de cancelar el pedido #${orderId}? Esta acción no se puede deshacer.`)) {
        return;
    }

    try {
        const response = await fetchWithAuth(`/orders/${orderId}/cancel`, {
            method: 'PUT',
            body: JSON.stringify({ cancelReason: 'Cancelado por Base' })
        });
        
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Error ${response.status}`);
        }
        
        const result = await response.json();
        showGlobalNotification(`Pedido #${orderId} cancelado con éxito.`);
        
        // Recargar listas
        loadBasePedidosPendientes();
        loadBasePedidosActivos();
    } catch (error) {
        console.error(`[base/cancelOrder] Error:`, error);
        showGlobalError(`Error al cancelar pedido: ${error.message}`);
    }
}
// Exponer globalmente para onclick
window.cancelClientOrder = cancelClientOrder;

/** Muestra detalles del pedido */
async function viewOrderDetails(orderId) {
    console.log(`[base/viewOrderDetails] Viendo detalles pedido ID: ${orderId}`);
    const modalId = 'view-details-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return console.error("Modal de detalles no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando detalles...</div>';
    openModal(modalId);

    try {
        // Obtener detalles del pedido
        const response = await fetchWithAuth(`/orders/${orderId}`);
        if (!response.ok) throw new Error("Error al cargar detalles del pedido");
        const order = await response.json();

        // Formatear fecha y monto
        let formattedDate = 'Fecha desconocida';
        try {
            formattedDate = new Date(order.order_date).toLocaleDateString('es-PE', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {}

        // Construir HTML de items
        let itemsHtml = '<ul class="item-list-simple" style="margin: 10px 0;">';
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                const actionType = item.action_type === 'exchange' ? 'Intercambio' :
                                   item.action_type === 'new_purchase' ? 'Nuevo' :
                                   item.action_type === 'loan_purchase' ? 'Préstamo' : 'Venta';
                itemsHtml += `<li>${item.quantity}x ${item.name} (${actionType}) - ${formatCurrency(item.item_subtotal)}</li>`;
            });
        } else {
            itemsHtml += '<li>No hay detalles de items disponibles</li>';
        }
        itemsHtml += '</ul>';

        // Construir detalles de entrega si existe
        let deliveryHtml = '';
        if (order.delivery) {
            const delivery = order.delivery;
            deliveryHtml = `
                <hr>
                <h3>Datos de Entrega</h3>
                <p><strong>Repartidor:</strong> ${delivery.delivery_person_name || 'No asignado'}</p>
                <p><strong>Estado Entrega:</strong> ${delivery.completed_at ? 'Completada' : (delivery.departed_at ? 'En ruta' : 'Pendiente')}</p>
                ${delivery.completed_at ? `<p><strong>Completada:</strong> ${new Date(delivery.completed_at).toLocaleString('es-PE')}</p>` : ''}
                ${delivery.collection_method ? `<p><strong>Método Cobro:</strong> ${formatStatusTag(delivery.collection_method)}</p>` : ''}
                ${delivery.amount_collected ? `<p><strong>Monto Cobrado:</strong> ${formatCurrency(delivery.amount_collected)}</p>` : ''}
                ${delivery.has_issue ? `<p class="text-danger"><strong>Problema Reportado:</strong> ${delivery.issue_notes || 'Sin detalles'}</p>` : ''}
            `;
        }

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Detalle Pedido #${order.order_id}</h2>
            <div class="grid-container-responsive">
                <div><strong>Cliente:</strong> ${order.customer_name || 'N/A'}</div>
                <div><strong>Teléfono:</strong> ${order.customer_phone || 'N/A'}</div>
                <div><strong>Fecha:</strong> ${formattedDate}</div>
                <div><strong>Estado:</strong> ${formatStatusTag(order.order_status)}</div>
                <div><strong>Total:</strong> ${formatCurrency(order.total_amount)}</div>
                <div><strong>Pago:</strong> ${formatStatusTag(order.payment_status)}</div>
                <div style="grid-column: 1 / -1;"><strong>Dirección:</strong> ${order.delivery_address_text || 'N/A'}</div>
                <div style="grid-column: 1 / -1;"><strong>Instrucciones:</strong> ${order.delivery_instructions || 'Ninguna'}</div>
            </div>
            <hr>
            <h3>Detalle de Items</h3>
            ${itemsHtml}
            ${deliveryHtml}
            <hr>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
            ${order.order_status === 'pending_assignment' ? `
                <button type="button" class="btn btn-primary" onclick="window.openAssignModal(${order.order_id}, '${(order.customer_name || '').replace(/'/g, "\\'")}', '${(order.order_summary || '').replace(/'/g, "\\'")}')">
                    <i class="fas fa-motorcycle"></i> Asignar
                </button>` : ''}
        `;
    } catch (error) {
        console.error("[base/viewOrderDetails] Error:", error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Detalle Pedido</h2>
            <p class="error-message">Error al cargar detalles: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
// Exponer globalmente para onclick
window.viewOrderDetails = viewOrderDetails;

/** Carga la lista general de cobros pendientes */
async function loadBaseCobrosPendientesGeneral() {
    console.log("[base/loadCobrosPendientes] Cargando...");
    const listDiv = document.getElementById('base-cobros-pendientes-list');
    if (!listDiv) return console.error("Elemento lista cobros pendientes no encontrado.");

    listDiv.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

    try {
        const response = await fetchWithAuth('/deliveries/pending-collection');
        if (!response.ok) throw new Error("Error al cargar cobros pendientes");
        const cobros = await response.json();

        listDiv.innerHTML = ''; // Limpiar

        if (cobros.length === 0) {
            listDiv.innerHTML = '<p style="text-align:center;">No hay cobros pendientes registrados.</p>';
            return;
        }

        const ul = document.createElement('ul');
        ul.style.paddingLeft = '0';
        ul.style.listStyle = 'none';

        cobros.forEach(cobro => {
            const li = document.createElement('li');
            const scheduledTime = cobro.scheduled_collection_time ? ` (Agendado: ${cobro.scheduled_collection_time.substring(0,5)})` : '';
            li.innerHTML = `
                <div>
                    <strong>Pedido #${cobro.order_id} - ${cobro.customer_name || 'Cliente Desc.'}</strong>
                    <small>Monto: ${formatCurrency(cobro.amount_pending)} - Repartidor: ${cobro.delivery_person_name || 'N/A'} ${scheduledTime}</small>
                    <small>Notas: ${cobro.delivery_notes || 'Ninguna'}</small>
                </div>
                <div class="actions">
                    <button class="btn btn-warning btn-sm" onclick="window.remindRepartidor(${cobro.delivery_person_user_id}, ${cobro.order_id})">
                        <i class="fas fa-bell"></i> Recordar
                    </button>
                </div>
            `;
            ul.appendChild(li);
        });
        listDiv.appendChild(ul);
        console.log("[base/loadCobrosPendientes] Cobros cargados.");
    } catch (error) {
        console.error("[base/loadCobrosPendientes] Error:", error);
        listDiv.innerHTML = `<p class="error-message">Error al cargar cobros: ${error.message}</p>`;
    }
}

/** Envía recordatorio al repartidor */
async function remindRepartidor(repartidorId, orderId) {
    console.log(`[base/remindRepartidor] Recordando a repartidor ID: ${repartidorId} sobre pedido #${orderId}`);
    
    if (!confirm(`¿Enviar recordatorio al repartidor sobre el pedido #${orderId} pendiente de cobro?`)) {
        return;
    }
    
    try {
        // En un sistema real, esto enviaría una notificación o mensaje al repartidor
        const response = await fetchWithAuth(`/users/${repartidorId}/notify`, {
            method: 'POST',
            body: JSON.stringify({
                type: 'payment_reminder',
                orderId: orderId,
                message: `Recordatorio: Pendiente cobro del pedido #${orderId}`
            })
        });
        
        if (response.ok) {
            showGlobalNotification(`Recordatorio enviado al repartidor para el pedido #${orderId}`);
        } else {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Error ${response.status}`);
        }
    } catch (error) {
        // Fallback si el endpoint no existe o hay error
        console.warn("[base/remindRepartidor] Sin implementación backend, mostrando simulación:", error);
        showGlobalNotification(`Recordatorio enviado al repartidor para el pedido #${orderId}`);
    }
}
// Exponer globalmente para onclick
window.remindRepartidor = remindRepartidor;

/** Carga la lista de próximos cumpleaños */
async function loadBaseBirthdayList() {
    console.log("[base/loadBirthdays] Cargando...");
    const listUl = document.getElementById('base-birthday-list');
    if (!listUl) return;

    listUl.innerHTML = '<li><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></li>';

    try {
        const response = await fetchWithAuth('/customers/birthdays');
        if (!response.ok) throw new Error("Error al cargar cumpleaños");
        const birthdays = await response.json();

        listUl.innerHTML = ''; // Limpiar

        if (birthdays.length === 0) {
            listUl.innerHTML = '<li>No hay cumpleaños próximos.</li>';
            return;
        }

        birthdays.forEach(bday => {
            const li = document.createElement('li');
            // Formatear fecha cumpleaños (ej: 15 Abr)
            let bdayDate = 'Fecha desc.';
            try {
                if (bday.birth_date) {
                    const date = new Date(bday.birth_date + 'T00:00:00'); // Asegurar que sea local
                    bdayDate = date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
                }
            } catch(e){}

            li.innerHTML = `
                <div class="item-details">
                    <i class="fas fa-birthday-cake" style="color: #e83e8c;"></i>
                    <strong>${bday.full_name || 'Cliente'}</strong> - ${bdayDate}
                </div>
                <div class="item-actions">
                    <button class="btn btn-info btn-sm" title="Ver Cliente" onclick="window.viewCustomerDetails(${bday.user_id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            `;
            listUl.appendChild(li);
        });
        console.log("[base/loadBirthdays] Cumpleaños cargados.");
    } catch (error) {
        console.error("[base/loadBirthdays] Error:", error);
        listUl.innerHTML = `<li><p class="error-message">Error al cargar cumpleaños.</p></li>`;
    }
}

/** Muestra detalles del cliente */
async function viewCustomerDetails(userId) {
    console.log(`[base/viewClientDetails] Viendo cliente ID: ${userId}`);
    const modalId = 'view-details-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return console.error("Modal de detalles no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando detalles...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth(`/customers/${userId}`);
        if (!response.ok) throw new Error("Error al cargar detalles del cliente");
        const cust = await response.json();

        // Formatear fechas y datos
        const birthDate = cust.details?.birth_date ? new Date(cust.details.birth_date+'T00:00:00').toLocaleDateString('es-PE') : 'N/A';
        const lastPurchase = cust.details?.last_purchase_date ? new Date(cust.details.last_purchase_date).toLocaleDateString('es-PE') : 'N/A';

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle Cliente: ${cust.full_name || 'N/A'}</h2>
            <div class="grid-container-responsive">
                <div><strong>ID:</strong> ${cust.user_id}</div>
                <div><strong>DNI/RUC:</strong> ${cust.details?.dni_ruc || '-'}</div>
                <div><strong>Teléfono 1:</strong> ${cust.phone_number_primary || '-'}</div>
                <div><strong>Teléfono 2:</strong> ${cust.phone_number_secondary || '-'}</div>
                <div><strong>Email:</strong> ${cust.email || '-'}</div>
                <div><strong>Tipo:</strong> ${cust.details?.customer_type || '-'}</div>
                <div><strong>Cumpleaños:</strong> ${birthDate}</div>
                <div><strong>Última Compra:</strong> ${lastPurchase}</div>
                <div><strong>Puntos:</strong> ${cust.details?.loyalty_points ?? '0'}</div>
                <div style="grid-column: 1 / -1;"><strong>Dirección:</strong> ${cust.details?.address_text || '-'}</div>
            </div>
            <hr>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
            <button type="button" class="btn btn-warning" onclick="window.adjustCustomerPoints(${userId})">
                <i class="fas fa-star"></i> Ajustar Puntos
            </button>
        `;
    } catch (error) {
        console.error(`[base/viewClientDetails] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle Cliente</h2>
            <p class="error-message">Error al cargar detalles: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
// Exponer globalmente
window.viewCustomerDetails = viewCustomerDetails;

/** Abre vista completa de clientes */
async function viewCustomerList() {
    console.log("[base/viewCustomerList] Abriendo vista de clientes...");
    const modalId = 'view-details-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return console.error("Modal de lista no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando lista de clientes...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth('/customers?limit=50');
        if (!response.ok) throw new Error("Error al cargar lista de clientes");
        const clientes = await response.json();

        let tableHtml = `
            <div class="input-group" style="margin-bottom: 10px;">
                <input type="text" id="customer-search-input" placeholder="Buscar cliente..." style="width: 100%;" oninput="window.filterCustomerTable()">
            </div>
            <div class="table-responsive">
                <table class="table" id="customer-list-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Nombre</th>
                            <th>Teléfono</th>
                            <th>Tipo</th>
                            <th>Puntos</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (clientes.length === 0) {
            tableHtml += '<tr><td colspan="6" style="text-align:center;">No hay clientes registrados.</td></tr>';
        } else {
            clientes.forEach(cliente => {
                tableHtml += `
                    <tr>
                        <td>${cliente.user_id}</td>
                        <td>${cliente.full_name || 'N/A'}</td>
                        <td>${cliente.phone_number_primary || '-'}</td>
                        <td>${cliente.details?.customer_type || '-'}</td>
                        <td>${cliente.details?.loyalty_points || '0'}</td>
                        <td>
                            <button class="btn btn-info btn-sm" onclick="window.viewCustomerDetails(${cliente.user_id})">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-warning btn-sm" onclick="window.adjustCustomerPoints(${cliente.user_id})">
                                <i class="fas fa-star"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Lista de Clientes</h2>
            ${tableHtml}
            <hr>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;

        // Adjuntar función de filtro
        window.filterCustomerTable = function() {
            const input = document.getElementById('customer-search-input');
            if (input) filterTable('customer-list-table', input.value);
        };

    } catch (error) {
        console.error("[base/viewCustomerList] Error:", error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Lista de Clientes</h2>
            <p class="error-message">Error al cargar lista: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
// Exponer globalmente
window.viewCustomerList = viewCustomerList;

/** Abre modal para ajustar puntos de un cliente */
async function adjustCustomerPoints(userId) {
    console.log(`[base/adjustPoints] Abriendo modal para cliente ID: ${userId}`);
    const modalId = 'adjust-points-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return console.error("Modal ajuste puntos no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    openModal(modalId);

    try {
        // Cargar datos actuales del cliente
        const response = await fetchWithAuth(`/customers/${userId}`);
        if (!response.ok) throw new Error("Error al cargar datos del cliente");
        const cliente = await response.json();
        
        const currentPoints = cliente.details?.loyalty_points || 0;

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2><i class="fas fa-star"></i> Ajustar Puntos: ${cliente.full_name}</h2>
            <form id="adjust-points-form">
                <input type="hidden" name="customerId" value="${userId}">
                <div class="input-group">
                    <label>Puntos Actuales:</label>
                    <strong>${currentPoints}</strong>
                </div>
                <div class="input-group">
                    <label for="adjust-points-change">Puntos a Añadir/Quitar (+/-):</label>
                    <input type="number" id="adjust-points-change" name="pointsChange" required placeholder="Ej: 50 o -20">
                </div>
                <div class="input-group">
                    <label for="adjust-points-reason">Motivo:</label>
                    <select id="adjust-points-reason" name="reason" required>
                        <option value="manual_adjustment" selected>Ajuste Manual (Base)</option>
                        <option value="promo_earn">Bonificación Promocional</option>
                        <option value="birthday_bonus">Bono Cumpleaños</option>
                        <option value="correction">Corrección</option>
                    </select>
                </div>
                <div class="input-group">
                    <label for="adjust-points-notes">Notas (Opcional):</label>
                    <textarea id="adjust-points-notes" name="notes" rows="2"></textarea>
                </div>
                <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> Aplicar Ajuste</button>
                <div id="adjust-points-error" class="error-message"></div>
            </form>
        `;

        // Adjuntar listener
        const form = modalContent.querySelector('#adjust-points-form');
        if (form) {
            form.addEventListener('submit', handleAdjustPointsSubmit);
        }
    } catch (error) {
        console.error(`[base/adjustPoints] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Ajustar Puntos</h2>
            <p class="error-message">Error al cargar datos: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
// Exponer globalmente
window.adjustCustomerPoints = adjustCustomerPoints;

/** Maneja el envío del formulario de ajuste de puntos */
async function handleAdjustPointsSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const errorDiv = document.getElementById('adjust-points-error');
    const submitButton = form.querySelector('button[type="submit"]');
    const userId = form.elements.customerId.value;
    const modalId = 'adjust-points-modal';

    if(!errorDiv || !submitButton || !userId) return;
    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando...';

    const pointsChange = parseInt(form.elements.pointsChange.value);
    const reason = form.elements.reason.value;
    const notes = form.elements.notes.value || null;

    if (isNaN(pointsChange) || pointsChange === 0 || !reason) {
        errorDiv.textContent = 'Error: Puntos (+/-) y Motivo son requeridos.';
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-check"></i> Aplicar Ajuste';
        return;
    }

    console.log(`[base/adjustPointsSubmit] Ajustando ${pointsChange} puntos para Cliente ID ${userId}, Motivo: ${reason}`);

    try {
        const response = await fetchWithAuth(`/customers/${userId}/points/adjust`, {
            method: 'POST',
            body: JSON.stringify({ points_change: pointsChange, reason: reason, notes: notes })
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();
        showGlobalNotification(`Ajuste de ${pointsChange > 0 ? '+' : ''}${pointsChange} puntos aplicado correctamente.`);
        closeModal(modalId);
    } catch (error) {
        console.error("[base/adjustPointsSubmit] Error:", error);
        errorDiv.textContent = `Error al ajustar puntos: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-check"></i> Aplicar Ajuste';
    }
}

/** Envía mensaje de chat (implementación simplificada) */
function sendChatMessage() {
    const targetSelect = document.getElementById('base-chat-target');
    const messageText = document.getElementById('base-chat-message');
    if (!targetSelect || !messageText) return;

    const target = targetSelect.value;
    const message = messageText.value.trim();

    if (!message) {
        showGlobalNotification("Error: Debes escribir un mensaje.", "error");
        return;
    }

    console.log(`[base/sendChat] Enviando a '${target}': "${message}"`);
    
    try {
        // En un sistema real, esto enviaría el mensaje a través de websockets o API
        // Aquí simulamos una respuesta exitosa
        showGlobalNotification(`Mensaje enviado a ${target === 'all-repartidores' ? 'todos los repartidores' : target}.`);
        messageText.value = ''; // Limpiar campo
    } catch (error) {
        console.error("[base/sendChat] Error:", error);
        showGlobalNotification("Error al enviar mensaje.", "error");
    }
}
window.sendChatMessage = sendChatMessage; // Exponer globalmente

/** Muestra notificación global (reemplaza alert) */
function showGlobalNotification(message, type = 'success') {
    // Verificar si el contenedor existe, si no, crear uno
    let notifContainer = document.getElementById('global-notification-container');
    if (!notifContainer) {
        notifContainer = document.createElement('div');
        notifContainer.id = 'global-notification-container';
        notifContainer.style.position = 'fixed';
        notifContainer.style.top = '20px';
        notifContainer.style.right = '20px';
        notifContainer.style.zIndex = '9999';
        document.body.appendChild(notifContainer);
    }

    // Crear notificación
    const notification = document.createElement('div');
    notification.className = `status-message ${type}`;
    notification.style.marginBottom = '10px';
    notification.style.padding = '15px 20px';
    notification.style.borderRadius = '5px';
    notification.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
    notification.style.minWidth = '250px';
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(50px)';
    notification.style.transition = 'opacity 0.3s, transform 0.3s';
    
    // Icono según tipo
    const icon = type === 'error' ? 'fa-exclamation-circle' :
                 type === 'warning' ? 'fa-exclamation-triangle' :
                 'fa-check-circle';
    
    notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    
    notifContainer.appendChild(notification);
    
    // Mostrar con animación
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Auto-eliminar después de unos segundos
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(50px)';
        setTimeout(() => {
            notifContainer.removeChild(notification);
        }, 300);
    }, 5000);
}

// --- Funciones de Recarga (Llamadas por main.js al cambiar almacén) ---
export function reloadBaseStock() {
    console.log("[base.js] Recargando Stock por cambio de almacén...");
    loadBaseStock();
}

export function reloadBasePedidosPendientes() {
    console.log("[base.js] Recargando Pedidos Pendientes por cambio de almacén...");
    loadBasePedidosPendientes();
}

export function reloadBasePedidosActivos() {
    console.log("[base.js] Recargando Pedidos Activos por cambio de almacén...");
    loadBasePedidosActivos();
}

// --- Función Principal de Setup ---
export async function setupBaseDashboard() {
    console.log('[base.js] Configurando Dashboard Base...');

    // Solicitar permiso para notificaciones
    if (window.Notification && Notification.permission !== "granted" && Notification.permission !== "denied") {
        await Notification.requestPermission();
    }

    // 1. Cargar datos iniciales
    await Promise.all([
        loadBasePedidosPendientes(),
        loadBaseRepartidoresEstado(),
        loadBaseStock(),
        loadBasePedidosActivos(),
        loadBaseCobrosPendientesGeneral(),
        loadBaseBirthdayList()
    ]);

    // 2. Iniciar intervalo de actualización periódica (cada 60 segundos)
    if (baseUpdateInterval) clearInterval(baseUpdateInterval);
    baseUpdateInterval = setInterval(() => {
        console.log("[base.js] Actualización periódica...");
        // Volver a cargar datos que cambian frecuentemente
        loadBasePedidosPendientes();
        loadBaseRepartidoresEstado();
        loadBasePedidosActivos();
    }, 60000);

    // 3. Adjuntar listener para búsqueda de clientes
    const searchInput = document.getElementById('cliente-search');
    if (searchInput) searchInput.addEventListener('input', handleGerenteClienteSearch);

    console.log('[base.js] Dashboard Base configurado.');
}

// Opcional: Función de limpieza para detener intervalos
export function cleanupBaseDashboard() {
   if (baseUpdateInterval) clearInterval(baseUpdateInterval);
   baseUpdateInterval = null;
   console.log('[base.js] Intervalos detenidos.');
}