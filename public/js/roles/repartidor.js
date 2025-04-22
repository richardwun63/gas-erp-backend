// ==================================
// js/roles/repartidor.js
// Lógica específica para el dashboard del Repartidor
// ==================================
console.log('[repartidor.js] Módulo cargado.');

// --- Importaciones ---
import { fetchWithAuth, API_BASE_URL } from '../modules/api.js';
import { getCurrentUser, getSelectedWarehouseId } from '../modules/state.js';
import { showGlobalError, openModal, closeModal } from '../modules/ui.js';
import { formatCurrency, formatStatusTag } from '../modules/utils.js';

// --- Variables del Módulo ---
let assignmentCheckInterval = null; // Intervalo para verificar asignaciones
let assignedOrderTimerInterval = null; // Intervalo para actualizar tiempo asignado
let assignedOrderStartTime = null; // Momento en que se mostró la asignación

// --- Funciones Específicas del Rol ---

/** Verifica periódicamente si hay una nueva entrega asignada */
async function checkRepartidorAssignment() {
    console.log("[repartidor/checkAssignment] Verificando asignación...");
    const statusBannerText = document.getElementById('repartidor-status-text');
    
    try {
        const response = await fetchWithAuth('/deliveries/assigned/me');
        
        if (response.status === 404) { // 404 significa "No hay entrega asignada"
            console.log("[repartidor/checkAssignment] No hay entrega asignada.");
            showWaitingUI();
            if (statusBannerText) statusBannerText.textContent = "Disponible - Esperando Pedido";
            clearAssignedOrderTimer(); // Detener timer si no hay pedido
            assignedOrderStartTime = null;
            return;
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error ${response.status} verificando asignación`);
        }

        const assignedDelivery = await response.json();
        console.log("[repartidor/checkAssignment] Entrega asignada encontrada:", assignedDelivery);
        if (statusBannerText) statusBannerText.textContent = "¡Pedido Asignado!";
        showAssignedUI(assignedDelivery);
        startAssignedOrderTimer(); // Iniciar/reiniciar timer

    } catch (error) {
        console.error("[repartidor/checkAssignment] Error:", error.message);
        if (statusBannerText) statusBannerText.textContent = `Error (${error.message})`;
        showWaitingUI();
        clearAssignedOrderTimer();
        assignedOrderStartTime = null;
    }
}

/** Muestra la UI cuando hay una entrega asignada */
function showAssignedUI(delivery) {
    const assignedDiv = document.getElementById('asignacion-actual');
    const waitingDiv = document.getElementById('sin-asignacion');
    const completeForm = document.getElementById('complete-delivery-form');
    const reportForm = document.getElementById('report-issue-form');
    const startButton = document.getElementById('rep-start-button');

    if (!assignedDiv || !waitingDiv || !completeForm || !reportForm || !startButton) {
        console.error("Elementos UI de repartidor no encontrados para mostrar asignación.");
        return;
    }

    waitingDiv.style.display = 'none';
    assignedDiv.style.display = 'block';
    completeForm.style.display = 'none'; // Ocultar form completar inicialmente
    reportForm.style.display = 'none'; // Ocultar form reporte inicialmente
    startButton.style.display = 'inline-block'; // Mostrar botón iniciar

    // Poblar datos
    const orderIdEl = document.getElementById('rep-order-id');
    const clienteNombreEl = document.getElementById('rep-cliente-nombre');
    const clienteDireccionEl = document.getElementById('rep-cliente-direccion');
    const pedidoDetalleEl = document.getElementById('rep-pedido-detalle');
    const celularSpan = document.getElementById('rep-cliente-celular');
    const celularLink = document.getElementById('rep-cliente-celular-link');
    const instruccionesEl = document.getElementById('rep-instrucciones');
    const completeOrderIdEl = document.getElementById('complete-order-id');
    
    if (orderIdEl) orderIdEl.textContent = delivery.order_id || 'N/A';
    if (clienteNombreEl) clienteNombreEl.textContent = delivery.customer_name || 'N/A';
    if (clienteDireccionEl) clienteDireccionEl.textContent = delivery.delivery_address || 'N/A';
    if (pedidoDetalleEl) pedidoDetalleEl.textContent = delivery.order_summary || 'Ver detalles';
    if (instruccionesEl) instruccionesEl.textContent = delivery.delivery_instructions || 'Ninguna';
    
    if (celularSpan && celularLink) {
        celularSpan.textContent = delivery.customer_phone || 'N/A';
        if (delivery.customer_phone) {
            celularLink.href = `tel:${delivery.customer_phone}`;
            celularLink.style.display = 'inline';
        } else {
            celularLink.href = '#';
            celularLink.style.display = 'none';
        }
    }

    // Resetear forms y botones
    completeForm.reset();
    reportForm.reset();
    const completeErrorDiv = document.getElementById('complete-delivery-error');
    const reportErrorDiv = document.getElementById('report-issue-error');
    if (completeErrorDiv) completeErrorDiv.textContent = '';
    if (reportErrorDiv) reportErrorDiv.textContent = '';
    
    const deliveryHasIssueEl = document.getElementById('delivery-has-issue');
    if (deliveryHasIssueEl) deliveryHasIssueEl.value = 'false'; // Resetear flag de problema
    
    const completeButton = completeForm.querySelector('button[type="submit"]');
    if (completeButton) { 
        completeButton.disabled = false; 
        completeButton.innerHTML = '<i class="fas fa-check-circle"></i> Marcar como Entregado'; 
    }
    
    const issueSubmitButton = reportForm.querySelector('button[type="submit"]');
    if (issueSubmitButton) { 
        issueSubmitButton.disabled = false; 
        issueSubmitButton.innerHTML = 'Enviar Reporte de Problema'; 
    }

    // Configurar ID en el formulario de completar
    if (completeOrderIdEl) completeOrderIdEl.value = delivery.order_id || '';
    
    // Listener para adjuntar imagen (si existe el input)
    const proofInput = document.getElementById('rep-payment-proof');
    const proofPreview = document.getElementById('rep-comprobante-preview');
    if (proofInput && proofPreview) {
        // Clonar para quitar listeners viejos
        const newInput = proofInput.cloneNode(true);
        proofInput.parentNode.replaceChild(newInput, proofInput);
        newInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            proofPreview.style.display = 'none';
            proofPreview.src = '#';
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    proofPreview.src = ev.target.result;
                    proofPreview.style.display = 'block';
                }
                reader.readAsDataURL(file);
            } else if (file) {
                alert("Por favor, selecciona solo archivos de imagen.");
                e.target.value = ''; // Limpiar input
            }
        });
    }
}

/** Muestra la UI cuando no hay entrega asignada */
function showWaitingUI() {
    const assignedDiv = document.getElementById('asignacion-actual');
    const waitingDiv = document.getElementById('sin-asignacion');
    if (assignedDiv) assignedDiv.style.display = 'none';
    if (waitingDiv) waitingDiv.style.display = 'block';
}

/** Carga y muestra la lista de pedidos disponibles para tomar */
async function loadRepartidorPedidosDisponibles() {
    console.log("[repartidor/loadPedidosDisp] Cargando pedidos disponibles...");
    const listDiv = document.getElementById('pedidos-disponibles-list');
    if (!listDiv) return;

    listDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Cargando...</p>';

    try {
        // Asume endpoint GET /orders/pending?status=pending_assignment&warehouseId=...
        const currentWarehouseId = getSelectedWarehouseId(); // Obtener almacén actual
        let endpoint = '/orders/pending?status=pending_assignment';
        
        // Solo agregar el parámetro de almacén si existe uno seleccionado
        if (currentWarehouseId) {
            endpoint += `&warehouseId=${currentWarehouseId}`;
        }
        
        const response = await fetchWithAuth(endpoint);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error ${response.status} cargando pedidos disponibles`);
        }
        
        const pedidos = await response.json();

        if (!pedidos || pedidos.length === 0) {
            listDiv.innerHTML = '<p>No hay pedidos disponibles para tomar en este momento.</p>';
            return;
        }

        listDiv.innerHTML = ''; // Limpiar
        pedidos.forEach(pedido => {
            const item = document.createElement('div');
            item.className = 'list-item'; // Usar clase genérica si existe
            item.innerHTML = `
                <div>
                    <strong>Pedido #${pedido.order_id}</strong><br>
                    <small><i class="fas fa-user"></i> ${pedido.customer_name || 'Cliente Desconocido'}</small><br>
                    <small><i class="fas fa-map-marker-alt"></i> ${pedido.delivery_address_text || 'Dirección no especificada'}</small><br>
                    <small><i class="far fa-clock"></i> ${new Date(pedido.order_date).toLocaleString('es-PE')}</small>
                </div>
                <button class="btn btn-success btn-sm" onclick="window.takeOrder(${pedido.order_id})">
                    <i class="fas fa-motorcycle"></i> Tomar
                </button>
            `;
            listDiv.appendChild(item);
        });

    } catch (error) {
        console.error("[repartidor/loadPedidosDisp] Error:", error);
        listDiv.innerHTML = `<p class="error-message">Error al cargar pedidos: ${error.message}</p>`;
    }
}
// Exponer globalmente si se llama desde onclick
window.loadRepartidorPedidosDisponibles = loadRepartidorPedidosDisponibles;

