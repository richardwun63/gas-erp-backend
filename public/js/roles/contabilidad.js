// ==================================
// js/roles/contabilidad.js
// Lógica específica para el dashboard de Contabilidad
// ==================================
console.log('[contabilidad.js] Módulo cargado.');

// --- Importaciones ---
import { fetchWithAuth, API_BASE_URL } from '../modules/api.js';
import { getCurrentUser, getSelectedWarehouseId } from '../modules/state.js';
import { showGlobalError, openModal, closeModal, populateWarehouseSelectors } from '../modules/ui.js';
import { formatCurrency, formatStatusTag, displayReportData, filterTable } from '../modules/utils.js';

// --- Variables del Módulo ---
let incomeChart = null; // Referencia al gráfico de Chart.js

// --- Funciones Específicas ---

/** Carga el resumen financiero del día */
async function loadContaResumen() {
    console.log("[conta/loadResumen] Cargando resumen financiero...");
    const kpiContainer = document.getElementById('conta-kpi-resumen');
    const dateSpan = document.getElementById('conta-current-date');
    if (!kpiContainer || !dateSpan) return console.error("Elementos UI resumen no encontrados.");

    kpiContainer.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    const today = new Date();
    dateSpan.textContent = today.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });

    try {
        const response = await fetchWithAuth(`/reports/daily-summary?date=${today.toISOString().split('T')[0]}`);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Error ${response.status}`);
        }
        const summary = await response.json();

        kpiContainer.innerHTML = `
            <div class="kpi-card"><h4><i class="fas fa-receipt"></i> Pedidos Hoy</h4><p>${summary.sales?.total_orders || 0}</p></div>
            <div class="kpi-card"><h4><i class="fas fa-dollar-sign"></i> Ventas Hoy</h4><p class="blue">${formatCurrency(summary.sales?.total_sales)}</p></div>
            <div class="kpi-card"><h4><i class="fas fa-check-circle"></i> Cobrado Hoy</h4><p class="green">${formatCurrency(summary.deliveries?.collected_amount)}</p></div>
            <div class="kpi-card"><h4><i class="fas fa-user-plus"></i> Clientes Nuevos Hoy</h4><p>${summary.new_customers || 0}</p></div>
        `;

        // Cargar datos para el gráfico
        await setupIncomeChart();

    } catch (error) {
        console.error("[conta/loadResumen] Error:", error);
        kpiContainer.innerHTML = `<div class="error-message">Error al cargar resumen: ${error.message}</div>`;
    }
}

/** Configura y muestra el gráfico de ingresos */
async function setupIncomeChart() {
    console.log("[conta/setupIncomeChart] Configurando gráfico...");
    const ctx = document.getElementById('conta-income-chart')?.getContext('2d');
    if (!ctx) return console.error("Canvas 'conta-income-chart' no encontrado.");

    try {
        // Obtener datos de los últimos 7 días
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 6);

        const response = await fetchWithAuth(`/reports/sales?startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`);
        if (!response.ok) throw new Error("Error cargando datos para gráfico");
        const salesData = await response.json();

        // Preparar datos para Chart.js
        const labels = salesData.map(d => new Date(d.order_date + 'T00:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }));
        const dataValues = salesData.map(d => parseFloat(d.total_sales) || 0);

        // Destruir gráfico anterior si existe
        if (incomeChart) {
            incomeChart.destroy();
        }

        // Crear nuevo gráfico
        incomeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ingresos Diarios (S/)',
                    data: dataValues,
                    borderColor: 'rgb(0, 123, 255)',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value, '');
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += formatCurrency(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error('[conta/setupIncomeChart] Error:', error);
        if (ctx) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.font = "14px Arial";
            ctx.fillStyle = "red";
            ctx.textAlign = "center";
            ctx.fillText("Error al cargar gráfico", ctx.canvas.width/2, ctx.canvas.height/2);
        }
    }
}

/** Busca un pedido para asociarle un recibo */
async function findOrderForReceipt() {
    console.log("[conta/findOrderReceipt] Buscando pedido...");
    const input = document.getElementById('conta-search-order-input');
    const resultDiv = document.getElementById('conta-pedido-encontrado-recibo');
    const errorDiv = document.getElementById('conta-upload-status');
    const orderIdSpan = document.getElementById('receipt-order-id');
    const customerNameSpan = document.getElementById('receipt-customer-name');
    const customerDocSpan = document.getElementById('receipt-customer-doc');
    const orderDateSpan = document.getElementById('receipt-order-date');
    const orderAmountSpan = document.getElementById('receipt-order-amount');
    const fileInput = document.getElementById('receipt-file-input');

    if (!input || !resultDiv || !errorDiv || !orderIdSpan || !customerNameSpan || 
        !customerDocSpan || !orderDateSpan || !orderAmountSpan || !fileInput) {
        return console.error("Elementos UI para buscar/adjuntar recibo no encontrados.");
    }

    const searchTerm = input.value.trim();
    resultDiv.style.display = 'none';
    errorDiv.textContent = '';
    errorDiv.className = 'status-message';
    fileInput.value = '';

    if (!searchTerm) {
        errorDiv.textContent = 'Ingresa un término de búsqueda (ID Pedido, Nombre, DNI/RUC).';
        errorDiv.className = 'status-message error';
        return;
    }

    errorDiv.textContent = 'Buscando...';
    errorDiv.className = 'status-message info';

    try {
        const response = await fetchWithAuth(`/orders/search-for-receipt?term=${encodeURIComponent(searchTerm)}`);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || `Error ${response.status}`);
        }

        // Mostrar datos del pedido encontrado
        orderIdSpan.textContent = result.order_id;
        customerNameSpan.textContent = result.customer_name || 'N/A';
        customerDocSpan.textContent = result.dni_ruc || 'N/A';
        
        // Formatear fecha
        orderDateSpan.textContent = result.order_date ? 
            new Date(result.order_date+'T00:00:00').toLocaleDateString('es-PE') : 'N/A';
        
        orderAmountSpan.textContent = formatCurrency(result.total_amount, 'N/A');
        resultDiv.style.display = 'block';
        errorDiv.textContent = '';

    } catch (error) {
        console.error("[conta/findOrderReceipt] Error:", error);
        errorDiv.textContent = `Error buscando pedido: ${error.message}`;
        errorDiv.className = 'status-message error';
        resultDiv.style.display = 'none';
    }
}

/** Sube el archivo PDF del recibo y lo asocia al pedido */
async function uploadReceiptFile() {
    console.log("[conta/uploadReceipt] Subiendo archivo PDF...");
    const orderId = document.getElementById('receipt-order-id')?.textContent;
    const fileInput = document.getElementById('receipt-file-input');
    const statusDiv = document.getElementById('conta-upload-status');
    const resultDiv = document.getElementById('conta-pedido-encontrado-recibo');
    const uploadBtn = document.getElementById('upload-receipt-btn');

    if (!orderId || !fileInput || !statusDiv || !resultDiv || !uploadBtn) {
        return console.error("Elementos para subir recibo no encontrados.");
    }

    const file = fileInput.files[0];
    if (!file) {
        statusDiv.textContent = 'Error: Selecciona un archivo PDF.';
        statusDiv.className = 'status-message error';
        return;
    }

    // Validar que sea PDF
    if (file.type !== 'application/pdf') {
        statusDiv.textContent = 'Error: Solo se permiten archivos PDF.';
        statusDiv.className = 'status-message error';
        return;
    }
    
    // Validar tamaño (5MB)
    if (file.size > 5 * 1024 * 1024) {
        statusDiv.textContent = 'Error: El archivo PDF es muy grande (máx 5MB).';
        statusDiv.className = 'status-message error';
        return;
    }

    statusDiv.textContent = 'Subiendo y asociando archivo...';
    statusDiv.className = 'status-message info';
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';

    const formData = new FormData();
    formData.append('receiptFile', file);

    try {
        const response = await fetchWithAuth(`/payments/receipt/${orderId}`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || `Error ${response.status}`);

        statusDiv.textContent = 'Recibo/Factura subido y asociado con éxito.';
        statusDiv.className = 'status-message success';
        fileInput.value = '';
        resultDiv.style.display = 'none';
        
        // Recargar lista de recibos subidos
        loadContaRecibosSubidos();

    } catch (error) {
        console.error("[conta/uploadReceipt] Error:", error);
        statusDiv.textContent = `Error al subir: ${error.message}`;
        statusDiv.className = 'status-message error';
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Subir y Asociar';
    }
}

/** Carga la lista de recibos subidos recientemente */
async function loadContaRecibosSubidos() {
    console.log("[conta/loadRecibosSubidos] Cargando...");
    const tableBody = document.getElementById('conta-recibos-subidos-table')?.querySelector('tbody');
    if (!tableBody) return console.error("Tabla de recibos subidos no encontrada.");

    tableBody.innerHTML = '<tr><td colspan="4"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';

    try {
        const response = await fetchWithAuth('/payments/receipts');
        if (!response.ok) throw new Error("Error al cargar recibos subidos");
        const recibos = await response.json();

        tableBody.innerHTML = '';

        if (recibos.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay recibos subidos recientemente.</td></tr>';
            return;
        }

        recibos.forEach(recibo => {
            const uploadDate = recibo.upload_date ? 
                new Date(recibo.upload_date).toLocaleString('es-PE') : 'N/A';
                
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>#${recibo.order_id}</td>
                <td>${recibo.customer_name || 'N/A'}</td>
                <td>${uploadDate}</td>
                <td>
                    <a href="${API_BASE_URL.replace('/api', '')}${recibo.receipt_url}" target="_blank" 
                       class="btn btn-secondary btn-sm" title="Ver PDF">
                        <i class="fas fa-file-pdf"></i> Ver
                    </a>
                </td>
            `;
        });

    } catch (error) {
        console.error("[conta/loadRecibosSubidos] Error:", error);
        tableBody.innerHTML = `<tr><td colspan="4"><div class="error-message">Error: ${error.message}</div></td></tr>`;
    }
}

