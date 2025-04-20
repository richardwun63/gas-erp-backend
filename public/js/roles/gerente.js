// ==================================
// js/roles/gerente.js
// Lógica específica para el dashboard del Gerente (Versión corregida)
// ==================================
console.log('[gerente.js] Módulo cargado.');

// --- Importaciones ---
import { fetchWithAuth } from '../modules/api.js';
import { getCurrentUser, getSelectedWarehouseId, setGlobalConfigState } from '../modules/state.js';
import { showGlobalError, openModal, closeModal, populateWarehouseSelectors } from '../modules/ui.js';
import { formatCurrency, formatStatusTag, displayReportData } from '../modules/utils.js';

// --- Variables del Módulo ---
let monthlySalesChart = null; // Gráfico de ventas

// --- Funciones Específicas ---

// --- Pestaña KPIs ---
async function loadGerenteKPIs() {
    const kpiContainer = document.getElementById('kpi-container');
    if (!kpiContainer) return console.error('[gerente/loadKPIs] Contenedor #kpi-container no encontrado.');

    kpiContainer.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando KPIs...</div>';
    try {
        const response = await fetchWithAuth('/reports/kpi-summary');
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} cargando KPIs`);
        }
        const data = await response.json();
        
        // Construir HTML
        let kpiHtml = `
            <div class="kpi-card"><h4><i class="fas fa-dollar-sign"></i> Ventas Mes</h4><p class="blue">${formatCurrency(data.data?.sales?.month_total)}</p><small>(${data.data?.sales?.month_orders || 0} pedidos)</small></div>
            <div class="kpi-card"><h4><i class="fas fa-chart-line"></i> Crecim. vs Mes Ant.</h4><p class="${parseFloat(data.data?.sales?.growth_percentage || 0) >= 0 ? 'green' : 'red'}"><i class="fas ${parseFloat(data.data?.sales?.growth_percentage || 0) >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> ${parseFloat(data.data?.sales?.growth_percentage || 0).toFixed(1)}%</p><small>${parseFloat(data.data?.sales?.last_month_total || 0) > 0 ? `(vs ${formatCurrency(data.data.sales.last_month_total)})` : '(Sin mes anterior)'}</small></div>
            <div class="kpi-card"><h4><i class="fas fa-users"></i> Clientes Activos (30d)</h4><p>${data.data?.customers?.active || 0}</p><small>${data.data?.customers?.active_percentage ? `(${data.data.customers.active_percentage}%)` : ''}</small></div>
            <div class="kpi-card"><h4><i class="fas fa-inbox"></i> Pedidos Pendientes</h4><p class="orange">${data.data?.operations?.pending_orders || 0}</p></div>
            <div class="kpi-card"><h4><i class="fas fa-hand-holding-usd"></i> Cobro Pendiente</h4><p class="red">${formatCurrency(data.data?.operations?.pending_amount)}</p><small>(${data.data?.operations?.pending_payments || 0} pedidos)</small></div>
            <div class="kpi-card"><h4><i class="fas fa-exclamation-triangle"></i> Stock Bajo</h4><p class="red">${data.data?.operations?.low_stock_items || 0}</p><small>items</small></div>
        `;

        kpiContainer.innerHTML = kpiHtml;
    } catch (error) {
        console.error('[gerente/loadKPIs] Error:', error);
        kpiContainer.innerHTML = `<div class="error-message">Error al cargar KPIs: ${error.message}</div>`;
    }
}

async function setupMonthlySalesChart() {
    const ctx = document.getElementById('monthly-sales-chart')?.getContext('2d');
    if (!ctx) return console.error("Canvas #monthly-sales-chart no encontrado.");
    
    // Añade esto para controlar el tamaño del contenedor
    const canvasContainer = ctx.canvas.parentElement;
    if (canvasContainer) {
        canvasContainer.style.height = '300px';
        canvasContainer.style.position = 'relative';
        canvasContainer.style.width = '100%';
    }

    try {
        const response = await fetchWithAuth('/reports/monthly-sales-chart');
        if (!response.ok) throw new Error("Error cargando datos para gráfico");
        const result = await response.json();
        
        // Asegurarse de que la respuesta tenga la estructura correcta
        const salesData = result.data || [];
        
        if (!Array.isArray(salesData)) {
            throw new Error("Datos de ventas no válidos, se esperaba un array");
        }

        const labels = salesData.map(d => {
            try {
                const [year, month] = d.month.split('-');
                return new Date(year, month - 1).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' });
            } catch { return d.month || d.label || 'N/A'; }
        });
        const dataValues = salesData.map(d => parseFloat(d.total_sales) || 0);

        if (monthlySalesChart) monthlySalesChart.destroy();

        monthlySalesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ventas Mensuales (S/)',
                    data: dataValues,
                    backgroundColor: 'rgba(0, 123, 255, 0.6)',
                    borderColor: 'rgb(0, 123, 255)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true, // Cambiar a true
                aspectRatio: 2, // Controlar proporción altura/ancho
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    tooltip: { 
                        callbacks: { 
                            label: (context) => `Ventas: ${formatCurrency(context.parsed.y)}` 
                        } 
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { 
                            callback: (value) => formatCurrency(value, '') 
                        },
                        grid: {
                            drawBorder: false
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('[gerente/setupSalesChart] Error:', error);
        if (ctx) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.font = "14px Arial"; ctx.fillStyle = "red"; ctx.textAlign = "center";
            ctx.fillText("Error al cargar gráfico", ctx.canvas.width/2, ctx.canvas.height/2);
        }
    }
}

// --- Pestaña Clientes ---
async function loadGerenteClientes() {
    const tableBody = document.querySelector('#clientes-table tbody');
    const searchInput = document.getElementById('cliente-search');
    
    if (!tableBody) {
        console.error('Tabla #clientes-table tbody no encontrada.');
        return;
    }

    tableBody.innerHTML = '<tr><td colspan="6"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';
    const searchTerm = searchInput ? searchInput.value.trim() : '';

    try {
        const response = await fetchWithAuth(`/customers?search=${encodeURIComponent(searchTerm)}&limit=50`);
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar clientes`);
        }
        
        const result = await response.json();
        const clientes = result.customers || [];

        tableBody.innerHTML = '';

        if (clientes.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No se encontraron clientes ${searchTerm ? 'que coincidan.' : '.'}</td></tr>`;
            return;
        }

        clientes.forEach(cliente => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${cliente.user_id || 'N/A'}</td>
                <td>${cliente.full_name || 'N/A'}</td>
                <td>${cliente.phone_number_primary || '-'}</td>
                <td>${cliente.customer_type || 'N/A'}</td>
                <td>${cliente.loyalty_points ?? '-'}</td>
                <td>
                    <button class="btn btn-info btn-sm" title="Ver Detalles" onclick="viewClientDetails(${cliente.user_id})">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-warning btn-sm" title="Editar Precios" onclick="openEditCustomerPricesModal(${cliente.user_id})">
                        <i class="fas fa-dollar-sign"></i>
                    </button>
                </td>`;
            
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('[gerente/loadClientes] Error:', error);
        tableBody.innerHTML = `<tr><td colspan="6"><div class="error-message">Error: ${error.message}</div></td></tr>`;
    }
}
// Hacer que la función esté disponible globalmente
window.loadGerenteClientes = loadGerenteClientes;

function handleGerenteClienteSearch(event) {
    if (event.key === 'Enter' || event.type === 'click') {
        loadGerenteClientes();
    }
}

