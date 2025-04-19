// ==================================
// js/roles/cliente.js
// Lógica específica para el dashboard del Cliente (v7 - Errores corregidos)
// ==================================
console.log('[cliente.js] Módulo cargado. v7');

// --- Importaciones ---
import { fetchWithAuth } from '../modules/api.js';
import { getCurrentUser, getGlobalConfigState, setCurrentCylinderTypes, getCurrentCylinderTypes, setCurrentOtherProducts, getCurrentOtherProducts } from '../modules/state.js';
import { openModal, closeModal, showGlobalError, updateHeaderUserInfo } from '../modules/ui.js';
import { formatCurrency, formatStatusTag } from '../modules/utils.js';

// --- Funciones Específicas del Rol Cliente ---

/**
 * Carga y puebla las opciones de tipos de cilindros y otros productos para el formulario de pedido
 * @returns {Promise<void>}
 */
async function populateClienteOrderOptions() {
    console.log("[cliente/populateOrderOptions v7] Poblando opciones...");
    const tipoBalonSelect = document.getElementById('pedido-tipo-balon');
    const otrosProductosDiv = document.getElementById('otros-productos-list');

    // Salir temprano si los elementos base no existen
    if (!tipoBalonSelect || !otrosProductosDiv) {
        console.error("CRITICAL [cliente/populateOrderOptions]: Elementos #pedido-tipo-balon o #otros-productos-list no encontrados!");
        return;
    }

    // Mostrar estado de carga
    tipoBalonSelect.innerHTML = '<option value="">Cargando...</option>';
    otrosProductosDiv.innerHTML = '<p>Cargando productos...</p>';

    try {
        // Obtener Tipos de Cilindro y Otros Productos en paralelo para mayor eficiencia
        const [cylinderResponse, otherProductsResponse] = await Promise.all([
            fetchWithAuth('/products/cylinders'),
            fetchWithAuth('/products/others')
        ]);

        // Manejar respuesta de tipos de cilindro
        if (!cylinderResponse.ok) { 
            const data = await cylinderResponse.json().catch(() => ({}));
            throw new Error(data.message || `Error ${cylinderResponse.status} al cargar balones`);
        }
        const cylinderTypes = await cylinderResponse.json();
        setCurrentCylinderTypes(cylinderTypes);

        // Manejar respuesta de otros productos
        if (!otherProductsResponse.ok) { 
            const data = await otherProductsResponse.json().catch(() => ({}));
            throw new Error(data.message || `Error ${otherProductsResponse.status} al cargar otros productos`);
        }
        const otherProducts = await otherProductsResponse.json();
        setCurrentOtherProducts(otherProducts);

        // Poblar selector de tipos de cilindro
        if (tipoBalonSelect) {
            tipoBalonSelect.innerHTML = '<option value="" disabled selected>-- Seleccione Tipo --</option>';
            cylinderTypes.forEach(type => {
                if (type.is_available) {
                    const option = document.createElement('option');
                    option.value = type.cylinder_type_id;
                    option.dataset.priceExchange = type.price_exchange;
                    option.dataset.priceNew = type.price_new;
                    option.dataset.priceLoan = type.price_loan || type.price_new;
                    option.textContent = `${type.name} (${formatCurrency(type.price_exchange)} Intercambio)`;
                    tipoBalonSelect.appendChild(option);
                }
            });
            console.log("[cliente/populateOrderOptions v7] Selector de balón poblado.");
        }

        // Poblar lista de otros productos
        if (otrosProductosDiv) {
            otrosProductosDiv.innerHTML = ''; // Limpiar
            
            if (!otherProducts.some(p => p.is_available)) {
                otrosProductosDiv.innerHTML = '<p>No hay otros productos disponibles.</p>';
            } else {
                otherProducts.forEach(prod => {
                    if (prod.is_available) {
                        const itemDiv = document.createElement('div');
                        itemDiv.classList.add('producto-item');
                        itemDiv.innerHTML = `
                            <input type="checkbox" id="otro-${prod.product_id}" name="other_product_ids" value="${prod.product_id}" 
                                data-price="${prod.price}" data-target-qty="otro-qty-${prod.product_id}" 
                                onchange="window.toggleProductQuantityInput(this, ${prod.product_id})">
                            <label for="otro-${prod.product_id}">${prod.name} (${formatCurrency(prod.price)} / ${prod.stock_unit || 'unidad'})</label>
                            <input type="number" id="otro-qty-${prod.product_id}" name="other_product_qtys[${prod.product_id}]" 
                                value="1" min="1" style="display:none;" onchange="window.updatePedidoPriceEstimate()">
                        `;
                        otrosProductosDiv.appendChild(itemDiv);
                    }
                });
                console.log("[cliente/populateOrderOptions v7] Otros productos poblados.");
            }
        }

        // Actualizar precio estimado inicial
        updatePedidoPriceEstimate();
        console.log("[cliente/populateOrderOptions v7] Opciones cargadas OK.");

    } catch (error) {
        console.error("[cliente/populateOrderOptions v7] Error:", error);
        if (tipoBalonSelect) tipoBalonSelect.innerHTML = '<option value="">Error al cargar</option>';
        if (otrosProductosDiv) otrosProductosDiv.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
        showGlobalError(`Error cargando opciones de pedido: ${error.message}`);
    }
}

/**
 * Obtiene el precio específico para un cliente según el tipo de producto y acción
 * @param {number} itemId - ID del producto o cilindro
 * @param {string} itemType - Tipo de ítem ('cylinder' o 'other_product')
 * @param {string} actionType - Tipo de acción para cilindros ('exchange', 'new_purchase', 'loan_purchase')
 * @returns {number} - Precio calculado
 */
