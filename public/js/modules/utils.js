// ==================================
// js/modules/utils.js
// Funciones de utilidad reutilizables
// ==================================
console.log('[utils.js] Módulo cargado.');

// --- Constantes para formateo uniforme ---
const DEFAULT_DATE_FORMAT = { day: '2-digit', month: '2-digit', year: 'numeric' };
const DEFAULT_TIME_FORMAT = { hour: '2-digit', minute: '2-digit' };
const DEFAULT_DATETIME_FORMAT = { ...DEFAULT_DATE_FORMAT, ...DEFAULT_TIME_FORMAT };
const DEFAULT_CURRENCY = 'PEN';
const DEFAULT_LOCALE = 'es-PE';

/**
 * Formatea un estado de backend (string) en una etiqueta HTML <span> coloreada.
 * @param {string} status - El estado a formatear (ej: 'pending_assignment', 'delivered').
 * @returns {string} - El HTML de la etiqueta span.
 */
export function formatStatusTag(status) {
    if (!status || typeof status !== 'string') {
        return '<span class="status-tag status-unknown">Desconocido</span>';
    }
    
    // Normaliza el status para clase CSS: minúsculas, reemplaza _ y espacios con -
    const statusClass = status.toLowerCase().replace(/[\s_]+/g, '-');
    
    // Formatea el texto a mostrar: reemplaza _ con espacio, capitaliza primera letra
    let statusText = status.replace(/_/g, ' ');
    statusText = statusText.charAt(0).toUpperCase() + statusText.slice(1);

    // Mapeo de clases para estados específicos
    const statusClassMap = {
        // Estados de pedido/pago pendiente - Naranja/Amarillo
        'pending': 'status-pending',
        'pending-approval': 'status-pending',
        'pending-assignment': 'status-pending',
        'payment-pending': 'status-pending',
        'cobro-pendiente': 'status-pending',
        'empty': 'status-pending',
        
        // Estados completados/activos - Verde
        'paid': 'status-paid',
        'delivered': 'status-paid',
        'available': 'status-paid',
        'activo': 'status-paid',
        'full': 'status-paid',
        
        // Estados cancelados/inactivos - Rojo
        'cancelled': 'status-cancelled',
        'danger': 'status-cancelled',
        'inactivo': 'status-cancelled',
        'offline': 'status-cancelled',
        'not-collected': 'status-cancelled',
        'damaged': 'status-danger',
        
        // Estados en progreso - Azul
        'assigned': 'status-assigned',
        'delivering': 'status-assigned',
        'busy': 'status-assigned',
        'late-payment-scheduled': 'status-assigned',
        'loaned-to-customer': 'status-assigned',
        
        // Métodos de pago
        'cash': 'status-paid',
        'yape_plin': 'status-info',
        'yape-plin': 'status-info',
        'transfer': 'status-info'
    };

    // Usar la clase específica o generarla basada en el statusClass
    const specificClass = statusClassMap[statusClass] || `status-${statusClass}`;

    return `<span class="status-tag ${specificClass}">${statusText}</span>`;
}

/**
 * Formatea un valor numérico como moneda (Soles Peruanos - PEN).
 * @param {*} value - El valor a formatear (puede ser número, string, null, undefined).
 * @param {string} [fallback='S/ 0.00'] - El valor a devolver si la entrada no es un número válido.
 * @returns {string} - El valor formateado como moneda.
 */
export function formatCurrency(value, fallback = 'S/ 0.00') {
    // Conversión segura a número
    const numberValue = (value === null || value === undefined || value === '') 
        ? NaN 
        : parseFloat(value);

    if (isNaN(numberValue)) {
        return fallback;
    }

    try {
        return new Intl.NumberFormat(DEFAULT_LOCALE, {
            style: 'currency',
            currency: DEFAULT_CURRENCY,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numberValue);
    } catch (e) {
        console.error(`[formatCurrency] Error formateando ${numberValue}:`, e);
        return `S/ ${numberValue.toFixed(2)}`;
    }
}

/**
 * Formatea una fecha en formato local (DD/MM/YYYY).
 * @param {string|Date} date - La fecha a formatear.
 * @param {Object} options - Opciones de formato (ver Intl.DateTimeFormat).
 * @param {string} [fallback='N/A'] - El valor a devolver si la entrada no es una fecha válida.
 * @returns {string} - La fecha formateada.
 */
export function formatDate(date, options = DEFAULT_DATE_FORMAT, fallback = 'N/A') {
    if (!date) return fallback;
    
    try {
        // Si es string, asegurarse que sea una fecha válida
        if (typeof date === 'string') {
            // Añadir tiempo si es solo fecha (YYYY-MM-DD)
            if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                date = date + 'T00:00:00';
            }
            
            // Crear objeto Date
            date = new Date(date);
        }
        
        // Verificar que es una fecha válida
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            return fallback;
        }
        
        return new Intl.DateTimeFormat(DEFAULT_LOCALE, options).format(date);
    } catch (e) {
        console.error(`[formatDate] Error formateando ${date}:`, e);
        return fallback;
    }
}