async function viewClientDetails(userId) {
    if (!userId) return;
    const modalId = 'view-details-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return showGlobalError("Error: Modal de detalles no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando detalle...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth(`/customers/${userId}`);
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar detalles del cliente`);
        }
        const cust = await response.json();

        const lastPurchase = cust.last_purchase_date ? new Date(cust.last_purchase_date).toLocaleDateString('es-PE') : 'N/A';
        const birthDate = cust.birth_date ? new Date(cust.birth_date+'T00:00:00').toLocaleDateString('es-PE') : 'N/A';

        // Historial de precios especiales
        let pricesHtml = '<p>Precios estándar.</p>';
        if (cust.special_prices && cust.special_prices.length > 0) {
            pricesHtml = '<ul style="padding-left: 15px;">';
            cust.special_prices.forEach(p => {
                pricesHtml += `<li>${p.cylinder_name}: ${formatCurrency(p.special_price)} (Intercambio)</li>`;
            });
            pricesHtml += '</ul>';
        }

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle Cliente: ${cust.full_name || 'N/A'}</h2>
            <div class="grid-container-responsive">
                <div><strong>ID:</strong> ${cust.user_id}</div>
                <div><strong>DNI/RUC:</strong> ${cust.dni_ruc || '-'}</div>
                <div><strong>Teléfono 1:</strong> ${cust.phone_number_primary || '-'}</div>
                <div><strong>Teléfono 2:</strong> ${cust.phone_number_secondary || '-'}</div>
                <div><strong>Email:</strong> ${cust.email || '-'}</div>
                <div><strong>Tipo:</strong> ${cust.customer_type || '-'}</div>
                <div><strong>Cumpleaños:</strong> ${birthDate}</div>
                <div><strong>Puntos:</strong> ${cust.loyalty_points ?? '0'}</div>
                <div><strong>Cód. Referido:</strong> ${cust.referral_code || '-'}</div>
                <div><strong>Referido por:</strong> ${cust.referred_by_code || '-'}</div>
                <div><strong>Última Compra:</strong> ${lastPurchase}</div>
                <div style="grid-column: 1 / -1;"><strong>Dirección:</strong> ${cust.address_text || '-'}</div>
            </div>
            <hr>
            <h4>Precios Especiales Asignados:</h4>
            ${pricesHtml}
            <hr>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
            <button type="button" class="btn btn-warning" onclick="openEditCustomerPricesModal(${userId})">Editar Precios</button>
        `;
    } catch (error) {
        console.error(`[gerente/viewClientDetails] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Detalle Cliente</h2>
            <p class="error-message">Error al cargar detalles: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.viewClientDetails = viewClientDetails;

async function openEditCustomerPricesModal(userId) {
    if (!userId) return;
    const modalId = 'edit-customer-prices-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return showGlobalError("Error: Modal de precios no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    openModal(modalId);

    try {
        const [cylindersRes, customerRes] = await Promise.all([
            fetchWithAuth('/products/cylinders'),
            fetchWithAuth(`/customers/${userId}`)
        ]);

        if (!cylindersRes.ok) {
            const errData = await cylindersRes.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${cylindersRes.status} al cargar tipos de balón`);
        }
        if (!customerRes.ok) {
            const errData = await customerRes.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${customerRes.status} al cargar datos del cliente`);
        }

        const cylinderTypes = await cylindersRes.json();
        const customerData = await customerRes.json();
        const currentPrices = customerData.special_prices || [];

        let formHtml = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Editar Precios Especiales</h2>
            <p><strong>Cliente:</strong> ${customerData.full_name}</p>
            <form id="edit-prices-form">
                <input type="hidden" name="customerId" value="${userId}">
                <p><small>Ingrese el precio especial de <strong>intercambio</strong> para cada tipo de balón. Deje vacío para usar el precio estándar.</small></p>
        `;

        cylinderTypes.forEach(cyl => {
            if (cyl.is_available) {
                const currentSpecial = currentPrices.find(p => p.cylinder_type_id === cyl.cylinder_type_id);
                const currentPriceValue = currentSpecial ? currentSpecial.special_price : '';
                formHtml += `
                    <div class="input-group">
                        <label for="price-${cyl.cylinder_type_id}">${cyl.name} (Estándar: ${formatCurrency(cyl.price_exchange)})</label>
                        <input type="number" step="0.10" min="0" id="price-${cyl.cylinder_type_id}"
                               name="prices[${cyl.cylinder_type_id}]" value="${currentPriceValue}"
                               placeholder="Precio Especial (Ej: 45.00)">
                    </div>
                `;
            }
        });

        formHtml += `
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar Precios</button>
                <button type="button" class="btn btn-danger" style="margin-left: 10px;" onclick="clearCustomPrices(${userId})">
                    <i class="fas fa-trash"></i> Quitar Todos
                </button>
                <div id="edit-prices-error" class="error-message"></div>
            </form>
        `;
        modalContent.innerHTML = formHtml;

        const form = modalContent.querySelector('#edit-prices-form');
        if (form) form.addEventListener('submit', handleSaveCustomerPrices);

    } catch (error) {
        console.error(`[gerente/openEditPrices] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Editar Precios</h2>
            <p class="error-message">Error al cargar datos: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.openEditCustomerPricesModal = openEditCustomerPricesModal;

async function handleSaveCustomerPrices(event) {
    event.preventDefault();
    const form = event.target;
    const errorDiv = document.getElementById('edit-prices-error');
    const submitButton = form.querySelector('button[type="submit"]');
    const customerId = form.elements.customerId.value;
    const modalId = 'edit-customer-prices-modal';

    if(!errorDiv || !submitButton || !customerId) return;
    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    const pricesToSend = [];
    const inputs = form.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
        const cylinderTypeIdMatch = input.name.match(/\[(\d+)\]$/);
        if (cylinderTypeIdMatch && input.value) {
            const priceValue = parseFloat(input.value);
            if (!isNaN(priceValue) && priceValue >= 0) {
                pricesToSend.push({
                    cylinder_type_id: parseInt(cylinderTypeIdMatch[1]),
                    price_exchange: priceValue
                });
            }
        }
    });

    try {
        const response = await fetchWithAuth(`/customers/${customerId}/pricing`, {
            method: 'PUT',
            body: JSON.stringify({ prices: pricesToSend })
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert("Precios especiales guardados con éxito.");
        closeModal(modalId);

    } catch (error) {
        console.error(`[gerente/savePrices] Error:`, error);
        errorDiv.textContent = `Error al guardar: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Precios';
    }
}

async function clearCustomPrices(userId) {
    if (!userId || !confirm(`¿Estás seguro de quitar TODOS los precios especiales para este cliente? Usará los precios estándar.`)) {
        return;
    }
    
    const errorDiv = document.getElementById('edit-prices-error');
    const modalId = 'edit-customer-prices-modal';

    try {
        const response = await fetchWithAuth(`/customers/${userId}/pricing`, { method: 'DELETE' });
        
        if (!response.ok && response.status !== 204) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        // Si el status es 204, no contendrá JSON
        if (response.status !== 204) {
            await response.json();
        }

        alert("Precios especiales eliminados con éxito.");
        closeModal(modalId);

    } catch (error) {
        console.error(`[gerente/clearPrices] Error:`, error);
        if(errorDiv) errorDiv.textContent = `Error al eliminar: ${error.message}`;
        else showGlobalError(`Error al eliminar precios: ${error.message}`);
    }
}
window.clearCustomPrices = clearCustomPrices;

// --- Pestaña Empleados ---
async function loadGerenteUsers() {
    const tableBody = document.querySelector('#empleados-table tbody');
    if (!tableBody) return console.error('Tabla #empleados-table tbody no encontrada.');

    tableBody.innerHTML = '<tr><td colspan="7"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';

    try {
        let response;
        // Comprobar si fetchWithAuth está disponible
        if (typeof fetchWithAuth === 'function') {
            console.log('[gerente/loadUsers] Usando fetchWithAuth...');
            response = await fetchWithAuth('/users?excludeRole=cliente');
        } else {
            // Fallback a fetch normal si fetchWithAuth no está disponible
            console.log('[gerente/loadUsers] fetchWithAuth no disponible, usando fetch nativo...');
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No hay token de autenticación. Inicie sesión de nuevo.');
            }
            
            response = await fetch('/users?excludeRole=cliente', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        }
        
        if (!response.ok) {
            // Verificar si la respuesta es HTML en lugar de JSON (posible redirección)
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                throw new Error('La sesión parece haber caducado. Por favor, recargue la página e inicie sesión de nuevo.');
            }
            
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar empleados`);
        }
        
        const users = await response.json();

        tableBody.innerHTML = '';

        if (!users || users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No hay empleados registrados.</td></tr>';
            return;
        }

        // Resto del código original...
        users.forEach(emp => {
            const statusTagHTML = formatStatusTag(emp.is_active ? 'activo' : 'inactivo');
            // ... código original
        });
    } catch (error) {
        console.error('[gerente/loadUsers] Error:', error);
        tableBody.innerHTML = `<tr><td colspan="7"><div class="error-message">Error: ${error.message}</div></td></tr>`;
        
        // Si el error parece relacionado con la autenticación, ofrecemos recargar
        if (error.message.includes('sesión') || error.message.includes('token') || error.message.includes('autenticación')) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="7" style="text-align: center;">
                <button class="btn btn-primary" onclick="window.location.reload()">Recargar página</button>
            </td>`;
            tableBody.appendChild(row);
        }
    }
}

async function openCreateUserModal() {
    const modalId = 'create-user-modal';
    const modal = document.getElementById(modalId);
    if (!modal) return console.error(`Modal #${modalId} no encontrado.`);

    const warehouseSelect = modal.querySelector('#create-warehouse');
    if (warehouseSelect) {
        populateWarehouseSelectors(warehouseSelect.parentElement);
    }

    const form = document.getElementById('create-user-form-gerente');
    const errorDiv = document.getElementById('create-user-error');
    if (form) form.reset();
    if (errorDiv) errorDiv.textContent = '';

    // Asegurar que el listener esté adjunto (solo una vez)
    if (form && !form._hasCreateListener) {
        form.addEventListener('submit', handleCreateUserGerente);
        form._hasCreateListener = true;
    }

    openModal(modalId);
}
window.openCreateUserModal = openCreateUserModal;