function getCustomerPrice(itemId, itemType, actionType = 'exchange') {
    if (itemType === 'cylinder') {
        const cylinder = getCurrentCylinderTypes().find(c => c.cylinder_type_id == itemId);
        if (!cylinder) return 0;
        
        switch (actionType) {
            case 'new_purchase': return parseFloat(cylinder.price_new) || 0;
            case 'loan_purchase': return parseFloat(cylinder.price_loan || cylinder.price_new) || 0;
            default: return parseFloat(cylinder.price_exchange) || 0;
        }
    } else if (itemType === 'other_product') {
        const product = getCurrentOtherProducts().find(p => p.product_id == itemId);
        return parseFloat(product?.price) || 0;
    }
    return 0;
}

/**
 * Muestra/oculta el campo de cantidad cuando se marca/desmarca un producto
 * @param {HTMLElement} checkbox - El checkbox que fue clickeado
 * @param {number} productId - ID del producto
 */
function toggleProductQuantityInput(checkbox, productId) {
    const qtyInput = document.getElementById(`otro-qty-${productId}`);
    if (qtyInput) {
        qtyInput.style.display = checkbox.checked ? 'inline-block' : 'none';
        if (!checkbox.checked) qtyInput.value = '1';
        updatePedidoPriceEstimate();
    }
}
window.toggleProductQuantityInput = toggleProductQuantityInput;

/**
 * Actualiza el precio estimado en tiempo real según las selecciones del usuario
 */
function updatePedidoPriceEstimate() {
    const tipoBalonSelect = document.getElementById('pedido-tipo-balon');
    const accionBalonSelect = document.getElementById('pedido-accion-balon');
    const cantidadBalonInput = document.getElementById('pedido-cantidad-balon');
    const precioEstimadoSpan = document.getElementById('pedido-precio-estimado');
    const otrosProductosDiv = document.getElementById('otros-productos-list');
    
    if (!tipoBalonSelect || !accionBalonSelect || !cantidadBalonInput || !precioEstimadoSpan) return;
    
    let totalEstimado = 0;
    const selectedOption = tipoBalonSelect.options[tipoBalonSelect.selectedIndex];
    const cantidadBalones = parseInt(cantidadBalonInput.value) || 0;
    const accion = accionBalonSelect.value;
    const cylinderTypeId = selectedOption?.value;
    
    // Cálculo para cilindro seleccionado
    if (cylinderTypeId && cantidadBalones > 0) {
        totalEstimado += getCustomerPrice(cylinderTypeId, 'cylinder', accion) * cantidadBalones;
    }
    
    // Cálculo para otros productos marcados
    if (otrosProductosDiv) {
        otrosProductosDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            const qtyInput = document.getElementById(cb.dataset.targetQty);
            const quantity = parseInt(qtyInput?.value) || 0;
            if (quantity > 0) {
                totalEstimado += getCustomerPrice(cb.value, 'other_product') * quantity;
            }
        });
    }
    
    // Actualizar UI
    precioEstimadoSpan.textContent = formatCurrency(totalEstimado);
}
window.updatePedidoPriceEstimate = updatePedidoPriceEstimate;

/**
 * Maneja el envío del formulario de pedido
 * @param {Event} event - Evento de submit del formulario
 */