/**
 * Formatea una fecha y hora en formato local (DD/MM/YYYY HH:MM).
 * @param {string|Date} datetime - La fecha/hora a formatear.
 * @param {string} [fallback='N/A'] - El valor a devolver si la entrada no es válida.
 * @returns {string} - La fecha y hora formateada.
 */
export function formatDateTime(datetime, fallback = 'N/A') {
    return formatDate(datetime, DEFAULT_DATETIME_FORMAT, fallback);
}

/**
 * Formatea solo la hora de una fecha en formato local (HH:MM).
 * @param {string|Date} datetime - La fecha/hora de la que extraer la hora.
 * @param {string} [fallback='N/A'] - El valor a devolver si la entrada no es válida.
 * @returns {string} - La hora formateada.
 */
export function formatTime(datetime, fallback = 'N/A') {
    return formatDate(datetime, DEFAULT_TIME_FORMAT, fallback);
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD.
 * @returns {string} - La fecha actual en formato YYYY-MM-DD.
 */
export function getCurrentDateISOString() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Intenta obtener la geolocalización actual del navegador.
 * @param {boolean} isRegister - Indica si se llama desde el formulario de registro.
 */
export function getCurrentLocation(isRegister = false) {
    console.log("[utils/getCurrentLocation] Intentando obtener ubicación...");
    
    if (!navigator.geolocation) {
        alert("Geolocalización no es soportada por tu navegador.");
        return;
    }

    function success(position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        console.log(`[utils/getCurrentLocation] Ubicación obtenida: Lat ${latitude}, Lon ${longitude}`);

        const latInputId = isRegister ? 'reg-latitud' : 'edit-latitud';
        const lonInputId = isRegister ? 'reg-longitud' : 'edit-longitud';

        const latInput = document.getElementById(latInputId);
        const lonInput = document.getElementById(lonInputId);

        if (latInput && lonInput) {
            latInput.value = latitude.toFixed(8);
            lonInput.value = longitude.toFixed(8);
            alert("Ubicación obtenida y campos actualizados.");
        } else {
            console.error(`[utils/getCurrentLocation] Inputs ${latInputId} o ${lonInputId} no encontrados.`);
            alert(`Ubicación obtenida: Lat ${latitude.toFixed(6)}, Lon ${longitude.toFixed(6)}.\nNo se pudieron actualizar los campos del formulario.`);
        }
    }

    function error(err) {
        console.error("[utils/getCurrentLocation] Error al obtener ubicación:", err);
        const errorMessages = {
            1: "Permiso denegado. Por favor habilita la ubicación en tu navegador.",
            2: "Ubicación no disponible en este momento.",
            3: "Tiempo de espera agotado al intentar obtener la ubicación."
        };
        alert(errorMessages[err.code] || "No se pudo obtener tu ubicación.");
    }

    const options = {
        enableHighAccuracy: true,  // Mayor precisión (puede usar más batería)
        timeout: 10000,            // 10 segundos máximo de espera
        maximumAge: 0              // No usar caché de posición anterior
    };

    navigator.geolocation.getCurrentPosition(success, error, options);
}
// Exponer globalmente para uso en onclick
window.getCurrentLocation = getCurrentLocation;

/**
 * Muestra datos tabulares en un elemento contenedor.
 * @param {HTMLElement} containerElement - El div donde se mostrará la tabla.
 * @param {Array<Object>} data - Array de objetos con los datos.
 * @param {string} [title="Reporte"] - Título opcional para la tabla.
 * @param {boolean} [addCloseButton=false] - Si se añade un botón para ocultar el reporte.
 */
export function displayReportData(containerElement, data, title = "Reporte", addCloseButton = false) {
    console.log(`[utils/displayReportData] Mostrando reporte "${title}" en`, containerElement);
    
    if (!containerElement) {
        console.error("[utils/displayReportData] Error: Contenedor para reporte no encontrado.");
        return;
    }
    
    if (!Array.isArray(data)) {
        containerElement.innerHTML = `<p class="error-message">Error: Los datos recibidos no son válidos.</p>`;
        return;
    }

    let tableHtml = '';
    
    if (data.length === 0) {
        tableHtml = '<p style="text-align:center; padding: 15px;">No hay datos para mostrar en este reporte.</p>';
    } else {
        // Generar encabezados desde las claves del primer objeto
        const headers = Object.keys(data[0]);
        
        tableHtml = `<div class="table-responsive"><table class="table table-striped table-bordered table-sm"><thead><tr>`;
        
        headers.forEach(header => {
            // Formatear nombre de columna (ej: 'customer_name' -> 'Customer Name')
            const formattedHeader = header
                .replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());
                
            tableHtml += `<th>${formattedHeader}</th>`;
        });
        
        tableHtml += `</tr></thead><tbody>`;

        // Generar filas
        data.forEach(row => {
            tableHtml += `<tr>`;
            
            headers.forEach(header => {
                let cellValue = row[header];
                
                // Formateo según tipo de datos y nombre de campo
                if (cellValue === null || cellValue === undefined) {
                    cellValue = '-';
                }
                // Detectar montos/precios por nombre de columna
                else if (typeof cellValue === 'number' && 
                        (header.includes('amount') || 
                         header.includes('price') || 
                         header.includes('total') || 
                         header.includes('subtotal') ||
                         header.includes('cost'))) {
                    cellValue = formatCurrency(cellValue);
                }
                // Formatear booleanos
                else if (typeof cellValue === 'boolean') {
                    cellValue = cellValue ? 'Sí' : 'No';
                }
                // Formatear fechas detectadas por nombre o valor
                else if (
                    (header.includes('date') || header.includes('time') || header.includes('when')) && 
                    typeof cellValue === 'string' && 
                    cellValue.match(/^\d{4}-\d{2}-\d{2}/)
                ) {
                    // Decidir si incluir hora basado en formato de la fecha
                    if (cellValue.includes('T') || cellValue.includes(' ') && cellValue.includes(':')) {
                        cellValue = formatDateTime(cellValue);
                    } else {
                        cellValue = formatDate(cellValue);
                    }
                }
                // Formatear estados
                else if (header === 'status' || 
                         header.includes('_status') || 
                         header.endsWith('state') || 
                         header.includes('method')) {
                    cellValue = formatStatusTag(cellValue);
                }
                
                tableHtml += `<td>${cellValue}</td>`;
            });
            
            tableHtml += `</tr>`;
        });
        
        tableHtml += `</tbody></table></div>`;
    }

    // Añadir título y botón de cierre
    let headerHtml = '';
    
    if (title) {
        headerHtml += `<h4 id="report-title">${title}</h4>`;
    }
    
    if (addCloseButton) {
        headerHtml += `<button class="close-button" 
                       onclick="this.closest('.card, #report-output').style.display='none'">&times;</button>`;
    }

    containerElement.innerHTML = headerHtml + tableHtml;
    containerElement.style.display = 'block';
    
    console.log(`[utils/displayReportData] Reporte "${title}" mostrado correctamente.`);
}