async function handleCreateUserGerente(event) {
    event.preventDefault();
    const form = event.target;
    const errorDiv = document.getElementById('create-user-error');
    const submitButton = form.querySelector('button[type="submit"]');
    const modalId = 'create-user-modal';

    if(!errorDiv || !submitButton) return;
    
    // Validación básica
    const fullname = form.elements.full_name.value.trim();
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    const role = form.elements.role_name.value;
    
    if (!fullname || !username || !password || !role) {
        errorDiv.textContent = 'Complete todos los campos obligatorios.';
        return;
    }
    
    if (password.length < 6) {
        errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        return;
    }

    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

    const formData = new FormData(form);
    const dataToSend = Object.fromEntries(formData.entries());
    // Convertir warehouse_id a null si está vacío
    dataToSend.default_warehouse_id = dataToSend.default_warehouse_id || null;

    try {
        const response = await fetchWithAuth('/users', {
            method: 'POST',
            body: JSON.stringify(dataToSend)
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert(`Empleado ${dataToSend.full_name} creado con éxito.`);
        closeModal(modalId);
        loadGerenteUsers();

    } catch (error) {
        console.error("[gerente/handleCreateUser] Error:", error);
        errorDiv.textContent = `Error al crear: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Crear Empleado';
    }
}

async function openEditUserModal(userId) {
    if (!userId) return;
    const modalId = 'edit-user-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return showGlobalError("Error: Modal de edición no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando datos...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth(`/users/${userId}`);
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar datos del empleado`);
        }
        const emp = await response.json();

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2><i class="fas fa-user-edit"></i> Editar Empleado: ${emp.full_name || `ID ${userId}`}</h2>
            <form id="edit-user-form">
                <input type="hidden" name="userId" value="${userId}">
                <div class="input-group"> <label for="edit-emp-fullname">Nombre Completo:</label>
                    <input type="text" id="edit-emp-fullname" name="full_name" value="${emp.full_name || ''}" required>
                </div>
                <div class="input-group"> <label for="edit-emp-username">Username (Login):</label>
                    <input type="text" id="edit-emp-username" name="username" value="${emp.username || ''}" required>
                </div>
                <div class="input-group"> <label>Rol:</label> <span>${emp.role_name || 'N/A'} (No editable aquí)</span> </div>
                <div class="input-group"> <label for="edit-emp-phone">Celular Principal:</label>
                    <input type="tel" id="edit-emp-phone" name="phone_number_primary" value="${emp.phone_number_primary || ''}">
                </div>
                <div class="input-group"> <label for="edit-emp-phone2">Celular Secundario:</label>
                    <input type="tel" id="edit-emp-phone2" name="phone_number_secondary" value="${emp.phone_number_secondary || ''}">
                </div>
                <div class="input-group"> <label for="edit-emp-email">Email:</label>
                    <input type="email" id="edit-emp-email" name="email" value="${emp.email || ''}">
                </div>
                <div class="input-group"> <label for="edit-emp-warehouse">Almacén Predet.:</label>
                    <select id="edit-emp-warehouse" name="default_warehouse_id">
                        <option value="">-- Ninguno --</option>
                    </select>
                </div>
                <p><small>La contraseña y el rol no se pueden editar aquí.</small></p>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar Cambios</button>
                <div id="edit-user-form-error" class="error-message"></div>
            </form>
        `;

        const whSelect = modalContent.querySelector('#edit-emp-warehouse');
        if(whSelect) {
            populateWarehouseSelectors(whSelect.parentElement);
            whSelect.value = emp.default_warehouse_id || '';
        }

        const form = modalContent.querySelector('#edit-user-form');
        if (form) {
            form.addEventListener('submit', handleEditUserSubmit);
        }
    } catch (error) {
        console.error(`[gerente/openEditUser] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">×</span>
            <h2>Editar Empleado</h2>
            <p class="error-message">Error al cargar datos: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.openEditUserModal = openEditUserModal;

async function handleEditUserSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const errorDiv = document.getElementById('edit-user-form-error');
    const submitButton = form.querySelector('button[type="submit"]');
    const userId = form.elements.userId.value;
    const modalId = 'edit-user-modal';

    if(!errorDiv || !submitButton || !userId) return;
    
    // Validación básica
    const fullname = form.elements.full_name.value.trim();
    const username = form.elements.username.value.trim();
    
    if (!fullname || !username) {
        errorDiv.textContent = 'Nombre y username son requeridos.';
        return;
    }
    
    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    const formData = new FormData(form);
    const dataToSend = {
        full_name: formData.get('full_name'),
        username: formData.get('username'),
        phone_number_primary: formData.get('phone_number_primary') || null,
        phone_number_secondary: formData.get('phone_number_secondary') || null,
        email: formData.get('email') || null,
        default_warehouse_id: formData.get('default_warehouse_id') || null
    };

    try {
        const response = await fetchWithAuth(`/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(dataToSend)
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert("Datos del empleado actualizados.");
        closeModal(modalId);
        loadGerenteUsers();

    } catch (error) {
        console.error(`[gerente/handleEditUserSubmit] Error:`, error);
        errorDiv.textContent = `Error al guardar: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
    }
}

async function toggleUserStatus(userId, newStatus) {
    if (!userId || !confirm(`¿Estás seguro de ${newStatus ? 'activar' : 'desactivar'} a este empleado?`)) {
        return;
    }

    try {
        const response = await fetchWithAuth(`/users/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ is_active: newStatus })
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert(`Empleado ${newStatus ? 'activado' : 'desactivado'} correctamente.`);
        loadGerenteUsers();

    } catch (error) {
        console.error(`[gerente/toggleUserStatus] Error:`, error);
        showGlobalError(`Error al cambiar estado: ${error.message}`);
    }
}
window.toggleUserStatus = toggleUserStatus;

async function deleteEmployee(userId) {
    if (!userId) return;
    if (!confirm(`¡ATENCIÓN! ¿Estás seguro de ELIMINAR PERMANENTEMENTE al empleado ID ${userId}? Esta acción no se puede deshacer.`)) {
        return;
    }
    if (!confirm(`SEGUNDA CONFIRMACIÓN: Eliminar empleado ID ${userId}. ¿Continuar?`)) {
        return;
    }

    try {
        const response = await fetchWithAuth(`/users/${userId}`, { method: 'DELETE' });
        let result = { message: "Empleado eliminado" };
        
        if (response.status !== 204) {
            try { 
                result = await response.json(); 
            } catch(e) {
                // Ignorar errores de parsing JSON si el response no contiene JSON
            }
        }
        
        if (!response.ok && response.status !== 204) {
            throw new Error(result.message || `Error ${response.status}`);
        }

        alert(`Empleado ID ${userId} eliminado permanentemente.`);
        loadGerenteUsers();

    } catch (error) {
        console.error(`[gerente/deleteEmployee] Error:`, error);
        showGlobalError(`Error al eliminar empleado: ${error.message}`);
    }
}
window.deleteEmployee = deleteEmployee;

async function openEditScheduleModal(userId) {
    if (!userId) return;
    const modalId = 'edit-schedule-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return showGlobalError("Error: Modal de horario no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth(`/users/${userId}`);
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar datos del repartidor`);
        }
        const user = await response.json();

        if (user.role_name !== 'repartidor') {
            throw new Error("Solo se puede editar horarios de repartidores");
        }

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2><i class="fas fa-calendar-alt"></i> Editar Horario: ${user.full_name}</h2>
            <form id="edit-schedule-form">
                <input type="hidden" name="userId" value="${userId}">
                <div class="input-group">
                    <label for="schedule-start">Hora Inicio:</label>
                    <input type="time" id="schedule-start" name="schedule_start" value="${user.schedule_start || ''}">
                </div>
                <div class="input-group">
                    <label for="schedule-end">Hora Fin:</label>
                    <input type="time" id="schedule-end" name="schedule_end" value="${user.schedule_end || ''}">
                </div>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar Horario</button>
                <button type="button" class="btn btn-warning" onclick="clearScheduleHandler(${userId})">
                    <i class="fas fa-eraser"></i> Limpiar Horario
                </button>
                <div id="edit-schedule-error" class="error-message"></div>
            </form>
        `;

        const form = modalContent.querySelector('#edit-schedule-form');
        if (form) {
            form.addEventListener('submit', handleSaveSchedule);
        }

    } catch (error) {
        console.error(`[gerente/openEditSchedule] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Editar Horario</h2>
            <p class="error-message">Error: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.openEditScheduleModal = openEditScheduleModal;

async function handleSaveSchedule(event) {
    event.preventDefault();
    const form = event.target;
    const errorDiv = document.getElementById('edit-schedule-error');
    const submitButton = form.querySelector('button[type="submit"]');
    const userId = form.elements.userId.value;
    const startTime = form.elements.schedule_start.value;
    const endTime = form.elements.schedule_end.value;
    const modalId = 'edit-schedule-modal';

    if (!errorDiv || !submitButton || !userId) return;
    
    // Validación básica
    if ((startTime && !endTime) || (!startTime && endTime)) {
        errorDiv.textContent = 'Debe especificar ambos horarios o ninguno.';
        return;
    }

    if (startTime && endTime) {
        if (startTime >= endTime) {
            errorDiv.textContent = 'La hora de fin debe ser posterior a la hora de inicio.';
            return;
        }
    }

    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const response = await fetchWithAuth(`/users/${userId}/schedule`, {
            method: 'PUT',
            body: JSON.stringify({ 
                schedule_start: startTime || null,
                schedule_end: endTime || null 
            })
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert("Horario actualizado con éxito.");
        closeModal(modalId);
        loadGerenteUsers();

    } catch (error) {
        console.error(`[gerente/handleSaveSchedule] Error:`, error);
        errorDiv.textContent = `Error al guardar horario: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Horario';
    }
}

async function clearScheduleHandler(userId) {
    if (!userId || !confirm("¿Está seguro de eliminar el horario asignado?")) {
        return;
    }

    const errorDiv = document.getElementById('edit-schedule-error');
    const modalId = 'edit-schedule-modal';

    try {
        const response = await fetchWithAuth(`/users/${userId}/schedule`, { method: 'DELETE' });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert("Horario eliminado con éxito.");
        closeModal(modalId);
        loadGerenteUsers();

    } catch (error) {
        console.error(`[gerente/clearSchedule] Error:`, error);
        if (errorDiv) errorDiv.textContent = `Error al eliminar horario: ${error.message}`;
        else showGlobalError(`Error al eliminar horario: ${error.message}`);
    }
}
window.clearScheduleHandler = clearScheduleHandler;

// --- Pestaña Inventario ---
async function loadGerenteInventarioData() {
    const warehouseId = document.getElementById('inventario-warehouse-selector')?.value;
    if (!warehouseId) {
        // Obtener referencias a los elementos primero
        const balonesEl = document.getElementById('stock-list-balones');
        const otrosEl = document.getElementById('stock-list-otros');
        
        // Verificar que existan antes de modificar su innerHTML
        if (balonesEl) balonesEl.innerHTML = '<li>Seleccione un almacén</li>';
        if (otrosEl) otrosEl.innerHTML = '<li>Seleccione un almacén</li>';
        
        return loadPrestamosActivos();
    }

    const balonesList = document.getElementById('stock-list-balones');
    const otrosList = document.getElementById('stock-list-otros');
    
    if (!balonesList || !otrosList) return console.error("Listas de inventario no encontradas.");

    balonesList.innerHTML = '<li><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></li>';
    otrosList.innerHTML = '<li><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></li>';

    try {
        // Carga de stock y préstamos en paralelo
        const stockResponse = await fetchWithAuth(`/inventory/stock?warehouseId=${warehouseId}`);
        if (!stockResponse.ok) {
            const errData = await stockResponse.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${stockResponse.status} al cargar stock`);
        }
        const stockData = await stockResponse.json();

        balonesList.innerHTML = '';
        otrosList.innerHTML = '';

        if (stockData.cylinders && stockData.cylinders.length > 0) {
            stockData.cylinders.forEach(cyl => {
                if (cyl.full_qty > 0) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="item-name">${cyl.name}</span> <span class="item-status">Lleno</span> <span class="item-quantity">${cyl.full_qty}</span>`;
                    balonesList.appendChild(li);
                }
                if (cyl.empty_qty > 0) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="item-name">${cyl.name}</span> <span class="item-status">Vacío</span> <span class="item-quantity">${cyl.empty_qty}</span>`;
                    balonesList.appendChild(li);
                }
                if (cyl.damaged_qty > 0) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="item-name">${cyl.name}</span> <span class="item-status text-danger">Dañado</span> <span class="item-quantity">${cyl.damaged_qty}</span>`;
                    balonesList.appendChild(li);
                }
            });
        } else {
            balonesList.innerHTML = '<li>No hay balones registrados.</li>';
        }

        if (stockData.otherProducts && stockData.otherProducts.length > 0) {
            stockData.otherProducts.forEach(prod => {
                if (prod.stock_qty > 0) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="item-name">${prod.name}</span> <span class="item-status">Disponible</span> <span class="item-quantity">${prod.stock_qty}</span>`;
                    otrosList.appendChild(li);
                }
            });
        } else {
            otrosList.innerHTML = '<li>No hay otros productos registrados.</li>';
        }

        await Promise.all([
            loadPrestamosActivos(),
            populatePrestamoProveedorForm()
        ]);

    } catch (error) {
        console.error(`[gerente/loadInventario] Error:`, error);
        if (balonesList) balonesList.innerHTML = `<li><p class="error-message">Error: ${error.message}</p></li>`;
        if (otrosList) otrosList.innerHTML = `<li><p class="error-message">Error: ${error.message}</p></li>`;
    }
}