async function handlePedidoSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const statusDiv = document.getElementById('pedido-status');
    const submitButton = form.querySelector('button[type="submit"]');
    
    if (!statusDiv || !submitButton) return;
    
    // Actualizar UI para indicar envío en progreso
    statusDiv.textContent = 'Enviando...'; 
    statusDiv.className = 'status-message info';
    submitButton.disabled = true; 
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    
    try {
        // Construir datos del pedido
        const formData = new FormData(form);
        const cylinderTypeId = formData.get('cylinder_type_id');
        const cylinderQuantity = parseInt(formData.get('cylinder_quantity')) || 0;
        
        // Validar que hay al menos un producto seleccionado
        let hasOtherItems = false;
        const otherItems = [];
        form.querySelectorAll('#otros-productos-list input[type="checkbox"]:checked').forEach(cb => {
            const qtyInput = form.querySelector(`input[name="other_product_qtys[${cb.value}]"]`);
            const quantity = parseInt(qtyInput?.value) || 0;
            if (quantity > 0) {
                hasOtherItems = true;
                otherItems.push({ product_id: parseInt(cb.value), quantity });
            }
        });

        if (cylinderQuantity <= 0 && !hasOtherItems) {
            statusDiv.textContent = 'Error: Debe seleccionar al menos un balón u otro producto.';
            statusDiv.className = 'status-message error';
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Pedido';
            return;
        }
        
        const orderData = {
            cylinder_type_id: cylinderTypeId || null,
            action_type: cylinderTypeId ? formData.get('action_type') : null,
            cylinder_quantity: cylinderQuantity,
            delivery_address_text: formData.get('delivery_address_text'),
            delivery_instructions: formData.get('delivery_instructions') || null,
            other_items: otherItems
        };
        
        console.log("[cliente/handlePedidoSubmit] Enviando:", orderData);
        
        // Enviar pedido al backend
        const response = await fetchWithAuth('/orders', { 
            method: 'POST', 
            body: JSON.stringify(orderData) 
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        // Mostrar éxito y resetear formulario
        statusDiv.textContent = `¡Pedido #${result.orderId} enviado correctamente!`;
        statusDiv.className = 'status-message success';
        form.reset();
        
        // Limpiar campos de cantidad y actualizar listados
        form.querySelectorAll('#otros-productos-list input[type="number"]').forEach(inp => inp.style.display = 'none');
        updatePedidoPriceEstimate();
        loadClienteHistorial();
        
    } catch (error) {
        console.error("[cliente/handlePedidoSubmit] Error:", error);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.className = 'status-message error';
    } finally {
        // Restaurar estado del botón
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Pedido';
    }
}

/**
 * Carga el historial de pedidos del cliente
 * @returns {Promise<void>}
 */
async function loadClienteHistorial() {
    console.log("[cliente/loadHistorial v7] Cargando historial...");
    
    // Buscar tabla después de un micro-delay para asegurar que el DOM está listo
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const table = document.getElementById('cliente-historial-table');
    if (!table) {
        console.error("Error CRÍTICO: Tabla #cliente-historial-table NO encontrada en el DOM!");
        return;
    }
    
    const tableBody = table.querySelector('tbody');
    if (!tableBody) {
        console.error("Error CRÍTICO: TBODY de #cliente-historial-table NO encontrado!");
        return;
    }
    
    // Mostrar placeholder de carga
    tableBody.innerHTML = '<tr><td colspan="5"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando historial...</div></td></tr>';
    
    try {
        // Obtener historial del cliente
        const response = await fetchWithAuth('/orders/my-history');
        
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Error ${response.status}`);
        }
        
        const history = await response.json();
        console.log(`[cliente/loadHistorial v7] ${history.length} pedidos recibidos.`);
        
        // Volver a verificar el elemento tbody
        const currentTableBody = document.getElementById('cliente-historial-table')?.querySelector('tbody');
        if (!currentTableBody) {
            console.error("Error CRÍTICO: TBODY desapareció durante fetch!");
            return;
        }
        
        // Limpiar cuerpo de la tabla
        currentTableBody.innerHTML = '';
        
        // Mensaje si no hay pedidos
        if (history.length === 0) {
            currentTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay pedidos en su historial.</td></tr>';
            return;
        }
        
        // Poblar tabla con los datos
        history.forEach(order => {
            // Formatear fecha si existe
            let formattedDate = 'N/A';
            try {
                if (order.order_date) {
                    formattedDate = new Date(order.order_date).toLocaleDateString('es-PE', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                    });
                }
            } catch (e) {
                console.warn("Error al formatear fecha:", e);
            }
            
            // Crear fila para el pedido
            const row = currentTableBody.insertRow();
            row.innerHTML = `
                <td>${formattedDate}</td>
                <td>#${order.order_id}</td>
                <td>${formatStatusTag(order.order_status)}<br>${formatStatusTag(order.payment_status)}</td>
                <td>${formatCurrency(order.total_amount)}</td>
                <td class="actions-cell"></td>
            `;
            
            // Añadir botones de acción dinámicamente
            const actionsCell = row.querySelector('.actions-cell');
            if (actionsCell) {
                // Botón Ver Detalle (siempre presente)
                const viewBtn = document.createElement('button');
                viewBtn.className = 'btn btn-info btn-sm';
                viewBtn.title = 'Ver Detalle';
                viewBtn.innerHTML = '<i class="fas fa-eye"></i>';
                viewBtn.onclick = () => viewOrderDetails(order.order_id);
                actionsCell.appendChild(viewBtn);
                
                // Botón Descargar Recibo (solo si hay recibo disponible)
                if (order.receipt_url) {
                    const dlBtn = document.createElement('button');
                    dlBtn.className = 'btn btn-secondary btn-sm';
                    dlBtn.title = 'Descargar Recibo';
                    dlBtn.innerHTML = '<i class="fas fa-receipt"></i>';
                    dlBtn.onclick = () => downloadReceipt(order.receipt_url);
                    actionsCell.appendChild(dlBtn);
                }
                
                // Botón Ir a Pagar (solo si pago pendiente)
                if (order.payment_status === 'pending' || order.payment_status === 'partially_paid') {
                    const payBtn = document.createElement('button');
                    payBtn.className = 'btn btn-warning btn-sm';
                    payBtn.title = 'Ir a Pagar';
                    payBtn.innerHTML = '<i class="fas fa-dollar-sign"></i>';
                    payBtn.onclick = () => goToPaymentSection();
                    actionsCell.appendChild(payBtn);
                }
                
                // Botón Cancelar (solo si pedido en estado inicial)
                if (order.order_status === 'pending_approval' || order.order_status === 'pending_assignment') {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn btn-danger btn-sm';
                    cancelBtn.title = 'Cancelar';
                    cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
                    cancelBtn.onclick = () => cancelClientOrder(order.order_id);
                    actionsCell.appendChild(cancelBtn);
                }
            } else {
                console.warn("No se encontró celda de acciones para pedido:", order.order_id);
            }
        });
        
        console.log("[cliente/loadHistorial v7] Historial cargado OK.");
        
    } catch (error) {
        console.error("[cliente/loadHistorial v7] Error:", error);
        const finalTableBody = document.getElementById('cliente-historial-table')?.querySelector('tbody');
        if (finalTableBody) {
            finalTableBody.innerHTML = `<tr><td colspan="5" class="error-message">Error al cargar historial: ${error.message}</td></tr>`;
        }
    }
}

/**
 * Abre el recibo de un pedido en una nueva ventana
 * @param {string} relativeUrl - URL relativa del recibo
 */
function downloadReceipt(relativeUrl) {
    console.log(`[cliente/downloadReceipt] URL: ${relativeUrl}`);
    if (!relativeUrl) {
        showGlobalError("No se encontró el recibo para descargar.");
        return;
    }
    
    // Construir URL completa con base en la ubicación actual
    const baseURL = window.location.origin;
    window.open(baseURL + relativeUrl, '_blank', 'noopener,noreferrer');
}
window.downloadReceipt = downloadReceipt;

/**
 * Maneja la vista previa del comprobante antes de subir
 * @param {Event} event - Evento change del input file
 */
function handleComprobantePreview(event) {
    const file = event.target.files[0];
    const previewImg = document.getElementById('comprobante-preview');
    const statusDiv = document.getElementById('upload-status');
    
    // Limpiar estado previo
    if (statusDiv) statusDiv.textContent = '';
    
    if (!previewImg) {
        console.error("[cliente/handleComprobantePreview] Elemento #comprobante-preview no encontrado");
        return;
    }
    
    // Ocultar preview si no hay archivo
    if (!file) {
        previewImg.style.display = 'none';
        previewImg.src = '#';
        return;
    }
    
    // Validar que sea imagen
    if (!file.type.startsWith('image/')) {
        if (statusDiv) {
            statusDiv.textContent = 'Por favor, seleccione un archivo de imagen válido.';
            statusDiv.className = 'status-message error';
        }
        event.target.value = ''; // Limpiar selección
        previewImg.style.display = 'none';
        return;
    }
    
    // Mostrar vista previa
    const reader = new FileReader();
    reader.onload = function(e) {
        previewImg.src = e.target.result;
        previewImg.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

/**
 * Sube comprobante de pago al servidor
 * @returns {Promise<void>}
 */
async function uploadPaymentProof() {
    console.log("[cliente/uploadPaymentProof] Iniciando subida de comprobante...");
    const fileInput = document.getElementById('payment-proof-input');
    const statusDiv = document.getElementById('upload-status');
    const previewImg = document.getElementById('comprobante-preview');
    
    if (!fileInput || !statusDiv) {
        console.error("Error: Elementos necesarios no encontrados.");
        return;
    }
    
    const file = fileInput.files[0];
    if (!file) {
        statusDiv.textContent = 'Por favor, seleccione un archivo para subir.';
        statusDiv.className = 'status-message error';
        return;
    }
    
    // Validar tipo de archivo (debe ser imagen)
    if (!file.type.startsWith('image/')) {
        statusDiv.textContent = 'Por favor, seleccione un archivo de imagen válido.';
        statusDiv.className = 'status-message error';
        return;
    }
    
    // Mostrar estado de carga
    statusDiv.textContent = 'Subiendo comprobante...';
    statusDiv.className = 'status-message info';
    
    try {
        // Preparar FormData para envío
        const formData = new FormData();
        formData.append('paymentProof', file);
        
        // Enviar comprobante
        const response = await fetchWithAuth('/payments/proof', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        // Mostrar éxito y limpiar campos
        statusDiv.textContent = '¡Comprobante subido con éxito! Será verificado por nuestro equipo.';
        statusDiv.className = 'status-message success';
        fileInput.value = '';
        if (previewImg) {
            previewImg.style.display = 'none';
            previewImg.src = '#';
        }
        
        // Recargar estado del pago si es necesario
        const pagoEstadoSpan = document.getElementById('pago-estado');
        if (pagoEstadoSpan) {
            pagoEstadoSpan.textContent = 'Enviado - Pendiente Verificación';
            pagoEstadoSpan.className = 'status-tag status-assigned';
        }
        
    } catch (error) {
        console.error("[cliente/uploadPaymentProof] Error:", error);
        statusDiv.textContent = `Error al subir: ${error.message}`;
        statusDiv.className = 'status-message error';
    }
}
window.uploadPaymentProof = uploadPaymentProof;

/**
 * Copia el código de referido al portapapeles
 */
function copyReferralCode() {
    const codeSpan = document.getElementById('cliente-ref-code');
    if (!codeSpan) {
        console.error("[cliente/copyReferralCode] Elemento #cliente-ref-code no encontrado");
        return;
    }
    
    const code = codeSpan.textContent.trim();
    
    // Usar API moderna de portapapeles si está disponible
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code)
            .then(() => alert(`Código ${code} copiado al portapapeles.`))
            .catch(err => {
                console.error("[cliente/copyReferralCode] Error al copiar:", err);
                alert("No se pudo copiar automáticamente. Código: " + code);
            });
    } else {
        // Fallback para navegadores más antiguos
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (successful) {
                alert(`Código ${code} copiado al portapapeles.`);
            } else {
                throw new Error("Comando de copia falló");
            }
        } catch (err) {
            console.error("[cliente/copyReferralCode] Error fallback:", err);
            document.body.removeChild(textarea);
            alert("No se pudo copiar automáticamente. Código: " + code);
        }
    }
}
window.copyReferralCode = copyReferralCode;

/**
 * Comparte el código de referido por WhatsApp u otras redes
 */
function shareReferralCode() {
    const codeSpan = document.getElementById('cliente-ref-code');
    if (!codeSpan) {
        console.error("[cliente/shareReferralCode] Elemento #cliente-ref-code no encontrado");
        return;
    }
    
    const code = codeSpan.textContent.trim();
    const configState = getGlobalConfigState();
    const whatsappNumber = configState.whatsapp_number;
    
    // Tener en cuenta que podría no haber número configurado
    if (!whatsappNumber) {
        alert(`¡Comparte tu código de referido ${code} con tus amigos para que ambos ganen puntos!`);
        return;
    }
    
    // Construir mensaje para compartir
    const message = encodeURIComponent(
        `¡Hola! Te invito a usar Gas ERP Ayacucho. Regístrate con mi código de referido ${code} y ambos ganaremos puntos para descuentos. ¡Descarga la app aquí [LINK APP]!`
    );
    
    // Abrir WhatsApp web
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
}
window.shareReferralCode = shareReferralCode;

/**
 * Muestra el modal con información de beneficios
 */
function showBenefitsModal() {
    console.log("[cliente/showBenefitsModal] Mostrando modal de beneficios...");
    const modalId = 'benefits-modal';
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal #${modalId} no encontrado.`);
        return;
    }
    
    // Actualizar contenido del modal con información actual
    const benefitsDescription = getGlobalConfigState().benefits_description || "Información no disponible.";
    const modalContent = modal.querySelector('.modal-content p');
    if (modalContent) {
        modalContent.innerHTML = benefitsDescription;
    }
    
    // Abrir el modal
    openModal(modalId);
}
window.showBenefitsModal = showBenefitsModal;