/**
 * Exporta datos a un archivo CSV.
 * @param {Array<Object>} data - Los datos a exportar.
 * @param {string} filename - Nombre del archivo a generar.
 */
export function exportToCSV(data, filename) {
    if (!Array.isArray(data) || data.length === 0) {
        console.error("[utils/exportToCSV] Error: Datos inválidos o vacíos");
        return;
    }
    
    try {
        // Obtener encabezados del primer objeto
        const headers = Object.keys(data[0]);
        
        // Crear una fila de encabezados
        let csvContent = headers.join(',') + '\n';
        
        // Agregar filas de datos
        data.forEach(item => {
            const row = headers.map(header => {
                const value = item[header];
                // Manejar casos especiales
                if (value === null || value === undefined) {
                    return '';
                }
                // Escape comillas y procesar valores
                let cellValue = String(value);
                // Si tiene comas, comillas, o saltos de línea, encerrar en comillas
                if (cellValue.includes(',') || cellValue.includes('"') || 
                    cellValue.includes('\n') || cellValue.includes('\r')) {
                    return '"' + cellValue.replace(/"/g, '""') + '"';
                }
                return cellValue;
            });
            
            csvContent += row.join(',') + '\n';
        });
        
        // Crear blob y descargar
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename || 'export.csv');
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`[utils/exportToCSV] Archivo ${filename} exportado correctamente.`);
    } catch (error) {
        console.error("[utils/exportToCSV] Error exportando a CSV:", error);
        showGlobalError("Error al exportar los datos a CSV. Inténtelo de nuevo.");
    }
}