async function loadPrestamosActivos() {
    const listElement = document.getElementById('prestamos-activos');
    if (!listElement) return;
    
    listElement.innerHTML = '<li>Cargando...</li>';
    
    try {
        const response = await fetchWithAuth('/inventory/supplier-loans');
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar préstamos`);
        }
        const loans = await response.json();

        listElement.innerHTML = '';
        
        if (loans.length === 0) {
            listElement.innerHTML = '<li>No hay préstamos activos.</li>';
            return;
        }
        
        loans.forEach(loan => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="item-details">
                    ${loan.quantity} x ${loan.cylinder_name} (${loan.supplier_info || 'Proveedor desc.'})
                    <small>Desde: ${loan.loan_date_formatted || 'Fecha desc.'}</small>
                </div>
                <div class="item-actions">
                    <button class="btn btn-success btn-sm" onclick="returnSupplierLoanHandler(${loan.loan_id})">
                        <i class="fas fa-undo"></i> Devolver
                    </button>
                </div>`;
            listElement.appendChild(li);
        });
    } catch (error) {
        console.error("Error cargando préstamos:", error);
        listElement.innerHTML = '<li>Error al cargar préstamos.</li>';
    }
}

async function populatePrestamoProveedorForm() {
    const select = document.getElementById('prestamo-tipo');
    if (!select || select.options.length > 1) return;

    try {
        const response = await fetchWithAuth('/products/cylinders');
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar tipos de cilindro`);
        }
        const types = await response.json();
        
        select.innerHTML = '<option value="" disabled selected>-- Seleccione Tipo --</option>';
        types.forEach(t => {
            if (t.is_available) {
                const option = document.createElement('option');
                option.value = t.cylinder_type_id;
                option.textContent = t.name;
                select.appendChild(option);
            }
        });
        
        // Adjuntar listener al formulario
        const form = document.getElementById('prestamo-proveedor-form');
        if (form && !form._hasPrestamoListener) {
            form.addEventListener('submit', handlePrestamoProveedorSubmit);
            form._hasPrestamoListener = true;
        }
    } catch (e) {
        console.error("Error poblando form préstamo:", e);
    }
}

async function handlePrestamoProveedorSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    
    if (!submitButton) return;
    
    // Validación básica
    const cylinderTypeId = form.elements.cylinder_type_id.value;
    const quantity = parseInt(form.elements.quantity.value);
    
    if (!cylinderTypeId || !quantity || quantity <= 0 || isNaN(quantity)) {
        alert("Por favor complete todos los campos correctamente.");
        return;
    }
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';

    try {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        const response = await fetchWithAuth('/inventory/supplier-loans', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert("Préstamo registrado con éxito.");
        form.reset();
        await loadGerenteInventarioData();

    } catch (error) {
        alert(`Error al registrar préstamo: ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save"></i> Registrar Préstamo';
    }
}

async function returnSupplierLoanHandler(loanId) {
    if (!loanId || !confirm(`¿Confirmar devolución del préstamo ID ${loanId}? Se eliminará el registro.`)) {
        return;
    }

    try {
        const response = await fetchWithAuth(`/inventory/supplier-loans/${loanId}`, { method: 'DELETE' });
        
        if (!response.ok && response.status !== 204) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }

        alert("Devolución registrada con éxito.");
        await loadGerenteInventarioData();

    } catch (error) {
        alert(`Error al registrar devolución: ${error.message}`);
    }
}
window.returnSupplierLoanHandler = returnSupplierLoanHandler;