/** Inicia el temporizador para mostrar cuánto tiempo lleva asignado el pedido */
function startAssignedOrderTimer() {
    if (assignedOrderTimerInterval) clearInterval(assignedOrderTimerInterval); // Limpia intervalo anterior
    assignedOrderStartTime = new Date(); // Guarda el momento actual
    console.log("[repartidor/timer] Iniciando timer de tiempo asignado.");

    const timerSpan = document.getElementById('rep-tiempo-asignado');
    if (!timerSpan) return;

    const updateTimer = () => {
        if (!assignedOrderStartTime) {
            clearInterval(assignedOrderTimerInterval);
            return;
        }
        const now = new Date();
        const diffMinutes = Math.round((now - assignedOrderStartTime) / (1000 * 60));
        timerSpan.textContent = `${diffMinutes} min`;
    };

    updateTimer(); // Ejecutar inmediatamente
    assignedOrderTimerInterval = setInterval(updateTimer, 60000); // Actualizar cada minuto
}

/** Detiene el temporizador de tiempo asignado */
function clearAssignedOrderTimer() {
    if (assignedOrderTimerInterval) {
        console.log("[repartidor/timer] Deteniendo timer de tiempo asignado.");
        clearInterval(assignedOrderTimerInterval);
        assignedOrderTimerInterval = null;
    }
}