/**
 * Filtra las filas de una tabla HTML basada en un término de búsqueda.
 * @param {string} tableId - El ID de la tabla (elemento <table>).
 * @param {string} searchTerm - El texto a buscar.
 */
export function filterTable(tableId, searchTerm) {
    console.log(`[utils/filterTable] Filtrando tabla #${tableId} con término: "${searchTerm}"`);
    
    const table = document.getElementById(tableId);
    if (!table) {
        console.error(`[utils/filterTable] Tabla con ID ${tableId} no encontrada.`);
        return;
    }

    const filter = searchTerm.trim().toUpperCase();
    const tbody = table.querySelector("tbody");
    
    if (!tbody) {
        console.warn(`[utils/filterTable] Tabla #${tableId} no tiene tbody.`);
        return;
    }

    const rows = tbody.getElementsByTagName("tr");
    let visibleCount = 0;
    
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName("td");
        let found = false;
        
        // Si hay un mensaje "no hay datos", dejarlo visible
        if (cells.length === 1 && cells[0].colSpan > 1 && 
            cells[0].textContent.toLowerCase().includes('no hay')) {
            rows[i].style.display = "";
            continue;
        }
        
        if (cells.length > 0) {
            for (let j = 0; j < cells.length; j++) {
                const cell = cells[j];
                if (cell) {
                    const txtValue = cell.textContent || cell.innerText;
                    if (txtValue.toUpperCase().includes(filter)) {
                        found = true;
                        break;
                    }
                }
            }
            rows[i].style.display = found ? "" : "none";
            if (found) visibleCount++;
        }
    }
    
    // Si no hay resultados visibles y no hay un mensaje "no hay datos", mostrar mensaje
    if (visibleCount === 0) {
        let noResultsRow = tbody.querySelector('.no-results-row');
        
        if (!noResultsRow) {
            noResultsRow = document.createElement('tr');
            noResultsRow.className = 'no-results-row';
            const cell = document.createElement('td');
            cell.colSpan = table.querySelector('tr')?.children.length || 5;
            cell.textContent = `No se encontraron resultados para "${searchTerm}"`;
            cell.style.textAlign = 'center';
            cell.style.padding = '10px';
            noResultsRow.appendChild(cell);
            tbody.appendChild(noResultsRow);
        } else {
            noResultsRow.style.display = '';
            noResultsRow.querySelector('td').textContent = `No se encontraron resultados para "${searchTerm}"`;
        }
    } else {
        // Ocultar mensaje "no hay resultados" si hay resultados
        const noResultsRow = tbody.querySelector('.no-results-row');
        if (noResultsRow) {
            noResultsRow.style.display = 'none';
        }
    }
    
    console.log(`[utils/filterTable] Filtrado completado para #${tableId}. ${visibleCount} filas visibles.`);
}

/**
 * Genera un ID único para elementos en el DOM o identificadores temporales.
 * @param {string} prefix - Prefijo para el ID.
 * @returns {string} - ID único generado.
 */
export function generateUniqueId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Valida un número de teléfono peruano.
 * @param {string} phone - Número a validar.
 * @returns {boolean} - true si es válido, false en caso contrario.
 */
export function validatePeruPhone(phone) {
    return /^9\d{8}$/.test(phone);
}

/**
 * Valida un DNI/RUC peruano.
 * @param {string} doc - Número a validar.
 * @returns {object} - {isValid: boolean, type: string}
 */
export function validatePeruDocument(doc) {
    // Limpiar espacios y caracteres no numéricos
    const cleaned = doc.replace(/\D/g, '');
    
    if (/^\d{8}$/.test(cleaned)) {
        return { isValid: true, type: 'dni' };
    } else if (/^\d{11}$/.test(cleaned) && cleaned.startsWith('10') || cleaned.startsWith('20')) {
        return { isValid: true, type: 'ruc' };
    }
    
    return { isValid: false, type: 'unknown' };
}

/**
 * Función para mostrar un mensaje global de error si existe la función.
 * Si no existe, fallback a console.error y alert.
 * @param {string} message - Mensaje de error.
 */
export function showGlobalError(message) {
    if (typeof window.showGlobalError === 'function') {
        window.showGlobalError(message);
    } else {
        console.error(`[utils/showGlobalError] Error: ${message}`);
        alert(`Error: ${message}`);
    }
}

console.log('[utils.js] Funciones de utilidad exportadas.');