/** Carga la lista de pagos pendientes de verificación */
async function loadContaPagosVerificar() {
    console.log("[conta/loadPagosVerificar] Cargando...");
    const tableBody = document.getElementById('conta-pagos-verificar-table')?.querySelector('tbody');
    if (!tableBody) return console.error("Tabla pagos por verificar no encontrada.");

    tableBody.innerHTML = '<tr><td colspan="8"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';

    try {
        const response = await fetchWithAuth('/payments/pending-verification');
        if (!response.ok) throw new Error("Error al cargar pagos pendientes");
        const pagos = await response.json();

        tableBody.innerHTML = '';

        if (pagos.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay pagos pendientes de verificación.</td></tr>';
            return;
        }

        pagos.forEach(pago => {
            const reportDate = pago.payment_date ? 
                new Date(pago.payment_date).toLocaleString('es-PE') : 'N/A';
                
            const proofUrl = pago.payment_proof_url_customer || pago.payment_proof_url;
            
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>#${pago.payment_id}</td>
                <td>#${pago.order_id}</td>
                <td>${pago.customer_name || 'N/A'}</td>
                <td>${formatCurrency(pago.amount)}</td>
                <td>${formatStatusTag(pago.payment_method)}</td>
                <td>${reportDate}</td>
                <td>
                    ${proofUrl ? `
                        <a href="${API_BASE_URL.replace('/api', '')}${proofUrl}" target="_blank" title="Ver Comprobante">
                            <img src="${API_BASE_URL.replace('/api', '')}${proofUrl}" alt="Miniatura" 
                                 style="max-height: 30px; max-width: 40px; vertical-align: middle;">
                            <i class="fas fa-external-link-alt"></i>
                        </a>` : 'No adjunto'}
                </td>
                <td>
                    <button class="btn btn-success btn-sm" title="Aprobar Pago" 
                            onclick="window.verifyPayment(${pago.payment_id}, true)">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" title="Rechazar Pago" 
                            onclick="window.verifyPayment(${pago.payment_id}, false)">
                        <i class="fas fa-times"></i>
                    </button>
                    <button class="btn btn-info btn-sm" title="Ver Pedido" 
                            onclick="window.viewOrderDetails(${pago.order_id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            `;
        });

    } catch (error) {
        console.error("[conta/loadPagosVerificar] Error:", error);
        tableBody.innerHTML = `<tr><td colspan="8"><div class="error-message">Error: ${error.message}</div></td></tr>`;
    }
}