/**
 * Abre el modal para editar perfil de cliente
 * @returns {Promise<void>}
 */
async function openEditProfileModal() {
    console.log("[cliente/openEditProfileModal] Abriendo modal de edición...");
    const modalId = 'edit-profile-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    
    if (!modal || !modalContent) {
        console.error(`Modal #${modalId} no encontrado.`);
        return;
    }
    
    // Mostrar placeholder de carga
    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando datos...</div>';
    openModal(modalId);
    
    try {
        // Obtener datos actuales del usuario
        const response = await fetchWithAuth('/users/me');
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Error ${response.status}`);
        }
        
        const userData = await response.json();
        console.log("[cliente/openEditProfileModal] Datos obtenidos:", userData);
        
        // Crear formulario con datos actuales
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2><i class="fas fa-user-edit"></i> Editar Mi Perfil</h2>
            <form id="edit-profile-form">
                <div class="input-group">
                    <label for="edit-fullname">Nombre Completo:</label>
                    <input type="text" id="edit-fullname" name="full_name" value="${userData.full_name || ''}" required>
                </div>
                <div class="input-group">
                    <label for="edit-cell1">Teléfono Principal:</label>
                    <input type="tel" id="edit-cell1" name="phone_number_primary" value="${userData.phone_number_primary || ''}" required>
                </div>
                <div class="input-group">
                    <label for="edit-cell2">Teléfono Secundario (Opcional):</label>
                    <input type="tel" id="edit-cell2" name="phone_number_secondary" value="${userData.phone_number_secondary || ''}">
                </div>
                <div class="input-group">
                    <label for="edit-email">Email (Opcional):</label>
                    <input type="email" id="edit-email" name="email" value="${userData.email || ''}">
                </div>
                
                <h3>Datos Adicionales</h3>
                
                <div class="input-group">
                    <label for="edit-address">Dirección Principal:</label>
                    <textarea id="edit-address" name="details.address_text" rows="2" required>${userData.details?.address_text || ''}</textarea>
                </div>
                <div class="input-group location-group">
                    <label>Ubicación (Opcional):
                        <button type="button" class="btn btn-secondary btn-sm" onclick="window.getCurrentLocation(false)">
                            <i class="fas fa-map-marker-alt"></i> Obtener Actual
                        </button>
                    </label>
                    <div class="coords">
                        <input type="number" step="any" id="edit-latitud" name="details.address_latitude" 
                            placeholder="Latitud" value="${userData.details?.address_latitude || ''}">
                        <input type="number" step="any" id="edit-longitud" name="details.address_longitude" 
                            placeholder="Longitud" value="${userData.details?.address_longitude || ''}">
                    </div>
                </div>
                <div class="input-group">
                    <label for="edit-birthday">Fecha de Nacimiento (Opcional):</label>
                    <input type="date" id="edit-birthday" name="details.birth_date" value="${userData.details?.birth_date || ''}">
                </div>
                
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> Guardar Cambios
                </button>
                <div id="edit-profile-error" class="error-message"></div>
            </form>
        `;
        
        // Añadir listener al formulario
        const form = modalContent.querySelector('#edit-profile-form');
        if (form) {
            form.addEventListener('submit', handleEditProfileSubmit);
        }
        
    } catch (error) {
        console.error("[cliente/openEditProfileModal] Error:", error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Editar Mi Perfil</h2>
            <p class="error-message">Error al cargar datos: ${error.message}</p>
            <button class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.openEditProfileModal = openEditProfileModal;

/**
 * Maneja el envío del formulario de edición de perfil
 * @param {Event} event - Evento submit del formulario
 * @returns {Promise<void>}
 */
async function handleEditProfileSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const errorDiv = document.getElementById('edit-profile-error');
    const submitButton = form.querySelector('button[type="submit"]');
    
    if (!errorDiv || !submitButton) return;
    
    errorDiv.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    try {
        // Construir objeto con datos del formulario
        const formData = new FormData(form);
        const updateData = {
            full_name: formData.get('full_name'),
            phone_number_primary: formData.get('phone_number_primary'),
            phone_number_secondary: formData.get('phone_number_secondary') || null,
            email: formData.get('email') || null,
            details: {
                address_text: formData.get('details.address_text'),
                address_latitude: formData.get('details.address_latitude') || null,
                address_longitude: formData.get('details.address_longitude') || null,
                birth_date: formData.get('details.birth_date') || null
            }
        };
        
        // Validar teléfono principal (simple)
        if (!/^\d{9}$/.test(updateData.phone_number_primary)) {
            errorDiv.textContent = 'Teléfono principal debe tener 9 dígitos';
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
            return;
        }
        
        console.log("[cliente/handleEditProfileSubmit] Enviando:", updateData);
        
        // Enviar actualización
        const response = await fetchWithAuth('/users/me', {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        // Actualizar datos en la UI
        updateHeaderUserInfo();
        loadClienteProfileData();
        
        // Cerrar modal y mostrar mensaje de éxito
        closeModal('edit-profile-modal');
        alert("Perfil actualizado correctamente.");
        
    } catch (error) {
        console.error("[cliente/handleEditProfileSubmit] Error:", error);
        errorDiv.textContent = `Error al guardar: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
    }
}

/**
 * Solicita un mantenimiento gratuito para el cliente
 * @returns {Promise<void>}
 */
async function requestFreeMaintenance() {
    console.log("[cliente/requestFreeMaintenance] Enviando solicitud...");
    
    // Pedir confirmación para evitar solicitudes accidentales
    if (!confirm("¿Desea solicitar un mantenimiento gratuito para su instalación de gas? Un técnico se comunicará con usted.")) {
        return;
    }
    
    try {
        // Enviar solicitud simple (sin datos adicionales)
        const response = await fetchWithAuth('/misc/maintenance-request', {
            method: 'POST',
            body: JSON.stringify({ notes: "Solicitud desde la aplicación." })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        // Mostrar mensaje de éxito
        alert("Solicitud de mantenimiento registrada. Un técnico se comunicará con usted pronto.");
        
    } catch (error) {
        console.error("[cliente/requestFreeMaintenance] Error:", error);
        showGlobalError(`Error al solicitar mantenimiento: ${error.message}`);
    }
}
window.requestFreeMaintenance = requestFreeMaintenance;

/**
 * Abre WhatsApp para contactar a la empresa
 */
function openWhatsApp() {
    console.log("[cliente/openWhatsApp] Abriendo WhatsApp...");
    const whatsappNumber = getGlobalConfigState().whatsapp_number;
    
    if (!whatsappNumber) {
        alert("No hay número de WhatsApp configurado. Por favor, contáctenos por teléfono.");
        return;
    }
    
    // Construir mensaje predeterminado
    const message = encodeURIComponent("Hola, soy cliente de Gas ERP Ayacucho y tengo una consulta...");
    
    // Abrir WhatsApp web con el número y mensaje
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank', 'noopener,noreferrer');
}
window.openWhatsApp = openWhatsApp;

/**
 * Muestra los detalles de un pedido específico
 * @param {number} orderId - ID del pedido a mostrar
 * @returns {Promise<void>}
 */
async function viewOrderDetails(orderId) {
    console.log(`[cliente/viewOrderDetails] Viendo detalles pedido ID: ${orderId}`);
    const modalId = 'view-details-modal';
    const modal = document.getElementById(modalId);
    const modalContent = modal?.querySelector('.modal-content');
    
    if (!modal || !modalContent) {
        console.error(`Modal #${modalId} no encontrado.`);
        return;
    }
    
    // Mostrar estado de carga
    modalContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Cargando detalles...</div>';
    openModal(modalId);
    
    try {
        // Obtener detalles del pedido
        const response = await fetchWithAuth(`/orders/${orderId}`);
        
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Error ${response.status}`);
        }
        
        const order = await response.json();
        console.log(`[cliente/viewOrderDetails] Datos recibidos:`, order);
        
        // Formatear fecha si existe
        let orderDate = 'Fecha no disponible';
        try {
            if (order.order_date) {
                orderDate = new Date(order.order_date).toLocaleDateString('es-PE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (e) {
            console.warn("Error al formatear fecha de pedido:", e);
        }
        
        // Construir HTML de items del pedido
        let itemsHtml = '<p>No hay detalles disponibles.</p>';
        
        if (order.items && order.items.length > 0) {
            itemsHtml = '<table class="table table-sm"><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>';
            
            order.items.forEach(item => {
                const itemName = item.item_type === 'cylinder' 
                    ? `Balón ${item.item_name} (${item.action_type_text || 'Intercambio'})` 
                    : item.item_name || 'Otro producto';
                
                itemsHtml += `
                    <tr>
                        <td>${itemName}</td>
                        <td>${item.quantity}</td>
                        <td>${formatCurrency(item.unit_price)}</td>
                        <td>${formatCurrency(item.item_subtotal)}</td>
                    </tr>
                `;
            });
            
            // Añadir totales al final
            itemsHtml += `
                <tr class="table-totals">
                    <td colspan="3" style="text-align:right;"><strong>SUBTOTAL:</strong></td>
                    <td>${formatCurrency(order.subtotal_amount)}</td>
                </tr>`;
                
            if (order.discount_amount > 0) {
                itemsHtml += `
                    <tr>
                        <td colspan="3" style="text-align:right;"><strong>DESCUENTO:</strong></td>
                        <td>-${formatCurrency(order.discount_amount)}</td>
                    </tr>`;
            }
            
            itemsHtml += `
                <tr class="table-totals">
                    <td colspan="3" style="text-align:right;"><strong>TOTAL:</strong></td>
                    <td>${formatCurrency(order.total_amount)}</td>
                </tr>`;
                
            itemsHtml += '</tbody></table>';
        }
        
        // Mostrar detalles en el modal
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Detalle de Pedido #${order.order_id}</h2>
            
            <div class="order-basic-details">
                <p><strong>Fecha:</strong> ${orderDate}</p>
                <p><strong>Estado:</strong> ${formatStatusTag(order.order_status)}</p>
                <p><strong>Estado de Pago:</strong> ${formatStatusTag(order.payment_status)}</p>
                <p><strong>Dirección de Entrega:</strong> ${order.delivery_address_text || 'No especificada'}</p>
                <p><strong>Instrucciones:</strong> ${order.delivery_instructions || 'Ninguna'}</p>
            </div>
            
            <h3>Productos</h3>
            <div class="order-items">
                ${itemsHtml}
            </div>
            
            <h3>Entrega</h3>
            <div class="order-delivery-details">
                <p><strong>Repartidor:</strong> ${order.delivery?.delivery_person_name || 'No asignado aún'}</p>
                <p><strong>Estado Entrega:</strong> ${order.delivery ? formatStatusTag(order.order_status) : 'Pendiente'}</p>
            </div>
            
            <div class="modal-actions" style="margin-top:20px; text-align:right;">
                <button class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
                ${order.payment_status === 'pending' || order.payment_status === 'partially_paid' ? 
                    `<button class="btn btn-warning" onclick="goToPaymentSection(); closeModal('${modalId}');">
                        <i class="fas fa-dollar-sign"></i> Ir a Pagar
                    </button>` : ''}
                ${order.receipt_url ? 
                    `<button class="btn btn-primary" onclick="downloadReceipt('${order.receipt_url}')">
                        <i class="fas fa-receipt"></i> Ver Recibo
                    </button>` : ''}
            </div>
        `;
        
    } catch (error) {
        console.error("[cliente/viewOrderDetails] Error:", error);
        modalContent.innerHTML = `
            <span class="close-button" onclick="closeModal('${modalId}')">&times;</span>
            <h2>Detalle de Pedido</h2>
            <p class="error-message">Error al cargar detalles: ${error.message}</p>
            <button class="btn btn-secondary" onclick="closeModal('${modalId}')">Cerrar</button>
        `;
    }
}
window.viewOrderDetails = viewOrderDetails;

/**
 * Cancela un pedido del cliente
 * @param {number} orderId - ID del pedido a cancelar
 * @returns {Promise<void>}
 */
async function cancelClientOrder(orderId) {
    console.log(`[cliente/cancelClientOrder] Cancelando pedido ID: ${orderId}`);
    
    // Pedir confirmación para evitar cancelaciones accidentales
    if (!confirm(`¿Está seguro que desea cancelar el pedido #${orderId}? Esta acción no se puede deshacer.`)) {
        return;
    }
    
    try {
        // Enviar solicitud de cancelación
        const response = await fetchWithAuth(`/orders/${orderId}/cancel`, {
            method: 'PUT'
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        // Mostrar mensaje de éxito y actualizar lista
        alert(`El pedido #${orderId} ha sido cancelado correctamente.`);
        loadClienteHistorial();
        
    } catch (error) {
        console.error(`[cliente/cancelClientOrder] Error:`, error);
        showGlobalError(`Error al cancelar pedido: ${error.message}`);
    }
}
window.cancelClientOrder = cancelClientOrder;

/**
 * Carga datos del perfil del cliente
 * @returns {Promise<void>}
 */
async function loadClienteProfileData() {
    console.log("[cliente/loadProfileData v7] Cargando datos perfil...");
    
    try {
        // Obtener datos del perfil
        console.log("[cliente/loadProfileData v7] Fetching /users/me...");
        const response = await fetchWithAuth('/users/me');
        
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Error ${response.status} al cargar perfil`);
        }
        
        const userData = await response.json();
        console.log("[cliente/loadProfileData v7] Datos recibidos:", userData);
        
        // Buscar y actualizar elementos de la UI
        const elements = {
            nombre: document.getElementById('cliente-data-nombre'),
            dni: document.getElementById('cliente-data-dni'),
            celular: document.getElementById('cliente-data-celular'),
            direccion: document.getElementById('cliente-data-direccion'),
            puntos: document.getElementById('cliente-puntos'),
            refCode: document.getElementById('cliente-ref-code'),
            beneficiosDiv: document.getElementById('benefits-description'),
            recibosList: document.getElementById('cliente-recibos-list')
        };
        
        // Actualizar cada elemento si existe
        if (elements.nombre) elements.nombre.textContent = userData.full_name || 'No disponible';
        if (elements.dni) elements.dni.textContent = userData.details?.dni_ruc || 'No disponible';
        if (elements.celular) elements.celular.textContent = userData.phone_number_primary || 'No disponible';
        if (elements.direccion) elements.direccion.textContent = userData.details?.address_text || 'No disponible';
        if (elements.puntos) elements.puntos.textContent = userData.details?.loyalty_points ?? '0';
        if (elements.refCode) elements.refCode.textContent = userData.details?.referral_code || 'NO DISP.';
        
        // Actualizar descripción de beneficios
        if (elements.beneficiosDiv) {
            elements.beneficiosDiv.textContent = getGlobalConfigState().benefits_description || 'Información no disponible.';
        }
        
        // Actualizar lista de recibos (pendiente implementación backend)
        if (elements.recibosList) {
            elements.recibosList.innerHTML = '<p>No hay recibos disponibles para mostrar.</p>';
        }
        
        console.log("[cliente/loadProfileData v7] Datos de perfil cargados OK.");
        
    } catch (error) {
        console.error("[cliente/loadProfileData v7] Error:", error);
        showGlobalError(`Error cargando perfil: ${error.message}`);
        
        // Limpiar placeholders con error si no se han actualizado
        const spans = document.querySelectorAll('#cliente-profile-summary span');
        spans.forEach(span => {
            if (span.textContent === 'Cargando...') {
                span.textContent = 'Error';
            }
        });
    }
}

/**
 * Desplaza la vista a la sección de pagos
 */
function goToPaymentSection() {
    console.log("[cliente/goToPaymentSection] Desplazando a sección de pagos...");
    const paymentsCard = document.querySelector('.card:has(#payment-proof-input)');
    
    if (paymentsCard) {
        paymentsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        paymentsCard.classList.add('highlight-animate');
        setTimeout(() => paymentsCard.classList.remove('highlight-animate'), 2000);
    } else {
        console.error("[cliente/goToPaymentSection] No se encontró la sección de pagos.");
    }
}
window.goToPaymentSection = goToPaymentSection;

/**
 * Maneja el canje de puntos por descuento
 * @returns {Promise<void>}
 */
async function redeemPointsHandler() {
    console.log("[cliente/redeemPointsHandler] Iniciando canje de puntos...");
    const puntosSpan = document.getElementById('cliente-puntos');
    
    if (!puntosSpan) {
        console.error("[cliente/redeemPointsHandler] Elemento #cliente-puntos no encontrado.");
        return;
    }
    
    const puntosActuales = parseInt(puntosSpan.textContent) || 0;
    const configState = getGlobalConfigState();
    const puntosMinimos = parseInt(configState.points_min_redeem) || 200;
    const descuentoValor = parseFloat(configState.points_discount_value) || 20;
    
    // Verificar puntos disponibles
    if (puntosActuales < puntosMinimos) {
        alert(`Necesita al menos ${puntosMinimos} puntos para canjear. Actualmente tiene ${puntosActuales} puntos.`);
        return;
    }
    
    // Pedir confirmación
    if (!confirm(`¿Desea canjear ${puntosMinimos} puntos por un descuento de ${formatCurrency(descuentoValor)} en su próximo pedido?`)) {
        return;
    }
    
    try {
        // Enviar solicitud de canje
        const response = await fetchWithAuth('/customers/me/redeem-points', {
            method: 'POST',
            body: JSON.stringify({ 
                points_to_redeem: puntosMinimos 
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || `Error ${response.status}`);
        }
        
        // Actualizar puntos en la UI
        const nuevoPuntos = puntosActuales - puntosMinimos;
        puntosSpan.textContent = nuevoPuntos.toString();
        
        // Mostrar mensaje de éxito
        alert(`¡Canje exitoso! Ha canjeado ${puntosMinimos} puntos por un descuento de ${formatCurrency(descuentoValor)}. Se aplicará automáticamente en su próximo pedido.`);
        
    } catch (error) {
        console.error("[cliente/redeemPointsHandler] Error:", error);
        showGlobalError(`Error al canjear puntos: ${error.message}`);
    }
}
window.redeemPointsHandler = redeemPointsHandler;

/**
 * Maneja eventos de cambios en la sección de otros productos
 */
function handleOtrosProductosChange(event) {
    // Si es un cambio en checkbox, manejar cantidad
    if (event.target.type === 'checkbox') {
        const productId = event.target.value;
        toggleProductQuantityInput(event.target, productId);
    }
    
    // Si es cambio en cualquier input, actualizar precio
    updatePedidoPriceEstimate();
}

// Funcionalidad para obtener ubicación actual
function getCurrentLocation(isRegister = false) {
    console.log("[cliente/getCurrentLocation] Solicitando geolocalización...");
    
    if (!navigator.geolocation) {
        alert("Su navegador no soporta geolocalización.");
        return;
    }
    
    // Seleccionar los campos según si estamos en registro o edición
    const latInput = document.getElementById(isRegister ? 'reg-latitud' : 'edit-latitud');
    const lngInput = document.getElementById(isRegister ? 'reg-longitud' : 'edit-longitud');
    
    if (!latInput || !lngInput) {
        console.error("[cliente/getCurrentLocation] No se encontraron campos de ubicación");
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            latInput.value = position.coords.latitude;
            lngInput.value = position.coords.longitude;
            alert("Ubicación actual obtenida correctamente.");
        },
        function(error) {
            let errorMsg = "Error al obtener ubicación: ";
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg += "Permiso denegado.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg += "Posición no disponible.";
                    break;
                case error.TIMEOUT:
                    errorMsg += "Tiempo de espera agotado.";
                    break;
                default:
                    errorMsg += "Error desconocido.";
            }
            alert(errorMsg);
        },
        { 
            enableHighAccuracy: true, 
            timeout: 10000, 
            maximumAge: 0 
        }
    );
}
window.getCurrentLocation = getCurrentLocation;

// --- Función Principal de Setup ---

/**
 * Configura el dashboard de cliente
 * @returns {Promise<void>}
 */
export async function setupClienteDashboard() {
    console.log('[cliente.js v7] Configurando Dashboard Cliente...');

    // 1. Verificar primero que el contenedor principal existe
    const dashboardElement = document.querySelector('#cliente-dashboard .dashboard.cliente-dashboard');
    if (!dashboardElement) {
        console.error("CRITICAL [cliente/setup]: El contenedor principal del dashboard no se encontró. No se puede continuar.");
        // Mostrar error en el contenido principal
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = `<div class="error-message">Error fatal: No se pudo encontrar la estructura del dashboard del cliente.</div>`;
        }
        return;
    }
    console.log('[cliente/setup v7] Contenedor del dashboard encontrado.');

    try {
        // 2. Cargar datos iniciales en paralelo para mayor eficiencia
        const loadingPromises = [
            populateClienteOrderOptions(),
            loadClienteHistorial(),
            loadClienteProfileData()
        ];
        
        const results = await Promise.allSettled(loadingPromises);
        
        // Verificar y mostrar errores de carga inicial
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const modules = ['opciones de pedido', 'historial', 'datos de perfil'];
                console.error(`[cliente/setup v7] Error al cargar ${modules[index]}:`, result.reason);
            }
        });

        // 3. Adjuntar listeners a formularios y elementos de la UI
        
        // Formulario de pedido
        const pedidoForm = dashboardElement.querySelector('#pedido-form');
        if (pedidoForm) {
            // Limpiar y volver a añadir listener para evitar duplicados
            pedidoForm.removeEventListener('submit', handlePedidoSubmit);
            pedidoForm.addEventListener('submit', handlePedidoSubmit);
            
            // Listeners para actualizar precio estimado
            const tipoBalonSelect = dashboardElement.querySelector('#pedido-tipo-balon');
            if (tipoBalonSelect) tipoBalonSelect.addEventListener('change', updatePedidoPriceEstimate);
            
            const accionBalonSelect = dashboardElement.querySelector('#pedido-accion-balon');
            if (accionBalonSelect) accionBalonSelect.addEventListener('change', updatePedidoPriceEstimate);
            
            const cantidadBalonInput = dashboardElement.querySelector('#pedido-cantidad-balon');
            if (cantidadBalonInput) cantidadBalonInput.addEventListener('input', updatePedidoPriceEstimate);
            
            // Listener delegado para otros productos
            const otrosProdList = dashboardElement.querySelector('#otros-productos-list');
            if (otrosProdList) {
                otrosProdList.removeEventListener('change', handleOtrosProductosChange);
                otrosProdList.addEventListener('change', handleOtrosProductosChange);
                otrosProdList.removeEventListener('input', handleOtrosProductosChange);
                otrosProdList.addEventListener('input', handleOtrosProductosChange);
            }
            
            console.log('[cliente/setup v7] Listeners formulario de pedido OK.');
        } else {
            console.error("[cliente/setup v7] Formulario #pedido-form no encontrado.");
        }

        // Input de archivo para comprobante
        const fileInput = dashboardElement.querySelector('#payment-proof-input');
        if (fileInput) {
            fileInput.removeEventListener('change', handleComprobantePreview);
            fileInput.addEventListener('change', handleComprobantePreview);
            console.log('[cliente/setup v7] Listener input de archivo OK.');
        } else {
            console.warn("[cliente/setup v7] Input #payment-proof-input no encontrado.");
        }

        // Botones específicos (usando querySelector en lugar de getElementById para scope)
        const buttonSelectors = {
            'btn-ver-beneficios': showBenefitsModal,
            'btn-copiar-codigo': copyReferralCode,
            'btn-compartir-codigo': shareReferralCode,
            'btn-subir-comprobante': uploadPaymentProof,
            'btn-editar-perfil': openEditProfileModal,
            'request-maintenance-btn': requestFreeMaintenance,
            'whatsapp-contact-btn': openWhatsApp,
            'btn-canjear-puntos': redeemPointsHandler
        };
        
        // Añadir listeners a cada botón
        for (const [id, handler] of Object.entries(buttonSelectors)) {
            const button = dashboardElement.querySelector(`#${id}`);
            if (button) {
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
            }
        }

        console.log('[cliente.js v7] Dashboard Cliente configurado OK.');

    } catch (error) {
        console.error('[cliente.js v7] Error FATAL durante setup:', error);
        const errorMessage = `Error crítico al configurar panel: ${error.message}.`;
        showGlobalError(errorMessage);
        dashboardElement.innerHTML = `<div class="error-message">${errorMessage}</div>`;
    }
}