/** Acción del repartidor para tomar un pedido disponible */
async function takeOrder(orderId) {
    console.log(`[repartidor/takeOrder] Intentando tomar pedido ID: ${orderId}`);
    if (!confirm(`¿Estás seguro de tomar el pedido #${orderId}? Se te asignará inmediatamente.`)) {
        return;
    }

    try {
        const response = await fetchWithAuth(`/orders/${orderId}/take`, {
            method: 'PUT'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert(`¡Pedido #${orderId} tomado con éxito! Revisa tus asignaciones.`);
        // Forzar re-chequeo inmediato de asignación
        checkRepartidorAssignment();

    } catch (error) {
        console.error(`[repartidor/takeOrder] Error al tomar pedido ${orderId}:`, error);
        showGlobalError(`No se pudo tomar el pedido: ${error.message}`);
    }
}
// Exponer globalmente para onclick
window.takeOrder = takeOrder;

/** Carga el historial de entregas del día del repartidor */
async function loadRepartidorHistorial() {
    console.log("[repartidor/loadHistorial] Cargando historial del día...");
    const tableBody = document.querySelector('#rep-historial-table tbody');
    if (!tableBody) {
        console.error("Tabla de historial repartidor no encontrada.");
        return;
    }

    tableBody.innerHTML = '<tr><td colspan="5"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando historial...</div></td></tr>';

    try {
        // Asume endpoint GET /deliveries/my-daily-history
        const response = await fetchWithAuth('/deliveries/my-daily-history');
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Error al cargar historial diario');
        }
        
        const history = await response.json();

        tableBody.innerHTML = ''; // Limpiar

        if (!history || history.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No has completado entregas hoy.</td></tr>';
            return;
        }

        history.forEach(item => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${item.completed_time || '-'}</td>
                <td>${item.customer_name || 'N/A'}</td>
                <td>${formatStatusTag ? formatStatusTag(item.order_status) : item.order_status || '-'}</td>
                <td>${item.collection_method ? (formatStatusTag ? formatStatusTag(item.collection_method) : item.collection_method) : '-'}</td>
                <td>${item.amount_collected !== null ? (formatCurrency ? formatCurrency(item.amount_collected) : `S/ ${item.amount_collected.toFixed(2)}`) : '-'}</td>
            `;
        });
        console.log("[repartidor/loadHistorial] Historial diario cargado.");

    } catch (error) {
        console.error("[repartidor/loadHistorial] Error:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="error-message">Error al cargar historial: ${error.message}</td></tr>`;
    }
}

/** Carga el resumen del cuadre de caja del día */
async function loadRepartidorCuadreCaja() {
    console.log("[repartidor/loadCuadre] Cargando cuadre de caja...");
    const resumenDiv = document.getElementById('rep-cuadre-resumen');
    if (!resumenDiv) return;

    resumenDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Cargando resumen...</p>';

    try {
        // Asume endpoint GET /reports/reconciliation?repartidorId=me&date=today
        const user = getCurrentUser();
        if (!user) throw new Error("Usuario no disponible");

        const today = new Date().toISOString().split('T')[0];
        const response = await fetchWithAuth(`/reports/reconciliation?repartidorId=${user.id}&date=${today}`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || "Error al cargar resumen de caja");
        }
        
        const results = await response.json();

        if (!results || results.length === 0) {
            resumenDiv.innerHTML = '<p>Aún no hay datos para el cuadre de hoy.</p>';
            return;
        }

        const data = results[0]; // Asume que devuelve un array con un solo elemento para el repartidor
        resumenDiv.innerHTML = `
            <p><strong>Entregas Hoy:</strong> ${data.total_deliveries || 0}</p>
            <p><strong>Cobrado Efectivo:</strong> ${formatCurrency ? formatCurrency(data.cash_collected || 0) : `S/ ${(data.cash_collected || 0).toFixed(2)}`}</p>
            <p><strong>Cobrado Digital:</strong> ${formatCurrency ? formatCurrency(data.digital_collected || 0) : `S/ ${(data.digital_collected || 0).toFixed(2)}`}</p>
            <p><strong>Pendiente de Cobro:</strong> ${formatCurrency ? formatCurrency(data.pending_amount || 0) : `S/ ${(data.pending_amount || 0).toFixed(2)}`} (${data.pending_count || 0} pedidos)</p>
            <hr>
            <p><strong>Total Cobrado/Pendiente:</strong> ${formatCurrency ? formatCurrency((data.cash_collected || 0) + (data.digital_collected || 0) + (data.pending_amount || 0)) : `S/ ${((data.cash_collected || 0) + (data.digital_collected || 0) + (data.pending_amount || 0)).toFixed(2)}`}</p>
        `;
        console.log("[repartidor/loadCuadre] Cuadre cargado.");

    } catch (error) {
        console.error("[repartidor/loadCuadre] Error:", error);
        resumenDiv.innerHTML = `<p class="error-message">Error al cargar cuadre: ${error.message}</p>`;
    }
}

/** Abre modal con detalle del cuadre */
async function viewDetailedCashReport() {
    console.log("[repartidor/viewDetailedCuadre] Viendo detalle cuadre...");
    const user = getCurrentUser();
    if (!user) {
        showGlobalError("No se pudo obtener información del usuario");
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const modalId = 'view-details-modal'; // Reutilizar modal genérico
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    
    if (!modal || !modalContent) {
        showGlobalError("Error: Modal no encontrado");
        return;
    }

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando detalle...</div>';
    openModal(modalId);

    try {
        // Asume endpoint GET /reports/reconciliation/detail?repartidorId=...&date=...
        const response = await fetchWithAuth(`/reports/reconciliation/detail?repartidorId=${user.id}&date=${today}`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || "Error al cargar detalle del cuadre");
        }
        
        const data = await response.json();

        let tableHtml = '<p>No hay entregas registradas hoy.</p>';
        if (data.details && data.details.length > 0) {
            tableHtml = `<div class="table-responsive"><table class="table table-sm">
                <thead><tr><th>Hora</th><th>Pedido</th><th>Cliente</th><th>Método</th><th>Monto</th><th>Notas</th></tr></thead>
                <tbody>`;
            data.details.forEach(d => {
                tableHtml += `<tr>
                    <td>${d.time || '-'}</td>
                    <td>#${d.order_id}</td>
                    <td>${d.custName || 'N/A'}</td>
                    <td>${d.method ? (formatStatusTag ? formatStatusTag(d.method) : d.method) : '-'}</td>
                    <td>${d.amount !== null ? (formatCurrency ? formatCurrency(d.amount) : `S/ ${d.amount.toFixed(2)}`) : '-'}</td>
                    <td style="white-space: normal;">${d.notes || ''} ${d.issue ? '<strong class="text-danger">(Problema)</strong>' : ''}</td>
                </tr>`;
            });
            tableHtml += `</tbody></table></div>`;
        }

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle de Caja - ${today}</h2>
            ${tableHtml}
            <hr>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;

    } catch(error) {
        console.error("[repartidor/viewDetailedCuadre] Error:", error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle de Caja</h2>
            <p class="error-message">Error al cargar detalle: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
// Exponer globalmente para onclick
window.viewDetailedCashReport = viewDetailedCashReport;

/** Marca el inicio de la ruta de entrega */
async function startDelivery() {
    console.log("[repartidor/startDelivery] Marcando inicio de entrega...");
    const orderIdEl = document.getElementById('rep-order-id');
    const startButton = document.getElementById('rep-start-button');
    const completeForm = document.getElementById('complete-delivery-form');
    const statusBannerText = document.getElementById('repartidor-status-text');
    
    if (!orderIdEl || !startButton || !completeForm) {
        showGlobalError("No se encontraron elementos de la UI necesarios");
        return;
    }
    
    const orderId = orderIdEl.textContent;
    if (!orderId || orderId === 'N/A') {
        showGlobalError("No se pudo determinar el ID del pedido");
        return;
    }
    
    startButton.disabled = true;
    startButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando...';

    try {
        // Asume endpoint PUT /deliveries/:orderId/start
        const response = await fetchWithAuth(`/deliveries/${orderId}/start`, {
            method: 'PUT'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        console.log("[repartidor/startDelivery] Entrega iniciada en backend.");
        startButton.style.display = 'none'; // Ocultar botón iniciar
        completeForm.style.display = 'block'; // Mostrar form completar
        if(statusBannerText) statusBannerText.textContent = "En Ruta de Entrega";

    } catch (error) {
        console.error("[repartidor/startDelivery] Error:", error);
        showGlobalError(`No se pudo iniciar la entrega: ${error.message}`);
        startButton.disabled = false;
        startButton.innerHTML = '<i class="fas fa-play-circle"></i> Iniciar Entrega';
    }
}
// Exponer globalmente para onclick
window.startDelivery = startDelivery;

/** Maneja el envío del formulario de completar entrega */
async function completeDelivery(event) {
    event.preventDefault();
    console.log("[repartidor/completeDelivery] Completando entrega...");
    const form = document.getElementById('complete-delivery-form');
    const errorDiv = document.getElementById('complete-delivery-error');
    const submitButton = form.querySelector('button[type="submit"]');
    const orderIdInput = document.getElementById('complete-order-id');

    if (!form || !errorDiv || !submitButton || !orderIdInput) {
        showGlobalError("No se encontraron elementos del formulario necesarios");
        return;
    }

    const orderId = orderIdInput.value;
    if (!orderId) {
        errorDiv.textContent = "Error: No se pudo identificar el pedido.";
        return;
    }

    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';

    const formData = new FormData(form); // Recolecta todos los campos del form

    // Asegurarse de que has_issue no se envíe si no se reportó explícitamente
    if (formData.get('has_issue') !== 'true') {
        formData.delete('has_issue'); // No enviar si es false o no está
    }
    // Si no se adjuntó archivo, eliminarlo del FormData para no enviar campo vacío
    const proofFile = formData.get('paymentProof');
    if (!proofFile || proofFile.size === 0) {
        formData.delete('paymentProof');
    }

    console.log("[repartidor/completeDelivery] Datos a enviar (FormData):", Object.fromEntries(formData));

    try {
        // Asume endpoint POST /deliveries/:orderId/complete
        // Multer en backend espera 'paymentProof' para el archivo
        const response = await fetchWithAuth(`/deliveries/${orderId}/complete`, {
            method: 'POST',
            body: formData // Enviar FormData directamente
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        console.log("[repartidor/completeDelivery] Entrega completada exitosamente.");
        alert("Entrega registrada con éxito.");
        // Limpiar UI y volver a verificar asignaciones
        showWaitingUI(); // Mostrar UI de espera
        clearAssignedOrderTimer();
        checkRepartidorAssignment(); // Verificar si hay otra asignación
        loadRepartidorHistorial(); // Actualizar historial
        loadRepartidorCuadreCaja(); // Actualizar cuadre

    } catch (error) {
        console.error("[repartidor/completeDelivery] Error:", error);
        errorDiv.textContent = `Error al completar: ${error.message}`;
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-check-circle"></i> Marcar como Entregado';
    }
}

/** Muestra el formulario para reportar un problema */
function reportIssue(event) {
    event.preventDefault();
    console.log("[repartidor/reportIssue] Mostrando form de reporte...");
    const completeForm = document.getElementById('complete-delivery-form');
    const reportForm = document.getElementById('report-issue-form');
    const hasIssueInput = document.getElementById('delivery-has-issue');

    if (completeForm && reportForm && hasIssueInput) {
        completeForm.style.display = 'none'; // Ocultar form normal
        reportForm.style.display = 'block'; // Mostrar form de issue
        hasIssueInput.value = 'true'; // Marcar que hay un problema
        // Enfocar en el campo de texto del problema
        const notesInput = document.getElementById('issue-notes');
        if(notesInput) setTimeout(() => notesInput.focus(), 50);
    }
}
// Exponer globalmente para onclick
window.reportIssue = reportIssue;

/** Maneja el envío del formulario de reporte de problema */
async function handleReportIssueSubmit(event) {
    event.preventDefault();
    console.log("[repartidor/handleReportIssue] Enviando reporte de problema...");
    const form = document.getElementById('report-issue-form');
    const errorDiv = document.getElementById('report-issue-error');
    const submitButton = form.querySelector('button[type="submit"]');
    const orderIdInput = document.getElementById('complete-order-id'); // Obtener ID del otro form

    if (!form || !errorDiv || !submitButton || !orderIdInput) {
        showGlobalError("No se encontraron elementos del formulario necesarios");
        return;
    }

    const orderId = orderIdInput.value;
    const issueNotes = document.getElementById('issue-notes')?.value;

    if (!orderId || !issueNotes) {
        errorDiv.textContent = "Error: Describe el problema.";
        return;
    }

    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    const dataToSend = { issue_notes: issueNotes };

    try {
        // Asume endpoint POST /deliveries/:orderId/issue
        const response = await fetchWithAuth(`/deliveries/${orderId}/issue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToSend)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        console.log("[repartidor/handleReportIssue] Reporte enviado.");
        alert("Problema reportado al supervisor.");
        // Limpiar UI y volver a verificar asignaciones (igual que al completar)
        showWaitingUI();
        clearAssignedOrderTimer();
        checkRepartidorAssignment();
        loadRepartidorHistorial();
        loadRepartidorCuadreCaja();

    } catch (error) {
        console.error("[repartidor/handleReportIssue] Error:", error);
        errorDiv.textContent = `Error al reportar: ${error.message}`;
        submitButton.disabled = false;
        submitButton.innerHTML = 'Enviar Reporte de Problema';
    }
}

/** Abre Google Maps (o similar) con la dirección */
function openMap(address) {
    if (!address) return;
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    console.log(`[repartidor/openMap] Abriendo URL: ${mapUrl}`);
    window.open(mapUrl, '_blank', 'noopener,noreferrer');
}
// Exponer globalmente para onclick
window.openMap = openMap;

// --- Maneja el cambio en inputs y muestra/oculta otros campos relacionados ---
function handlePendingCollectionChange() {
    const metodoCobroSelect = document.getElementById('rep-metodo-cobro');
    const scheduleSection = document.getElementById('schedule-collection-section');
    const scheduleCheckbox = document.getElementById('schedule-collection-cb');
    const scheduleTimeInput = document.getElementById('scheduled-collection-time-input');
    
    if (metodoCobroSelect && scheduleSection && scheduleCheckbox && scheduleTimeInput) {
        // Verifica si seleccionó "cobro pendiente"
        const showSchedule = metodoCobroSelect.value === 'cobro_pendiente';
        scheduleSection.style.display = showSchedule ? 'block' : 'none';
        scheduleCheckbox.checked = false;
        scheduleTimeInput.style.display = 'none';
        scheduleTimeInput.value = '';
        scheduleTimeInput.required = false;
    }
}

function handleScheduleCheckboxChange() {
    const scheduleCheckbox = document.getElementById('schedule-collection-cb');
    const scheduleTimeInput = document.getElementById('scheduled-collection-time-input');
    
    if (scheduleCheckbox && scheduleTimeInput) {
        const showTime = scheduleCheckbox.checked;
        scheduleTimeInput.style.display = showTime ? 'block' : 'none';
        scheduleTimeInput.required = showTime;
        if (!showTime) scheduleTimeInput.value = '';
    }
}

// --- Función Principal de Setup ---
export async function setupRepartidorDashboard() {
    console.log('[repartidor.js] Configurando Dashboard Repartidor...');

    // 1. Verificar asignación inicial y cargar historial/cuadre
    try {
        await Promise.all([
            checkRepartidorAssignment(),
            loadRepartidorHistorial(),
            loadRepartidorCuadreCaja()
        ]);
    } catch (error) {
        console.error('[repartidor.js] Error inicial en carga de datos:', error);
        showGlobalError('Error al cargar algunos componentes del dashboard');
    }

    // 2. Iniciar intervalo para verificar nuevas asignaciones (cada 30 segundos)
    if (assignmentCheckInterval) clearInterval(assignmentCheckInterval);
    assignmentCheckInterval = setInterval(checkRepartidorAssignment, 30000);
    console.log('[repartidor.js] Intervalo de chequeo de asignación iniciado.');

    // 3. Adjuntar listeners a formularios
    const completeForm = document.getElementById('complete-delivery-form');
    if (completeForm) {
        completeForm.addEventListener('submit', completeDelivery);
    }

    const reportForm = document.getElementById('report-issue-form');
    if (reportForm) {
        reportForm.addEventListener('submit', handleReportIssueSubmit);
    }

    // Listener para select de método de cobro (para mostrar/ocultar campo de hora)
    const metodoCobroSelect = document.getElementById('rep-metodo-cobro');
    const scheduleCheckbox = document.getElementById('schedule-collection-cb');

    if (metodoCobroSelect) {
        metodoCobroSelect.addEventListener('change', handlePendingCollectionChange);
        // Ejecutar una vez para configuración inicial
        handlePendingCollectionChange();
    }
    
    if (scheduleCheckbox) {
        scheduleCheckbox.addEventListener('change', handleScheduleCheckboxChange);
        // Ejecutar una vez para configuración inicial
        handleScheduleCheckboxChange();
    }

    console.log('[repartidor.js] Dashboard Repartidor configurado.');
}

// Función de limpieza para detener intervalos
export function cleanupRepartidorDashboard() {
   if (assignmentCheckInterval) clearInterval(assignmentCheckInterval);
   if (assignedOrderTimerInterval) clearInterval(assignedOrderTimerInterval);
   assignmentCheckInterval = null;
   assignedOrderTimerInterval = null;
   assignedOrderStartTime = null;
   console.log('[repartidor.js] Limpieza de intervalos completada.');
}