/** Verifica o rechaza un pago */
async function verifyPayment(paymentId, approve) {
    const action = approve ? 'aprobar' : 'rechazar';
    console.log(`[conta/verifyPayment] Intentando ${action} pago ID: ${paymentId}`);
    
    if (!confirm(`¿Estás seguro de ${action} el pago #${paymentId}?`)) {
        return;
    }

    try {
        const response = await fetchWithAuth(`/payments/${paymentId}/verify`, {
            method: 'PUT',
            body: JSON.stringify({ approved: approve })
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || `Error ${response.status}`);

        alert(`Pago #${paymentId} ${action === 'aprobar' ? 'aprobado' : 'rechazado'} con éxito.`);
        loadContaPagosVerificar(); // Recargar lista

    } catch (error) {
        console.error(`[conta/verifyPayment] Error al ${action} pago ${paymentId}:`, error);
        showGlobalError(`Error al ${action} el pago: ${error.message}`);
    }
}
// Exponer globalmente para onclick
window.verifyPayment = verifyPayment;

/** Carga la lista de clientes morosos */
async function loadContaMorosos() {
    console.log("[conta/loadMorosos] Cargando...");
    const tableBody = document.getElementById('conta-morosos-table')?.querySelector('tbody');
    if (!tableBody) return console.error("Tabla morosos no encontrada.");

    tableBody.innerHTML = '<tr><td colspan="6"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';

    try {
        const response = await fetchWithAuth('/reports/morosos');
        if (!response.ok) throw new Error("Error al cargar reporte de morosos");
        const morosos = await response.json();

        tableBody.innerHTML = '';

        if (morosos.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay clientes morosos actualmente.</td></tr>';
            return;
        }

        // Agrupar por cliente
        const grouped = morosos.reduce((acc, curr) => {
            const key = curr.customer_name || 'Desconocido';
            if (!acc[key]) {
                acc[key] = {
                    name: key,
                    phone: curr.customer_phone || 'N/A',
                    orders: [],
                    total_amount: 0,
                    max_days: 0,
                    customer_id: curr.customer_user_id
                };
            }
            acc[key].orders.push(curr.order_id);
            acc[key].total_amount += parseFloat(curr.total_amount) || 0;
            acc[key].max_days = Math.max(acc[key].max_days, curr.days_overdue || 0);
            return acc;
        }, {});

        Object.values(grouped).forEach(cliente => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${cliente.name}</td>
                <td>${cliente.phone ? `<a href="tel:${cliente.phone}">${cliente.phone}</a>` : 'N/A'}</td>
                <td>${cliente.orders.map(id => `#${id}`).join(', ')}</td>
                <td>${formatCurrency(cliente.total_amount)}</td>
                <td>${cliente.max_days} días</td>
                <td>
                    <button class="btn btn-warning btn-sm" title="Contactar Cliente" 
                            onclick="window.contactMoroso('${cliente.phone}', ${cliente.customer_id})">
                        <i class="fas fa-phone-alt"></i> Contactar
                    </button>
                    <button class="btn btn-info btn-sm" title="Ver Cliente" 
                            onclick="window.viewClientDetails(${cliente.customer_id})">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                </td>
            `;
        });

    } catch (error) {
        console.error("[conta/loadMorosos] Error:", error);
        tableBody.innerHTML = `<tr><td colspan="6"><div class="error-message">Error: ${error.message}</div></td></tr>`;
    }
}

/** Contactar a cliente moroso */
function contactMoroso(phone, customerId) {
    console.log(`[conta/contactMoroso] Contactando moroso ID: ${customerId} - Teléfono: ${phone}`);
    
    if (phone && phone !== 'N/A') {
        window.location.href = `tel:${phone}`;
    } else {
        // Obtener información de contacto alternativa
        viewClientDetails(customerId);
        alert("El cliente no tiene número telefónico registrado. Verifica sus datos de contacto.");
    }
}
window.contactMoroso = contactMoroso;

/** Ver detalles del cliente */
async function viewClientDetails(userId) {
    console.log(`[conta/viewClientDetails] Viendo cliente ID: ${userId}`);
    const modalId = 'view-details-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    
    if (!modal || !modalContent) return alert("Error: Modal no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando detalle...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth(`/customers/${userId}`);
        if (!response.ok) throw new Error("Error al cargar detalles del cliente");
        const cust = await response.json();

        const lastPurchase = cust.details?.last_purchase_date ? 
            new Date(cust.details.last_purchase_date).toLocaleDateString('es-PE') : 'N/A';
            
        const birthDate = cust.details?.birth_date ? 
            new Date(cust.details.birth_date+'T00:00:00').toLocaleDateString('es-PE') : 'N/A';

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
                <div style="grid-column: 1 / -1;"><strong>Dirección:</strong> ${cust.details?.address_text || '-'}</div>
            </div>
            <hr>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;

    } catch (error) {
        console.error(`[conta/viewClientDetails] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle Cliente</h2>
            <p class="error-message">Error al cargar detalles: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.viewClientDetails = viewClientDetails;

/** Ver detalles del pedido */
async function viewOrderDetails(orderId) {
    console.log(`[conta/viewOrderDetails] Viendo pedido ID: ${orderId}`);
    const modalId = 'view-details-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    
    if (!modal || !modalContent) return alert("Error: Modal no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando detalle...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth(`/orders/${orderId}`);
        if (!response.ok) throw new Error("Error al cargar detalles del pedido");
        const order = await response.json();

        // Formatear fecha
        const orderDate = order.order_date ? 
            new Date(order.order_date).toLocaleString('es-PE') : 'N/A';

        // Construir tabla de items
        let itemsHtml = '<table class="table table-sm"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>';
        
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                itemsHtml += `<tr>
                    <td>${item.name || 'Producto'} ${item.action_type ? `(${item.action_type})` : ''}</td>
                    <td>${item.quantity}</td>
                    <td>${formatCurrency(item.unit_price)}</td>
                    <td>${formatCurrency(item.item_subtotal)}</td>
                </tr>`;
            });
        } else {
            itemsHtml += '<tr><td colspan="4" style="text-align:center;">No hay detalles de items</td></tr>';
        }
        
        itemsHtml += '</tbody></table>';

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle Pedido #${orderId}</h2>
            <div class="grid-container-responsive">
                <div><strong>Cliente:</strong> ${order.customer_name || 'N/A'}</div>
                <div><strong>Fecha:</strong> ${orderDate}</div>
                <div><strong>Estado:</strong> ${formatStatusTag(order.order_status)}</div>
                <div><strong>Pago:</strong> ${formatStatusTag(order.payment_status)}</div>
                <div style="grid-column: 1 / -1;"><strong>Dirección Entrega:</strong> ${order.delivery_address_text || '-'}</div>
            </div>
            <hr>
            <h4>Detalle de Items</h4>
            ${itemsHtml}
            <div style="text-align: right; margin-top: 10px;">
                <p><strong>Subtotal:</strong> ${formatCurrency(order.subtotal_amount)}</p>
                <p><strong>Descuento:</strong> ${formatCurrency(order.discount_amount)}</p>
                <p><strong>Total:</strong> ${formatCurrency(order.total_amount)}</p>
            </div>
            <hr>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;

    } catch (error) {
        console.error(`[conta/viewOrderDetails] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle Pedido</h2>
            <p class="error-message">Error al cargar detalles: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.viewOrderDetails = viewOrderDetails;

/** Carga el detalle de inventario para el almacén seleccionado */
async function loadContaInventarioDetalle() {
    const warehouseId = document.getElementById('conta-inventario-warehouse-select')?.value;
    console.log(`[conta/loadInventario] Cargando inventario para Almacén ID: ${warehouseId}`);
    
    const tableBody = document.getElementById('conta-inventario-detalle-table')?.querySelector('tbody');
    const tableFoot = document.getElementById('conta-inventario-detalle-table')?.querySelector('tfoot');
    const totalBalonesTd = document.getElementById('conta-total-balones');
    const logTableBody = document.getElementById('conta-inventory-log-table')?.querySelector('tbody');

    if (!tableBody || !tableFoot || !totalBalonesTd || !logTableBody) {
        return console.error("Elementos UI de inventario no encontrados.");
    }

    tableBody.innerHTML = '<tr><td colspan="4"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';
    logTableBody.innerHTML = '<tr><td colspan="6"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';
    tableFoot.style.display = 'none';
    totalBalonesTd.textContent = '0';

    if (!warehouseId) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Seleccione un almacén para ver el inventario.</td></tr>';
        logTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Seleccione un almacén para ver el log.</td></tr>';
        return;
    }

    try {
        // Obtener stock detallado
        const stockResponse = await fetchWithAuth(`/inventory/stock?warehouseId=${warehouseId}`);
        if (!stockResponse.ok) throw new Error("Error al cargar stock");
        const stockData = await stockResponse.json();

        tableBody.innerHTML = '';
        let totalPhysicalCylinders = 0;

        if (stockData.cylinders && stockData.cylinders.length > 0) {
            stockData.cylinders.forEach(cyl => {
                const totalItem = (cyl.full_qty || 0) + (cyl.empty_qty || 0) + (cyl.damaged_qty || 0);
                totalPhysicalCylinders += totalItem;

                if (cyl.full_qty > 0) {
                    const row = tableBody.insertRow();
                    row.innerHTML = `<td>Balón</td><td>${cyl.name}</td><td>Lleno</td><td>${cyl.full_qty}</td>`;
                }
                if (cyl.empty_qty > 0) {
                    const row = tableBody.insertRow();
                    row.innerHTML = `<td>Balón</td><td>${cyl.name}</td><td>Vacío</td><td>${cyl.empty_qty}</td>`;
                }
                if (cyl.damaged_qty > 0) {
                    const row = tableBody.insertRow();
                    row.innerHTML = `<td>Balón</td><td>${cyl.name}</td><td><span class="text-danger">Dañado</span></td><td>${cyl.damaged_qty}</td>`;
                }
            });
        }
        
        if (stockData.otherProducts && stockData.otherProducts.length > 0) {
            stockData.otherProducts.forEach(prod => {
                if (prod.stock_qty > 0) {
                    const row = tableBody.insertRow();
                    row.innerHTML = `<td>Otro Producto</td><td>${prod.name}</td><td>Disponible</td><td>${prod.stock_qty} ${prod.unit || ''}</td>`;
                }
            });
        }
        
        if (tableBody.children.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay stock registrado.</td></tr>';
        }

        // Mostrar total balones
        totalBalonesTd.textContent = totalPhysicalCylinders;
        tableFoot.style.display = '';

        // Obtener log de movimientos
        const logResponse = await fetchWithAuth(`/inventory/log?warehouseId=${warehouseId}&limit=50`);
        if (!logResponse.ok) throw new Error("Error al cargar log de inventario");
        const logs = await logResponse.json();

        logTableBody.innerHTML = '';

        if (!logs.log_entries || logs.log_entries.length === 0) {
            logTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay movimientos recientes.</td></tr>';
        } else {
            logs.log_entries.forEach(log => {
                const logDate = log.log_timestamp ? 
                    new Date(log.log_timestamp).toLocaleString('es-PE') : 'N/A';
                    
                const quantityText = `${log.quantity_change > 0 ? '+' : ''}${log.quantity_change}`;
                const quantityClass = log.quantity_change > 0 ? 'text-success' : 'text-danger';
                
                const row = logTableBody.insertRow();
                row.innerHTML = `
                    <td>${logDate}</td>
                    <td>${log.item_name || `${log.item_type} ID ${log.item_id}`}</td>
                    <td class="${quantityClass}">${quantityText} (${log.status_changed_to || 'N/A'})</td>
                    <td>${log.transaction_type || 'N/A'}</td>
                    <td>${log.user_name || 'Sistema'}</td>
                    <td style="white-space: normal;">${log.notes || ''} ${log.related_order_id ? `(Pedido #${log.related_order_id})`: ''}</td>
                `;
            });
        }

    } catch (error) {
        console.error("[conta/loadInventario] Error:", error);
        tableBody.innerHTML = `<tr><td colspan="4" class="error-message">Error: ${error.message}</td></tr>`;
        logTableBody.innerHTML = `<tr><td colspan="6" class="error-message">Error: ${error.message}</td></tr>`;
        tableFoot.style.display = 'none';
    }
}
window.loadContaInventarioDetalle = loadContaInventarioDetalle;

/** Carga los cuadres de caja de repartidores para una fecha */
async function loadContaCuadresRepartidores() {
    const dateInput = document.getElementById('conta-cuadre-date');
    const tableBody = document.getElementById('conta-cuadres-table')?.querySelector('tbody');
    
    if (!dateInput || !tableBody) return console.error("Elementos UI cuadres no encontrados.");

    // Usar fecha actual si no hay una seleccionada
    const selectedDate = dateInput.value || new Date().toISOString().split('T')[0];
    dateInput.value = selectedDate;

    console.log(`[conta/loadCuadres] Cargando cuadres para fecha: ${selectedDate}`);
    tableBody.innerHTML = '<tr><td colspan="7"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';

    try {
        const response = await fetchWithAuth(`/reports/reconciliation?date=${selectedDate}`);
        if (!response.ok) throw new Error("Error al cargar cuadres de caja");
        const cuadres = await response.json();

        tableBody.innerHTML = '';

        if (cuadres.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No hay cuadres registrados para ${selectedDate}.</td></tr>`;
            return;
        }

        cuadres.forEach(c => {
            const totalEsperado = (c.cash_collected || 0) + (c.digital_collected || 0) + (c.pending_amount || 0);
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${c.repartidor_name || 'N/A'}</td>
                <td>${c.total_deliveries || 0}</td>
                <td>${formatCurrency(c.cash_collected)}</td>
                <td>${formatCurrency(c.digital_collected)}</td>
                <td>${formatCurrency(c.pending_amount)} (${c.pending_count || 0})</td>
                <td>${formatCurrency(totalEsperado)}</td>
                <td>
                    <button class="btn btn-info btn-sm" title="Ver Detalle Entrega" 
                            onclick="window.viewCuadreDetail(${c.repartidor_id}, '${selectedDate}')">
                        <i class="fas fa-list-alt"></i> Detalle
                    </button>
                </td>
            `;
        });

    } catch (error) {
        console.error("[conta/loadCuadres] Error:", error);
        tableBody.innerHTML = `<tr><td colspan="7" class="error-message">Error: ${error.message}</td></tr>`;
    }
}
window.loadContaCuadresRepartidores = loadContaCuadresRepartidores;

/** Muestra el detalle de entregas para el cuadre de un repartidor */
async function viewCuadreDetail(repartidorId, date) {
    console.log(`[conta/viewCuadreDetail] Viendo detalle cuadre Rep ID: ${repartidorId}, Fecha: ${date}`);
    const modalId = 'view-details-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    
    if (!modal || !modalContent) return alert("Error: Modal no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando detalle...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth(`/reports/reconciliation/detail?repartidorId=${repartidorId}&date=${date}`);
        if (!response.ok) throw new Error("Error al cargar detalle del cuadre");
        const data = await response.json();
        
        const repartidorName = data.details?.[0]?.repartidor_name || `Repartidor ID ${repartidorId}`;

        let tableHtml = '<p>No hay entregas registradas.</p>';
        if (data.details && data.details.length > 0) {
            tableHtml = `<div class="table-responsive"><table class="table table-sm">
                <thead><tr><th>Hora</th><th>Pedido</th><th>Cliente</th><th>Método</th><th>Monto</th><th>Notas</th></tr></thead>
                <tbody>`;
                
            data.details.forEach(d => {
                tableHtml += `<tr>
                    <td>${d.time || '-'}</td>
                    <td>#${d.order_id}</td>
                    <td>${d.custName || 'N/A'}</td>
                    <td>${d.method ? formatStatusTag(d.method) : '-'}</td>
                    <td>${d.amount !== null ? formatCurrency(d.amount) : '-'}</td>
                    <td style="white-space: normal;">${d.notes || ''} ${d.issue ? '<strong class="text-danger">(Problema)</strong>' : ''}</td>
                </tr>`;
            });
            
            tableHtml += `</tbody></table></div>`;
        }

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle Cuadre - ${repartidorName} (${date})</h2>
            ${tableHtml}
            <hr>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
            <button type="button" class="btn btn-primary" onclick="window.downloadCuadreDetailPDF(${repartidorId}, '${date}')">
                <i class="fas fa-download"></i> Exportar PDF
            </button>
        `;

    } catch(error) {
        console.error("[conta/viewCuadreDetail] Error:", error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle Cuadre</h2>
            <p class="error-message">Error al cargar detalle: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.viewCuadreDetail = viewCuadreDetail;

/** Exporta el detalle de cuadre a PDF */
function downloadCuadreDetailPDF(repartidorId, date) {
    console.log(`[conta/downloadCuadreDetail] Exportando PDF para Rep ID: ${repartidorId}, Fecha: ${date}`);
    
    // Usar biblioteca jsPDF para generar PDF del contenido actual del modal
    try {
        const modalContent = document.getElementById('view-details-modal')?.querySelector('.modal-content');
        if (!modalContent) throw new Error("Contenido del modal no encontrado");
        
        // Simulación de exportación (se podría implementar con jsPDF u otra biblioteca)
        alert(`La exportación a PDF del cuadre del repartidor está en proceso de implementación. Los datos están disponibles en pantalla.`);
        
        // Implementación real requeriría:
        // 1. Obtener datos mediante fetchWithAuth
        // 2. Formatear con jsPDF (encabezado, tabla, totales)
        // 3. Generar y descargar el archivo
    } catch (error) {
        console.error("[conta/downloadCuadreDetail] Error:", error);
        alert(`Error al intentar exportar PDF: ${error.message}`);
    }
}
window.downloadCuadreDetailPDF = downloadCuadreDetailPDF;

/** Genera y muestra un reporte contable */
async function generateReport() {
    console.log("[conta/generateReport] Generando reporte...");
    const reportTypeSelect = document.getElementById('report-type');
    const startDateInput = document.getElementById('report-start-date');
    const endDateInput = document.getElementById('report-end-date');
    const repartidorFilterSelect = document.getElementById('report-repartidor-id');
    const outputDiv = document.getElementById('report-output');
    const contentDiv = document.getElementById('report-content');
    const generateBtn = document.getElementById('generate-report-btn');
    const downloadBtn = document.getElementById('download-report-btn');

    if (!reportTypeSelect || !startDateInput || !endDateInput || !outputDiv || 
        !contentDiv || !generateBtn || !downloadBtn) {
        return console.error("Elementos UI de reportes no encontrados.");
    }

    const reportType = reportTypeSelect.value;
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const repartidorId = repartidorFilterSelect?.value || '';

    if (!reportType || !startDate || !endDate) {
        alert("Selecciona el tipo de reporte y las fechas.");
        return;
    }

    // Mostrar/ocultar filtro de repartidor según tipo de reporte
    const repartidorFilterDiv = document.getElementById('report-repartidor-filter');
    if (repartidorFilterDiv) {
        repartidorFilterDiv.style.display = (reportType === 'reconciliation') ? 'block' : 'none';
    }

    outputDiv.style.display = 'block';
    contentDiv.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Generando reporte...</div>';
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    downloadBtn.style.display = 'block';

    try {
        let endpoint = '';
        let params = `?startDate=${startDate}&endDate=${endDate}`;
        let reportTitle = reportTypeSelect.options[reportTypeSelect.selectedIndex].text;

        switch (reportType) {
            case 'sales':
                endpoint = '/reports/sales';
                break;
            case 'reconciliation':
                endpoint = '/reports/reconciliation';
                params += `&date=${endDate}`;
                if (repartidorId) params += `&repartidorId=${repartidorId}`;
                reportTitle = `Conciliación de Caja (${endDate})`;
                if(repartidorId) reportTitle += ` - Rep. ID ${repartidorId}`;
                break;
            case 'overdue':
                endpoint = '/reports/morosos';
                reportTitle = `Clientes Morosos (hasta ${endDate})`;
                break;
            case 'stock_levels':
                endpoint = '/reports/stock-levels';
                reportTitle = `Niveles de Stock (al ${endDate})`;
                break;
            case 'points_usage':
                endpoint = '/reports/points-usage';
                break;
            default:
                throw new Error("Tipo de reporte no válido.");
        }

        const response = await fetchWithAuth(endpoint + params);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error ${response.status} al generar reporte`);
        }
        
        const reportData = await response.json();

        // Usar displayReportData de utils.js para mostrar la tabla
        displayReportData(contentDiv, reportData, reportTitle, true);

    } catch (error) {
        console.error("[conta/generateReport] Error:", error);
        contentDiv.innerHTML = `<p class="error-message">Error al generar reporte: ${error.message}</p>`;
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-cogs"></i> Generar Reporte';
    }
}
window.generateReport = generateReport;

/** Descarga el reporte actual en formato CSV */
function downloadReport() {
    console.log("[conta/downloadReport] Descargando reporte...");
    
    try {
        const reportTitle = document.getElementById('report-title')?.textContent || 'Reporte';
        const contentDiv = document.getElementById('report-content');
        
        if (!contentDiv) throw new Error("Contenido del reporte no encontrado");
        
        // Obtener tabla del reporte
        const table = contentDiv.querySelector('table');
        if (!table) throw new Error("Tabla de datos no encontrada");
        
        // Convertir tabla HTML a CSV
        let csv = [];
        const rows = table.querySelectorAll('tr');
        
        rows.forEach(row => {
            const rowData = [];
            row.querySelectorAll('th, td').forEach(cell => {
                // Limpiar texto (quitar etiquetas HTML, comillas)
                let text = cell.textContent.replace(/"/g, '""');
                rowData.push(`"${text}"`);
            });
            csv.push(rowData.join(','));
        });
        
        // Unir filas con saltos de línea
        const csvContent = csv.join('\n');
        
        // Crear blob y descargar
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${reportTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert("Reporte descargado exitosamente en formato CSV.");
        
    } catch (error) {
        console.error("[conta/downloadReport] Error:", error);
        alert(`Error al descargar el reporte: ${error.message}`);
    }
}
window.downloadReport = downloadReport;

/** Carga datos específicos de una pestaña */
async function loadTabData(tabName) {
    console.log(`[conta/loadTabData] Cargando datos para tab: ${tabName}`);
    
    // Verificar si la pestaña está activa
    const tabContent = document.getElementById(tabName);
    if (!tabContent || !tabContent.classList.contains('active')) {
        console.log(`[conta/loadTabData] Tab ${tabName} no está activa, omitiendo carga.`);
        return;
    }

    switch (tabName) {
        case 'conta-resumen':
            await loadContaResumen();
            break;
            
        case 'conta-recibos':
            await loadContaRecibosSubidos();
            break;
            
        case 'conta-pagos':
            await loadContaPagosVerificar();
            break;
            
        case 'conta-morosos':
            await loadContaMorosos();
            break;
            
        case 'conta-inventario':
            // Poblar selector de almacén
            const whSelect = document.getElementById('conta-inventario-warehouse-select');
            if(whSelect) populateWarehouseSelectors(whSelect.parentElement);
            await loadContaInventarioDetalle();
            break;
            
        case 'conta-cuadres':
            // Establecer fecha actual por defecto
            const dateInput = document.getElementById('conta-cuadre-date');
            if (dateInput && !dateInput.value) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
            await loadContaCuadresRepartidores();
            break;
            
        case 'conta-reportes':
            // Cargar lista de repartidores para el filtro
            const repFilter = document.getElementById('report-repartidor-id');
            if (repFilter && repFilter.options.length <= 1) {
                try {
                    const resp = await fetchWithAuth('/users?role=repartidor&active=true');
                    if(resp.ok) {
                        const repartidores = await resp.json();
                        repartidores.forEach(r => {
                            repFilter.add(new Option(r.full_name, r.user_id));
                        });
                    }
                } catch(e) { 
                    console.error("Error cargando filtro repartidores", e);
                }
            }
            
            // Establecer fechas predeterminadas
            const startDateInput = document.getElementById('report-start-date');
            const endDateInput = document.getElementById('report-end-date');
            
            if (startDateInput && !startDateInput.value) {
                const aWeekAgo = new Date();
                aWeekAgo.setDate(aWeekAgo.getDate() - 7);
                startDateInput.value = aWeekAgo.toISOString().split('T')[0];
            }
            
            if (endDateInput && !endDateInput.value) {
                endDateInput.value = new Date().toISOString().split('T')[0];
            }
            break;
    }
}
window.loadTabData = loadTabData;

/** Función de recarga para cambio de almacén */
export function reloadContaInventario() {
    // Solo recarga si la pestaña de inventario está activa
    if (document.getElementById('conta-inventario')?.classList.contains('active')) {
        console.log("[contabilidad.js] Recargando Inventario por cambio de almacén...");
        loadContaInventarioDetalle();
    }
}

// --- Función Principal de Setup ---
export async function setupContabilidadDashboard() {
    console.log('[contabilidad.js] Configurando Dashboard Contabilidad...');

    // 1. Adjuntar listeners a elementos estáticos
    const findOrderBtn = document.getElementById('find-order-receipt-btn');
    if (findOrderBtn) findOrderBtn.addEventListener('click', findOrderForReceipt);

    const uploadReceiptBtn = document.getElementById('upload-receipt-btn');
    if (uploadReceiptBtn) uploadReceiptBtn.addEventListener('click', uploadReceiptFile);

    const generateReportBtn = document.getElementById('generate-report-btn');
    if (generateReportBtn) generateReportBtn.addEventListener('click', generateReport);

    const downloadReportBtn = document.getElementById('download-report-btn');
    if (downloadReportBtn) downloadReportBtn.addEventListener('click', downloadReport);

    const searchOrderInput = document.getElementById('conta-search-order-input');
    if(searchOrderInput) {
        searchOrderInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') findOrderForReceipt(); 
        });
    }

    const cuadreDateInput = document.getElementById('conta-cuadre-date');
    if (cuadreDateInput) cuadreDateInput.addEventListener('change', loadContaCuadresRepartidores);

    const inventarioWhSelect = document.getElementById('conta-inventario-warehouse-select');
    if (inventarioWhSelect) inventarioWhSelect.addEventListener('change', loadContaInventarioDetalle);

    const reportTypeSelect = document.getElementById('report-type');
    const repartidorFilterDiv = document.getElementById('report-repartidor-filter');
    if (reportTypeSelect && repartidorFilterDiv) {
        reportTypeSelect.addEventListener('change', () => {
            repartidorFilterDiv.style.display = (reportTypeSelect.value === 'reconciliation') ? 'block' : 'none';
        });
        // Mostrar/ocultar inicialmente según selección
        repartidorFilterDiv.style.display = (reportTypeSelect.value === 'reconciliation') ? 'block' : 'none';
    }

    // 2. Cargar datos iniciales para la pestaña activa por defecto
    await loadTabData('conta-resumen');

    console.log('[contabilidad.js] Dashboard Contabilidad configurado.');
}