async function markAsDamaged() {
    const modalId = 'adjust-stock-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return showGlobalError("Error: Modal de ajuste no encontrado.");

    const warehouseId = document.getElementById('inventario-warehouse-selector')?.value;
    if (!warehouseId) {
        return alert("Por favor, seleccione un almacén primero.");
    }

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth('/products/cylinders');
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar tipos de cilindro`);
        }
        const types = await response.json();

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2><i class="fas fa-exclamation-triangle"></i> Reportar Balón Dañado</h2>
            <form id="adjust-damage-form">
                <input type="hidden" name="warehouse_id" value="${warehouseId}">
                <input type="hidden" name="item_type" value="cylinder">
                <input type="hidden" name="status" value="damaged">
                <div class="input-group">
                    <label for="damage-item-id">Tipo de Balón:</label>
                    <select id="damage-item-id" name="item_id" required>
                        <option value="">-- Seleccione Tipo --</option>
                        ${types.filter(t => t.is_available).map(t => `<option value="${t.cylinder_type_id}">${t.name}</option>`).join('')}
                    </select>
                </div>
                <div class="input-group">
                    <label for="damage-status-from">Estado Actual:</label>
                    <select id="damage-status-from" name="status_from" required>
                        <option value="full">Lleno</option>
                        <option value="empty">Vacío</option>
                    </select>
                </div>
                <div class="input-group">
                    <label for="damage-quantity">Cantidad:</label>
                    <input type="number" id="damage-quantity" name="quantity_change" min="1" value="1" required>
                </div>
                <div class="input-group">
                    <label for="damage-reason">Razón:</label>
                    <select id="damage-reason" name="reason" required>
                        <option value="damaged_valve">Válvula Dañada</option>
                        <option value="damaged_body">Cuerpo Abollado/Dañado</option>
                        <option value="leak">Fuga Detectada</option>
                        <option value="customer_return">Devolución de Cliente</option>
                        <option value="other">Otro</option>
                    </select>
                </div>
                <div class="input-group">
                    <label for="damage-notes">Notas Adicionales:</label>
                    <textarea id="damage-notes" name="notes" rows="2"></textarea>
                </div>
                <button type="submit" class="btn btn-warning"><i class="fas fa-save"></i> Registrar Dañado</button>
                <div id="adjust-damage-error" class="error-message"></div>
            </form>
        `;

        const form = modalContent.querySelector('#adjust-damage-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const errorDiv = document.getElementById('adjust-damage-error');
                const submitBtn = form.querySelector('button[type="submit"]');
                
                if (!errorDiv || !submitBtn) return;
                
                errorDiv.textContent = '';
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
                
                try {
                    const formData = new FormData(form);
                    const data = {
                        warehouse_id: formData.get('warehouse_id'),
                        item_id: formData.get('item_id'),
                        item_type: formData.get('item_type'),
                        status: formData.get('status'),
                        quantity_change: parseInt(formData.get('quantity_change')),
                        reason: `${formData.get('status_from')}_to_damaged: ${formData.get('reason')}`,
                        notes: formData.get('notes') || null
                    };
                    
                    // Verificar si hay suficiente stock del estado origen
                    const stockCheckRes = await fetchWithAuth(`/inventory/stock?warehouseId=${warehouseId}`);
                    if (!stockCheckRes.ok) {
                        const errData = await stockCheckRes.json().catch(()=>({}));
                        throw new Error(errData.message || "Error verificando stock disponible");
                    }
                    const stockData = await stockCheckRes.json();
                    
                    const cylinderType = stockData.cylinders?.find(c => c.id == data.item_id);
                    const availableStock = cylinderType ? 
                        (formData.get('status_from') === 'full' ? cylinderType.full_qty : cylinderType.empty_qty) : 0;
                    
                    if (availableStock < data.quantity_change) {
                        throw new Error(`Solo hay ${availableStock} unidades disponibles en estado ${formData.get('status_from') === 'full' ? 'lleno' : 'vacío'}.`);
                    }
                    
                    // Ajustar el stock: reducir del origen
                    const reduceRes = await fetchWithAuth('/inventory/adjust', {
                        method: 'POST',
                        body: JSON.stringify({
                            warehouse_id: data.warehouse_id,
                            item_id: data.item_id,
                            item_type: data.item_type,
                            status: formData.get('status_from'),
                            quantity_change: -data.quantity_change,
                            reason: `Convert to damaged: ${formData.get('reason')}`,
                            notes: data.notes
                        })
                    });
                    
                    if (!reduceRes.ok) {
                        const errData = await reduceRes.json().catch(() => ({}));
                        throw new Error(errData.message || `Error reduciendo stock de origen: ${reduceRes.status}`);
                    }
                    
                    // Incrementar estado dañados
                    const increaseRes = await fetchWithAuth('/inventory/adjust', {
                        method: 'POST',
                        body: JSON.stringify({
                            warehouse_id: data.warehouse_id,
                            item_id: data.item_id,
                            item_type: data.item_type,
                            status: data.status,
                            quantity_change: data.quantity_change,
                            reason: data.reason,
                            notes: data.notes
                        })
                    });
                    
                    if (!increaseRes.ok) {
                        const errData = await increaseRes.json().catch(() => ({}));
                        throw new Error(errData.message || `Error incrementando dañados: ${increaseRes.status}`);
                    }
                    
                    alert("Balón(es) marcado(s) como dañado con éxito.");
                    closeModal(modalId);
                    await loadGerenteInventarioData();
                    
                } catch (error) {
                    console.error("[gerente/markAsDamaged] Error:", error);
                    errorDiv.textContent = `Error: ${error.message}`;
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-save"></i> Registrar Dañado';
                }
            });
        }

    } catch (error) {
        console.error(`[gerente/markAsDamaged] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Reportar Balón Dañado</h2>
            <p class="error-message">Error: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.markAsDamaged = markAsDamaged;

async function manageOtherProducts() {
    const modalId = 'other-product-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return showGlobalError("Error: Modal de productos no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth('/products/others');
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar otros productos`);
        }
        const products = await response.json();

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2><i class="fas fa-boxes"></i> Gestionar Otros Productos</h2>
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Nombre</th>
                            <th>Precio</th>
                            <th>Unidad</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="other-products-table-body">
                        ${products.map(p => `
                            <tr>
                                <td>${p.product_id}</td>
                                <td>${p.name}</td>
                                <td>${formatCurrency(p.price)}</td>
                                <td>${p.stock_unit || 'unidad'}</td>
                                <td>${formatStatusTag(p.is_available ? 'activo' : 'inactivo')}</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm" onclick="editOtherProduct(${p.product_id})">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn ${p.is_available ? 'btn-warning' : 'btn-success'} btn-sm" 
                                            onclick="toggleOtherProductStatus(${p.product_id}, ${!p.is_available})">
                                        <i class="fas ${p.is_available ? 'fa-ban' : 'fa-check'}"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <button type="button" class="btn btn-primary" onclick="createOtherProduct()">
                <i class="fas fa-plus"></i> Nuevo Producto
            </button>
        `;

    } catch (error) {
        console.error(`[gerente/manageOtherProducts] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Gestionar Otros Productos</h2>
            <p class="error-message">Error: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.manageOtherProducts = manageOtherProducts;

function createOtherProduct() {
    const modalId = 'other-product-modal';
    const modalContent = document.querySelector(`#${modalId} .modal-content`);
    if (!modalContent) return;

    modalContent.innerHTML = `
        <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
        <h2><i class="fas fa-plus"></i> Nuevo Producto</h2>
        <form id="other-product-form">
            <div class="input-group">
                <label for="product-name">Nombre:</label>
                <input type="text" id="product-name" name="name" required>
            </div>
            <div class="input-group">
                <label for="product-description">Descripción (Opcional):</label>
                <textarea id="product-description" name="description" rows="2"></textarea>
            </div>
            <div class="input-group">
                <label for="product-price">Precio (S/):</label>
                <input type="number" step="0.10" min="0" id="product-price" name="price" required>
            </div>
            <div class="input-group">
                <label for="product-unit">Unidad:</label>
                <select id="product-unit" name="stock_unit">
                    <option value="unidad">Unidad</option>
                    <option value="kg">Kilogramo (kg)</option>
                    <option value="lt">Litro (lt)</option>
                    <option value="metro">Metro</option>
                    <option value="par">Par</option>
                    <option value="caja">Caja</option>
                </select>
            </div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar Producto</button>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cancelar</button>
            <div id="other-product-error" class="error-message"></div>
        </form>
    `;

    const form = modalContent.querySelector('#other-product-form');
    if (form) {
        form.addEventListener('submit', handleSaveOtherProduct);
    }
}
window.createOtherProduct = createOtherProduct;

async function handleSaveOtherProduct(event) {
    event.preventDefault();
    const form = event.target;
    const errorDiv = document.getElementById('other-product-error');
    const submitButton = form.querySelector('button[type="submit"]');

    if (!errorDiv || !submitButton) return;
    
    // Validación básica
    const name = form.elements.name.value.trim();
    const price = parseFloat(form.elements.price.value);
    
    if (!name || isNaN(price) || price < 0) {
        errorDiv.textContent = 'Complete todos los campos correctamente.';
        return;
    }
    
    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    const formData = new FormData(form);
    const dataToSend = {
        name: formData.get('name'),
        description: formData.get('description') || null,
        price: parseFloat(formData.get('price')),
        stock_unit: formData.get('stock_unit') || 'unidad',
        is_available: true
    };

    const productId = form.elements.product_id?.value;
    const isEdit = !!productId;

    try {
        const response = await fetchWithAuth(`/products/others${isEdit ? `/${productId}` : ''}`, {
            method: isEdit ? 'PUT' : 'POST',
            body: JSON.stringify(dataToSend)
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert(`Producto ${isEdit ? 'actualizado' : 'creado'} con éxito.`);
        manageOtherProducts();

    } catch (error) {
        console.error(`[gerente/saveOtherProduct] Error:`, error);
        errorDiv.textContent = `Error al guardar: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Producto';
    }
}

async function editOtherProduct(productId) {
    if (!productId) return;
    const modalId = 'other-product-modal';
    const modalContent = document.querySelector(`#${modalId} .modal-content`);
    if (!modalContent) return;

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

    try {
        const response = await fetchWithAuth(`/products/others/${productId}`);
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar datos del producto`);
        }
        const product = await response.json();

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2><i class="fas fa-edit"></i> Editar Producto</h2>
            <form id="other-product-form">
                <input type="hidden" name="product_id" value="${productId}">
                <div class="input-group">
                    <label for="product-name">Nombre:</label>
                    <input type="text" id="product-name" name="name" value="${product.name || ''}" required>
                </div>
                <div class="input-group">
                    <label for="product-description">Descripción (Opcional):</label>
                    <textarea id="product-description" name="description" rows="2">${product.description || ''}</textarea>
                </div>
                <div class="input-group">
                    <label for="product-price">Precio (S/):</label>
                    <input type="number" step="0.10" min="0" id="product-price" name="price" value="${product.price || ''}" required>
                </div>
                <div class="input-group">
                    <label for="product-unit">Unidad:</label>
                    <select id="product-unit" name="stock_unit">
                        <option value="unidad" ${product.stock_unit === 'unidad' ? 'selected' : ''}>Unidad</option>
                        <option value="kg" ${product.stock_unit === 'kg' ? 'selected' : ''}>Kilogramo (kg)</option>
                        <option value="lt" ${product.stock_unit === 'lt' ? 'selected' : ''}>Litro (lt)</option>
                        <option value="metro" ${product.stock_unit === 'metro' ? 'selected' : ''}>Metro</option>
                        <option value="par" ${product.stock_unit === 'par' ? 'selected' : ''}>Par</option>
                        <option value="caja" ${product.stock_unit === 'caja' ? 'selected' : ''}>Caja</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Actualizar Producto</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cancelar</button>
                <div id="other-product-error" class="error-message"></div>
            </form>
        `;

        const form = modalContent.querySelector('#other-product-form');
        if (form) {
            form.addEventListener('submit', handleSaveOtherProduct);
        }

    } catch (error) {
        console.error(`[gerente/editOtherProduct] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Editar Producto</h2>
            <p class="error-message">Error: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.editOtherProduct = editOtherProduct;

async function toggleOtherProductStatus(productId, newStatus) {
    if (!productId || !confirm(`¿Está seguro de ${newStatus ? 'activar' : 'desactivar'} este producto?`)) {
        return;
    }

    try {
        const response = await fetchWithAuth(`/products/others/${productId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ is_available: newStatus })
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        alert(`Producto ${newStatus ? 'activado' : 'desactivado'} con éxito.`);
        manageOtherProducts();

    } catch (error) {
        console.error(`[gerente/toggleProductStatus] Error:`, error);
        showGlobalError(`Error al cambiar estado: ${error.message}`);
    }
}
window.toggleOtherProductStatus = toggleOtherProductStatus;

// --- Pestaña Reportes ---
async function loadGerenteReportes() {
    // Cargar listado de reportes disponibles
    const reportsList = document.getElementById('reportes-list');
    if (!reportsList) return console.error("Elemento #reportes-list no encontrado.");

    reportsList.innerHTML = `
        <div class="report-card" onclick="runReport('ventas-diarias')">
            <h3><i class="fas fa-chart-line"></i> Ventas Diarias</h3>
            <p>Reporte de ventas por día para un periodo seleccionado</p>
        </div>
        <div class="report-card" onclick="runReport('ventas-productos')">
            <h3><i class="fas fa-shopping-cart"></i> Ventas por Producto</h3>
            <p>Análisis de ventas por tipo de producto y balón</p>
        </div>
        <div class="report-card" onclick="runReport('ranking-clientes')">
            <h3><i class="fas fa-users"></i> Ranking de Clientes</h3>
            <p>Lista de clientes clasificados por volumen de compras</p>
        </div>
        <div class="report-card" onclick="runReport('stock-almacenes')">
            <h3><i class="fas fa-warehouse"></i> Stock por Almacén</h3>
            <p>Inventario actual de cada almacén con alertas de stock bajo</p>
        </div>
        <div class="report-card" onclick="runReport('historial-ajustes')">
            <h3><i class="fas fa-history"></i> Historial de Ajustes</h3>
            <p>Registro de ajustes de inventario realizados</p>
        </div>
    `;
}

async function runReport(reportType) {
    const reportArea = document.getElementById('reporte-actual');
    if (!reportArea) return console.error("Área de reportes no encontrada.");

    reportArea.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Generando reporte...</div>';

    // Limpiar cualquier gráfico previo
    if (window.currentReportCharts) {
        window.currentReportCharts.forEach(chart => chart.destroy());
    }
    window.currentReportCharts = [];

    try {
        let reportHtml = '';
        let responseData = null;

        switch(reportType) {
            case 'ventas-diarias':
                responseData = await fetchReportData('/reports/sales', {
                    startDate: document.getElementById('report-start-date')?.value,
                    endDate: document.getElementById('report-end-date')?.value
                });
                reportHtml = displayReportData('Reporte de Ventas Diarias', responseData.data, {
                    columns: ['Fecha', 'Pedidos', 'Ventas (S/)', 'Ticket Prom.'],
                    formatter: (item) => [
                        item.order_date || 'N/A',
                        item.total_orders || '0',
                        formatCurrency(item.total_sales),
                        formatCurrency(parseFloat(item.total_sales) / (parseInt(item.total_orders) || 1))
                    ]
                });
                
                // Añadir gráfico si hay datos
                if (responseData.data && responseData.data.length > 0) {
                    reportHtml += `<div class="report-chart-container"><canvas id="report-daily-chart"></canvas></div>`;
                    setTimeout(() => setupDailySalesChart(responseData.data), 100);
                }
                break;

            case 'ventas-productos':
                responseData = await fetchReportData('/reports/product-sales', {
                    startDate: document.getElementById('report-start-date')?.value,
                    endDate: document.getElementById('report-end-date')?.value
                });
                reportHtml = displayReportData('Ventas por Producto', responseData.data, {
                    columns: ['Producto', 'Cantidad', 'Ventas (S/)', '% del Total'],
                    formatter: (item) => [
                        item.product_name || 'N/A',
                        item.quantity || '0',
                        formatCurrency(item.total_amount),
                        `${(parseFloat(item.percentage_of_total) || 0).toFixed(1)}%`
                    ]
                });
                
                // Añadir gráfico si hay datos
                if (responseData.data && responseData.data.length > 0) {
                    reportHtml += `<div class="report-chart-container"><canvas id="report-products-chart"></canvas></div>`;
                    setTimeout(() => setupProductSalesChart(responseData.data), 100);
                }
                break;

            case 'ranking-clientes':
                responseData = await fetchReportData('/reports/customer-ranking', {
                    startDate: document.getElementById('report-start-date')?.value,
                    endDate: document.getElementById('report-end-date')?.value,
                    limit: 50
                });
                reportHtml = displayReportData('Ranking de Clientes', responseData.data, {
                    columns: ['#', 'Cliente', 'Pedidos', 'Ventas (S/)', 'Última Compra'],
                    formatter: (item, index) => [
                        (index + 1),
                        item.customer_name || 'N/A',
                        item.order_count || '0',
                        formatCurrency(item.total_amount),
                        item.last_purchase_date || 'N/A'
                    ]
                });
                break;

            case 'stock-almacenes':
                responseData = await fetchReportData('/reports/warehouse-stock');
                reportHtml = displayReportData('Stock por Almacén', responseData.data, {
                    columns: ['Almacén', 'Producto', 'Tipo', 'Cantidad', 'Estado'],
                    formatter: (item) => [
                        item.warehouse_name || 'N/A',
                        item.product_name || 'N/A',
                        item.product_type === 'cylinder' ? 'Balón' : 'Otro',
                        item.stock_quantity || '0',
                        item.status_name === 'full' ? 'Lleno' : 
                            (item.status_name === 'empty' ? 'Vacío' : 
                            (item.status_name === 'damaged' ? 'Dañado' : item.status_name || 'N/A'))
                    ],
                    rowClassFn: (item) => {
                        if (item.is_low_stock) return 'warning-row';
                        if (item.status_name === 'damaged') return 'danger-row';
                        return '';
                    }
                });
                break;

            case 'historial-ajustes':
                responseData = await fetchReportData('/reports/inventory-adjustments', {
                    startDate: document.getElementById('report-start-date')?.value,
                    endDate: document.getElementById('report-end-date')?.value,
                    limit: 100
                });
                reportHtml = displayReportData('Historial de Ajustes de Inventario', responseData.data, {
                    columns: ['Fecha', 'Almacén', 'Producto', 'Tipo', 'Cantidad', 'Razón', 'Usuario'],
                    formatter: (item) => [
                        item.created_at || item.created_at_formatted || 'N/A',
                        item.warehouse_name || 'N/A',
                        item.product_name || 'N/A',
                        item.status_name === 'full' ? 'Lleno' : 
                            (item.status_name === 'empty' ? 'Vacío' : 
                            (item.status_name === 'damaged' ? 'Dañado' : item.status_name || 'N/A')),
                        (item.quantity_change > 0 ? '+' : '') + item.quantity_change,
                        item.reason || 'N/A',
                        item.created_by_name || 'N/A'
                    ],
                    rowClassFn: (item) => {
                        if (item.quantity_change < 0) return 'danger-row';
                        if (item.quantity_change > 0) return 'success-row';
                        return '';
                    }
                });
                break;

            default:
                throw new Error(`Tipo de reporte desconocido: ${reportType}`);
        }

        reportArea.innerHTML = reportHtml;

    } catch (error) {
        console.error(`[gerente/runReport] Error:`, error);
        reportArea.innerHTML = `<div class="error-message">Error generando reporte: ${error.message}</div>`;
    }
}
window.runReport = runReport;

async function fetchReportData(endpoint, params = {}) {
    // Construir query params
    const queryParams = Object.entries(params)
        .filter(([k, v]) => v) // Filtrar valores vacíos
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    
    const url = `${endpoint}${queryParams ? '?' + queryParams : ''}`;
    
    const response = await fetchWithAuth(url);
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Error ${response.status} al cargar datos del reporte`);
    }
    
    return await response.json();
}

function setupDailySalesChart(data) {
    const ctx = document.getElementById('report-daily-chart')?.getContext('2d');
    if (!ctx) return;

    const labels = data.map(d => d.order_date || d.date || 'N/A');
    const salesData = data.map(d => parseFloat(d.total_sales || 0));
    const orderData = data.map(d => parseInt(d.total_orders || 0));

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ventas (S/)',
                    data: salesData,
                    backgroundColor: 'rgba(0, 123, 255, 0.5)',
                    borderColor: 'rgb(0, 123, 255)',
                    yAxisID: 'y',
                    order: 1
                },
                {
                    label: 'Pedidos',
                    data: orderData,
                    type: 'line',
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    yAxisID: 'y1',
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    title: { display: true, text: 'Ventas (S/)' },
                    ticks: { callback: (value) => formatCurrency(value, '') }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    title: { display: true, text: 'Número de Pedidos' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                tooltip: { 
                    callbacks: { 
                        label: (context) => {
                            const label = context.dataset.label || '';
                            const value = context.raw;
                            return label + ': ' + (label.includes('Ventas') ? formatCurrency(value) : value);
                        } 
                    } 
                }
            }
        }
    });

    if (!window.currentReportCharts) window.currentReportCharts = [];
    window.currentReportCharts.push(chart);
}

function setupProductSalesChart(data) {
    const ctx = document.getElementById('report-products-chart')?.getContext('2d');
    if (!ctx) return;

    // Limitar a los 10 principales productos
    const topProducts = [...data].sort((a, b) => 
        (parseFloat(b.total_amount) || 0) - (parseFloat(a.total_amount) || 0)
    ).slice(0, 10);

    const labels = topProducts.map(d => d.product_name || 'N/A');
    const salesData = topProducts.map(d => parseFloat(d.total_amount || 0));
    const backgroundColors = [
        'rgba(54, 162, 235, 0.6)',
        'rgba(255, 99, 132, 0.6)',
        'rgba(255, 206, 86, 0.6)',
        'rgba(75, 192, 192, 0.6)',
        'rgba(153, 102, 255, 0.6)',
        'rgba(255, 159, 64, 0.6)',
        'rgba(199, 199, 199, 0.6)',
        'rgba(83, 102, 255, 0.6)',
        'rgba(40, 159, 64, 0.6)',
        'rgba(210, 199, 199, 0.6)'
    ];

    const chart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ventas por Producto',
                data: salesData,
                backgroundColor: backgroundColors,
                borderColor: 'white',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const value = context.raw;
                            const percentage = ((value / salesData.reduce((a, b) => a + b, 0)) * 100).toFixed(1);
                            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                },
                legend: {
                    position: 'right'
                }
            }
        }
    });

    if (!window.currentReportCharts) window.currentReportCharts = [];
    window.currentReportCharts.push(chart);
}

// --- Pestaña Configuración ---
async function loadGerenteConfig() {
    const form = document.getElementById('config-general-form');
    const configContainer = document.getElementById('config-container');
    if (!configContainer) return console.error('[gerente/loadConfig] Elemento #config-container no encontrado.');

    // Si ya procesamos el form, deshabilitar botón para evitar doble carga
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetchWithAuth('/configuration');
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar configuración`);
        }
        const config = await response.json();

        // Establecer configuración global cargada
        setGlobalConfigState(config);

        // Actualizar los valores en el formulario si existe
        if (form) {
            const elements = form.elements;
            if (elements['company_name']) elements['company_name'].value = config.company_name || '';
            if (elements['address']) elements['address'].value = config.address || '';
            if (elements['phone']) elements['phone'].value = config.phone || '';
            if (elements['email']) elements['email'].value = config.email || '';
            if (elements['ruc']) elements['ruc'].value = config.ruc || '';
            if (elements['loyalty_points_ratio']) elements['loyalty_points_ratio'].value = config.loyalty_points_ratio || '';
            if (elements['time_between_orders_mins']) elements['time_between_orders_mins'].value = config.time_between_orders_mins || '';
            if (elements['whatsapp_number']) elements['whatsapp_number'].value = config.whatsapp_number || '';
            if (elements['benefits_description']) elements['benefits_description'].value = config.benefits_description || '';
            if (elements['points_min_redeem']) elements['points_min_redeem'].value = config.points_min_redeem || '';
            if (elements['points_discount_value']) elements['points_discount_value'].value = config.points_discount_value || '';
            if (elements['points_per_sol']) elements['points_per_sol'].value = config.points_per_sol || '';
            
            // Asegurar que el listener está adjunto (solo una vez)
            if (!form._hasConfigListener) {
                form.addEventListener('submit', handleSaveConfig);
                form._hasConfigListener = true;
            }
            
            // Reactivar botón
            if (submitBtn) submitBtn.disabled = false;
        }

        // Cargar mantenimiento de almacenes
        await loadWarehouses();

    } catch (error) {
        console.error('[gerente/loadConfig] Error:', error);
        if (configContainer) {
            configContainer.innerHTML = `<div class="error-message">Error al cargar configuración: ${error.message}</div>`;
        }
    }
}

async function handleSaveConfig(event) {
    event.preventDefault();
    const form = event.target;
    const errorDiv = document.getElementById('config-form-error');
    const submitButton = form.querySelector('button[type="submit"]');

    if (!errorDiv || !submitButton) return;
    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const formData = new FormData(form);
        const dataToSend = Object.fromEntries(formData.entries());
        
        // Convertir a números los campos que son numéricos
        if (dataToSend.loyalty_points_ratio) {
            dataToSend.loyalty_points_ratio = parseFloat(dataToSend.loyalty_points_ratio);
        }
        if (dataToSend.time_between_orders_mins) {
            dataToSend.time_between_orders_mins = parseInt(dataToSend.time_between_orders_mins);
        }
        if (dataToSend.points_min_redeem) {
            dataToSend.points_min_redeem = parseInt(dataToSend.points_min_redeem);
        }
        if (dataToSend.points_discount_value) {
            dataToSend.points_discount_value = parseFloat(dataToSend.points_discount_value);
        }
        if (dataToSend.points_per_sol) {
            dataToSend.points_per_sol = parseFloat(dataToSend.points_per_sol);
        }

        const response = await fetchWithAuth('/configuration', {
            method: 'PUT',
            body: JSON.stringify(dataToSend)
        });
        
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        const result = await response.json();

        setGlobalConfigState(result.config || result);
        alert("Configuración guardada con éxito.");

    } catch (error) {
        console.error('[gerente/saveConfig] Error:', error);
        errorDiv.textContent = `Error al guardar: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Configuración';
    }
}

async function loadWarehouses() {
    const tableBody = document.querySelector('#warehouses-table tbody');
    if (!tableBody) return console.error('Tabla #warehouses-table tbody no encontrada.');

    tableBody.innerHTML = '<tr><td colspan="5"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div></td></tr>';

    try {
        const response = await fetchWithAuth('/warehouses');
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar almacenes`);
        }
        const warehouses = await response.json();

        tableBody.innerHTML = '';

        if (warehouses.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay almacenes registrados.</td></tr>';
            return;
        }

        warehouses.forEach(wh => {
            const statusTagHTML = formatStatusTag(wh.is_active ? 'activo' : 'inactivo');
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${wh.warehouse_id}</td>
                <td>${wh.name || 'N/A'}</td>
                <td>${wh.address || 'N/A'}</td>
                <td>${statusTagHTML}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" title="Editar" onclick="openEditWarehouseModal(${wh.warehouse_id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn ${wh.is_active ? 'btn-warning' : 'btn-success'} btn-sm" title="${wh.is_active ? 'Desactivar' : 'Activar'}"
                            onclick="toggleWarehouseStatus(${wh.warehouse_id}, ${!wh.is_active})">
                        <i class="fas ${wh.is_active ? 'fa-ban' : 'fa-check'}"></i>
                    </button>
                </td>`;

            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('[gerente/loadWarehouses] Error:', error);
        tableBody.innerHTML = `<tr><td colspan="5"><div class="error-message">Error: ${error.message}</div></td></tr>`;
    }
}

async function openCreateWarehouseModal() {
    const modalId = 'warehouse-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return showGlobalError("Error: Modal de almacén no encontrado.");

    modalContent.innerHTML = `
        <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
        <h2><i class="fas fa-plus"></i> Nuevo Almacén</h2>
        <form id="warehouse-form">
            <div class="input-group">
                <label for="wh-name">Nombre:</label>
                <input type="text" id="wh-name" name="name" required>
            </div>
            <div class="input-group">
                <label for="wh-address">Dirección:</label>
                <input type="text" id="wh-address" name="address" required>
            </div>
            <div class="input-group">
                <label for="wh-coords">Coordenadas (Lat, Long):</label>
                <input type="text" id="wh-coords" name="coordinates" placeholder="Ej: -12.0464,-77.0428">
            </div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Crear Almacén</button>
            <div id="warehouse-form-error" class="error-message"></div>
        </form>
    `;

    const form = modalContent.querySelector('#warehouse-form');
    if (form) {
        form.addEventListener('submit', handleSaveWarehouse);
    }

    openModal(modalId);
}
window.openCreateWarehouseModal = openCreateWarehouseModal;

async function openEditWarehouseModal(warehouseId) {
    if (!warehouseId) return;
    const modalId = 'warehouse-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    if (!modal || !modalContent) return showGlobalError("Error: Modal de almacén no encontrado.");

    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    openModal(modalId);

    try {
        const response = await fetchWithAuth(`/warehouses/${warehouseId}`);
        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            throw new Error(errData.message || `Error ${response.status} al cargar datos del almacén`);
        }
        const wh = await response.json();

        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2><i class="fas fa-edit"></i> Editar Almacén</h2>
            <form id="warehouse-form">
                <input type="hidden" name="warehouse_id" value="${warehouseId}">
                <div class="input-group">
                    <label for="wh-name">Nombre:</label>
                    <input type="text" id="wh-name" name="name" value="${wh.name || ''}" required>
                </div>
                <div class="input-group">
                    <label for="wh-address">Dirección:</label>
                    <input type="text" id="wh-address" name="address" value="${wh.address || ''}" required>
                </div>
                <div class="input-group">
                    <label for="wh-coords">Coordenadas (Lat, Long):</label>
                    <input type="text" id="wh-coords" name="coordinates" value="${wh.coordinates || ''}" placeholder="Ej: -12.0464,-77.0428">
                </div>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Actualizar Almacén</button>
                <div id="warehouse-form-error" class="error-message"></div>
            </form>
        `;

        const form = modalContent.querySelector('#warehouse-form');
        if (form) {
            form.addEventListener('submit', handleSaveWarehouse);
        }

    } catch (error) {
        console.error(`[gerente/openEditWarehouse] Error:`, error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Editar Almacén</h2>
            <p class="error-message">Error: ${error.message}</p>
            <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.openEditWarehouseModal = openEditWarehouseModal;

async function handleSaveWarehouse(event) {
    event.preventDefault();
    const form = event.target;
    const errorDiv = document.getElementById('warehouse-form-error');
    const submitButton = form.querySelector('button[type="submit"]');
    const warehouseId = form.elements.warehouse_id?.value;
    const isEdit = !!warehouseId;
    const modalId = 'warehouse-modal';

    if (!errorDiv || !submitButton) return;
    
    // Validación básica
    const name = form.elements.name.value.trim();
    const address = form.elements.address.value.trim();
    
    if (!name || !address) {
        errorDiv.textContent = 'Nombre y dirección son requeridos.';
        return;
    }
    
   // Validar formato de coordenadas si hay algo
   const coords = form.elements.coordinates.value.trim();
   if (coords) {
       const coordsPattern = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;
       if (!coordsPattern.test(coords)) {
           errorDiv.textContent = 'Formato de coordenadas inválido. Use: latitud,longitud (Ej: -12.0464,-77.0428)';
           return;
       }
   }
   
   errorDiv.textContent = '';
   submitButton.disabled = true;
   submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

   const formData = new FormData(form);
   const dataToSend = {
       name: formData.get('name'),
       address: formData.get('address'),
       coordinates: formData.get('coordinates') || null,
       is_active: true // Por defecto activo para nuevos
   };

   try {
       const response = await fetchWithAuth(`/warehouses${isEdit ? `/${warehouseId}` : ''}`, {
           method: isEdit ? 'PUT' : 'POST',
           body: JSON.stringify(dataToSend)
       });
       
       if (!response.ok) {
           const result = await response.json().catch(() => ({}));
           throw new Error(result.message || `Error ${response.status}`);
       }
       
       const result = await response.json();

       alert(`Almacén ${isEdit ? 'actualizado' : 'creado'} con éxito.`);
       closeModal(modalId);
       loadWarehouses();

   } catch (error) {
       console.error(`[gerente/saveWarehouse] Error:`, error);
       errorDiv.textContent = `Error al guardar: ${error.message}`;
   } finally {
       submitButton.disabled = false;
       submitButton.innerHTML = `<i class="fas fa-save"></i> ${isEdit ? 'Actualizar' : 'Crear'} Almacén`;
   }
}

async function toggleWarehouseStatus(warehouseId, newStatus) {
   if (!warehouseId || !confirm(`¿Estás seguro de ${newStatus ? 'activar' : 'desactivar'} este almacén?`)) {
       return;
   }

   try {
       const response = await fetchWithAuth(`/warehouses/${warehouseId}/status`, {
           method: 'PUT',
           body: JSON.stringify({ is_active: newStatus })
       });
       
       if (!response.ok) {
           const result = await response.json().catch(() => ({}));
           throw new Error(result.message || `Error ${response.status}`);
       }
       
       const result = await response.json();

       alert(`Almacén ${newStatus ? 'activado' : 'desactivado'} con éxito.`);
       loadWarehouses();

   } catch (error) {
       console.error(`[gerente/toggleWarehouseStatus] Error:`, error);
       showGlobalError(`Error al cambiar estado: ${error.message}`);
   }
}
window.toggleWarehouseStatus = toggleWarehouseStatus;

// --- Inicialización ---
function setupEventHandlers() {
   // Setup de datos iniciales de fecha para reportes
   const today = new Date();
   const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
   
   const startDateInput = document.getElementById('report-start-date');
   const endDateInput = document.getElementById('report-end-date');
   
   if (startDateInput) {
       startDateInput.valueAsDate = firstDayOfMonth;
   }
   if (endDateInput) {
       endDateInput.valueAsDate = today;
   }

   // Setup de selección de almacén para inventario
   const warehouseSelector = document.getElementById('inventario-warehouse-selector');
   if (warehouseSelector) {
       populateWarehouseSelectors(warehouseSelector.parentElement);
       warehouseSelector.addEventListener('change', loadGerenteInventarioData);
   }

   // Setup de búsqueda de clientes
   const searchButton = document.getElementById('cliente-search-btn');
   if (searchButton) {
       searchButton.addEventListener('click', handleGerenteClienteSearch);
   }
   const searchInput = document.getElementById('cliente-search');
   if (searchInput) {
       searchInput.addEventListener('keypress', handleGerenteClienteSearch);
   }
}

function setupTabHandlers() {
   const gerente_tabs = {
       'tab-kpis': loadGerenteKPIs,
       'tab-clientes': loadGerenteClientes,
       'tab-empleados': loadGerenteUsers,
       'tab-inventario': loadGerenteInventarioData,
       'tab-reportes': loadGerenteReportes,
       'tab-configuracion': loadGerenteConfig
   };

   for (const [tabId, loadFn] of Object.entries(gerente_tabs)) {
       const tab = document.getElementById(tabId);
       if (tab) {
           tab.addEventListener('click', loadFn);
       }
   }
}

// Inicialización
async function setupGerenteDashboard() {
   console.log('[gerente.js] Iniciando módulo de gerente...');
   const styleElement = document.createElement('style');
    styleElement.textContent = `
        .tab-nav {
            position: sticky;
            top: 0;
            z-index: 100;
            background-color: #fff;
            border-bottom: 1px solid #dee2e6;
            margin-bottom: 15px;
        }
        .card canvas {
            max-height: 300px;
        }
        .report-chart-container {
            height: 300px;
            position: relative;
            margin-top: 20px;
            margin-bottom: 20px;
        }
        #monthly-sales-chart {
            max-height: 300px !important;
        }
    `;
    document.head.appendChild(styleElement);
    
    setupEventHandlers();
    setupTabHandlers();
   
   // Inicialmente cargar KPIs
   try {
       // Obtener usuario actual
       const currentUser = getCurrentUser();
       if (!currentUser || currentUser.role !== 'gerente') {
           throw new Error("Solo usuarios con rol de gerente pueden acceder a este módulo");
       }

       // Obtener almacén seleccionado (si hay uno)
       const warehouseId = getSelectedWarehouseId();
       
       // Cargar KPIs y gráfico
       await Promise.all([
           loadGerenteKPIs(),
           setupMonthlySalesChart()
       ]);
   } catch (error) {
       console.error('[gerente/init] Error:', error);
       showGlobalError("Error inicializando módulo de gerente: " + error.message);
   }
}

// Exportar funciones públicas
export default {
   setupGerenteDashboard,
   loadGerenteKPIs,
   loadGerenteClientes,
   loadGerenteUsers,
   loadGerenteInventarioData,
   loadGerenteReportes,
   loadGerenteConfig
};