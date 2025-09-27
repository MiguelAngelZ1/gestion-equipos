// ===== VARIABLES GLOBALES Y ELEMENTOS DEL DOM =====
let equipos = [];
const form = document.getElementById("equipoForm");
const editIdInput = document.getElementById("editId");
const ineInput = document.getElementById("ine");
const nneInput = document.getElementById("nne");
const serieInput = document.getElementById("serie");
const tipoSelect = document.getElementById("tipo");
const estadoSelect = document.getElementById("estado");
const responsableInput = document.getElementById("responsable");
const ubicacionInput = document.getElementById("ubicacion");
const especContainer = document.getElementById("especificaciones");
const cancelEditBtn = document.getElementById("cancelEdit");
const searchInput = document.getElementById("searchInput");
const tablaBody = document.getElementById("tablaBody");
const notificationContainer = document.getElementById("notificationContainer");
const formStatus = document.getElementById("formStatus");
const formStatusIcon = document.getElementById("formStatusIcon");
const formStatusText = document.getElementById("formStatusText");
const submitBtn = document.getElementById("submitBtn");

// ===== API FUNCTIONS =====
const API_BASE = "/api";

async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}

// ===== CRUD OPERATIONS =====
async function cargarEquipos() {
  try {
    showFormStatus("Cargando equipos...", "info", true);
    const query = searchInput.value.trim();
    const endpoint = query
      ? `/equipos?q=${encodeURIComponent(query)}`
      : "/equipos";
    equipos = await apiRequest(endpoint);
    renderEquipos();
    hideFormStatus();
  } catch (error) {
    console.error("Error cargando equipos:", error);
    showNotification("Error", "No se pudieron cargar los equipos", "error");
    hideFormStatus();
  }
}

async function guardarEquipo(equipoData) {
  return await apiRequest("/equipos", {
    method: "POST",
    body: JSON.stringify(equipoData),
  });
}

async function eliminarEquipoAPI(id) {
  return await apiRequest(`/equipos/${id}`, {
    method: "DELETE",
  });
}

// ===== SISTEMA DE NOTIFICACIONES =====
function showNotification(title, message, type = "info", duration = 5000) {
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;

  let iconClass = "bi-info-circle";
  if (type === "success") iconClass = "bi-check-circle";
  if (type === "warning") iconClass = "bi-exclamation-triangle";
  if (type === "error") iconClass = "bi-x-circle";

  notification.innerHTML = `
        <div class="notification-header">
            <i class="bi ${iconClass} notification-icon text-${type}"></i>
            <h4 class="notification-title">${title}</h4>
        </div>
        <div class="notification-body">
            <p class="mb-0">${message}</p>
        </div>
        <div class="notification-progress">
            <div class="notification-progress-bar"></div>
        </div>
    `;

  notificationContainer.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("hiding");
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, duration);

  return notification;
}

// ===== INDICADORES DE ESTADO =====
function showFormStatus(message, type = "info", loading = false) {
  formStatusText.textContent = message;
  formStatusIcon.innerHTML = "";

  if (loading) {
    formStatusIcon.innerHTML = '<span class="loading-spinner"></span>';
  } else {
    let iconClass = "bi-info-circle";
    if (type === "success") iconClass = "bi-check-circle";
    if (type === "warning") iconClass = "bi-exclamation-triangle";
    if (type === "error") iconClass = "bi-x-circle";

    formStatusIcon.innerHTML = `<i class="bi ${iconClass} text-${type}"></i>`;
  }

  formStatus.classList.add("visible");
}

function hideFormStatus() {
  formStatus.classList.remove("visible");
}

// ===== MANEJO DEL FORMULARIO =====
async function handleGuardarEquipo(e) {
  e.preventDefault();

  // Cambiar estado del botón
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';
  submitBtn.disabled = true;

  showFormStatus("Guardando equipo...", "info", true);

  try {
    // Recoger especificaciones como array de objetos
    const especificaciones = [];
    const specFields = especContainer.querySelectorAll(".spec-field");

    specFields.forEach((field) => {
      const claveInput = field.querySelector('input[data-role="spec-key"]');
      const valorInput = field.querySelector('input[data-role="spec-value"]');

      if (claveInput && valorInput) {
        const clave = claveInput.value.trim();
        const valor = valorInput.value.trim();

        if (clave && valor) {
          especificaciones.push({ clave, valor });
        }
      }
    });

    const equipoData = {
      id: editIdInput.value || undefined,
      ine: ineInput.value.trim(),
      nne: nneInput.value.trim(),
      serie: serieInput.value.trim(),
      tipo: tipoSelect.value,
      estado: estadoSelect.value,
      responsable: responsableInput.value.trim(),
      ubicacion: ubicacionInput.value.trim(),
      especificaciones,
    };

    // Validaciones básicas
    if (
      !equipoData.ine ||
      !equipoData.nne ||
      !equipoData.serie ||
      !equipoData.tipo ||
      !equipoData.estado ||
      !equipoData.responsable ||
      !equipoData.ubicacion
    ) {
      throw new Error("Todos los campos principales son obligatorios");
    }

    await guardarEquipo(equipoData);

    const action = editIdInput.value ? "actualizado" : "agregado";
    showNotification("Éxito", `Equipo ${action} correctamente`, "success");
    showFormStatus(`Equipo ${action} correctamente`, "success");

    resetForm();
    await cargarEquipos();
  } catch (error) {
    console.error("Error guardando equipo:", error);
    showNotification(
      "Error",
      error.message || "Error al guardar el equipo",
      "error"
    );
    showFormStatus("Error al guardar", "error");
  } finally {
    // Restaurar botón
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;

    setTimeout(() => {
      hideFormStatus();
    }, 3000);
  }
}

function resetForm() {
  form.reset();
  editIdInput.value = "";
  cancelEditBtn.style.display = "none";
  especContainer.innerHTML = "";
}

function cancelarEdicion() {
  resetForm();
  showNotification(
    "Edición cancelada",
    "Los cambios no han sido guardados",
    "info"
  );
  hideFormStatus();
}

// ===== RENDERIZADO DE EQUIPOS =====
function renderEquipos() {
  const query = searchInput.value.toLowerCase();
  tablaBody.innerHTML = "";

  const filtered = equipos.filter(
    (eq) =>
      eq.ine.toLowerCase().includes(query) ||
      eq.nne.toLowerCase().includes(query) ||
      eq.serie.toLowerCase().includes(query) ||
      eq.tipo.toLowerCase().includes(query) ||
      eq.estado.toLowerCase().includes(query) ||
      eq.responsable.toLowerCase().includes(query) ||
      eq.ubicacion.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="8" class="text-center py-4 text-muted">No se encontraron equipos</td>`;
    tablaBody.appendChild(row);
    return;
  }

  filtered.forEach((eq) => {
    let estadoClass = "";
    let estadoText = eq.estado || "-";

    if (estadoText.includes("E/S") || estadoText.includes("En Servicio")) {
      estadoClass = "estado-en-servicio";
    } else if (
      estadoText.includes("BAJA") ||
      estadoText.includes("F/S") ||
      estadoText.includes("EXT")
    ) {
      estadoClass = "estado-fuera-servicio";
    } else if (estadoText.includes("MANT") || estadoText.includes("REPAR")) {
      estadoClass = "estado-mantenimiento";
    }

    const row = document.createElement("tr");
    row.innerHTML = `
            <td>${eq.ine || "-"}</td>
            <td class="nne-column">${eq.nne || "-"}</td>
            <td class="serie-column">${eq.serie || "-"}</td>
            <td>${eq.tipo || "-"}</td>
            <td class="${estadoClass}">${estadoText}</td>
            <td>${eq.responsable || "-"}</td>
            <td>${eq.ubicacion || "-"}</td>
            <td class="text-center">
                <div class="d-flex justify-content-center">
                    <button onclick='verDetallesEquipo(${JSON.stringify(
                      eq
                    ).replace(
                      /'/g,
                      "\\'"
                    )})' class="btn-action btn-view" title="Ver detalles"><i class="bi bi-eye"></i></button>
                    <button onclick="editarEquipo('${
                      eq.id
                    }')" class="btn-action btn-edit" title="Editar"><i class="bi bi-pencil"></i></button>
                    <button onclick="eliminarEquipo('${
                      eq.id
                    }')" class="btn-action btn-delete" title="Eliminar"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        `;
    tablaBody.appendChild(row);
  });
}

// ===== FUNCIONES DE INTERFAZ =====
function addEspecificacionField(clave = "", valor = "") {
  const container = document.createElement("div");
  container.className = "spec-field";
  const fieldId = "spec-" + Date.now();

  const claveInput = document.createElement("input");
  claveInput.type = "text";
  claveInput.className = "form-control";
  claveInput.placeholder = "Clave";
  claveInput.dataset.role = "spec-key";
  claveInput.dataset.fieldId = fieldId;
  claveInput.value = clave;

  const valorInput = document.createElement("input");
  valorInput.type = "text";
  valorInput.className = "form-control";
  valorInput.placeholder = "Valor";
  valorInput.dataset.role = "spec-value";
  valorInput.dataset.fieldId = fieldId;
  valorInput.value = valor;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-spec";
  removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
  removeBtn.title = "Eliminar especificación";
  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    container.remove();
    showNotification(
      "Especificación eliminada",
      "La especificación ha sido eliminada correctamente",
      "info",
      2000
    );
  });

  container.appendChild(claveInput);
  container.appendChild(valorInput);
  container.appendChild(removeBtn);
  especContainer.appendChild(container);
}

window.editarEquipo = async function (id) {
  try {
    const equipo = await apiRequest(`/equipos/${id}`);

    editIdInput.value = equipo.id;
    ineInput.value = equipo.ine || "";
    nneInput.value = equipo.nne || "";
    serieInput.value = equipo.serie || "";
    tipoSelect.value = equipo.tipo || "";
    estadoSelect.value = equipo.estado || "";
    responsableInput.value = equipo.responsable || "";
    ubicacionInput.value = equipo.ubicacion || "";

    especContainer.innerHTML = "";
    if (equipo.especificaciones && Array.isArray(equipo.especificaciones)) {
      equipo.especificaciones.forEach((spec) => {
        addEspecificacionField(spec.clave, spec.valor);
      });
    }

    cancelEditBtn.style.display = "inline-block";
    showFormStatus("Editando equipo: " + equipo.ine, "info");
    showNotification(
      "Modo edición",
      `Estás editando el equipo "${equipo.ine}"`,
      "info"
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("Error cargando equipo para editar:", error);
    showNotification(
      "Error",
      "No se pudo cargar el equipo para editar",
      "error"
    );
  }
};

window.eliminarEquipo = async function (id) {
  const equipo = equipos.find((eq) => eq.id === id);
  if (!equipo) return;

  if (
    confirm(`¿Está seguro de que desea eliminar el equipo "${equipo.ine}"?`)
  ) {
    try {
      showFormStatus("Eliminando equipo...", "warning", true);
      await eliminarEquipoAPI(id);

      showNotification(
        "Éxito",
        `Equipo "${equipo.ine}" eliminado correctamente`,
        "success"
      );
      showFormStatus("Equipo eliminado correctamente", "success");

      await cargarEquipos();
    } catch (error) {
      console.error("Error eliminando equipo:", error);
      showNotification("Error", "No se pudo eliminar el equipo", "error");
      showFormStatus("Error al eliminar", "error");
    } finally {
      setTimeout(() => {
        hideFormStatus();
      }, 3000);
    }
  }
};

// ===== MODAL DE DETALLES =====
function verDetallesEquipo(eq) {
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.onclick = () => document.body.removeChild(modalOverlay);

  const modalContent = document.createElement("div");
  modalContent.className = "modal-content";
  modalContent.onclick = (e) => e.stopPropagation();

  let statusClass = "status-active";
  if (eq.estado.includes("BAJA") || eq.estado.includes("EXT")) {
    statusClass = "status-inactive";
  } else if (eq.estado.includes("MANT") || eq.estado.includes("REPAR")) {
    statusClass = "status-maintenance";
  }

  let html = `
        <div class="modal-header">
            <h2 class="modal-title">
                <i class="bi bi-pc-display"></i> Detalles del Equipo
            </h2>
            <button class="btn-close-modal">
                <i class="bi bi-x-lg"></i>
            </button>
        </div>
        <div class="modal-body">
            <div class="equipo-info-section">
                <h3 class="section-title">
                    <i class="bi bi-info-circle"></i> Información General
                </h3>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">INE (Nombre del equipo)</span>
                        <span class="info-value">${eq.ine || "N/A"}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">NNE (Número único)</span>
                        <span class="info-value">${eq.nne || "N/A"}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Número de Serie</span>
                        <span class="info-value">${eq.serie || "N/A"}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Tipo de Equipo</span>
                        <span class="info-value">${eq.tipo || "N/A"}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Estado</span>
                        <span class="info-value">
                            <span class="status-value ${statusClass}">${
    eq.estado || "N/A"
  }</span>
                        </span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Responsable</span>
                        <span class="info-value">${
                          eq.responsable || "N/A"
                        }</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Ubicación Física</span>
                        <span class="info-value">${eq.ubicacion || "N/A"}</span>
                    </div>
                </div>
            </div>
    `;

  if (
    eq.especificaciones &&
    Array.isArray(eq.especificaciones) &&
    eq.especificaciones.length > 0
  ) {
    html += `
            <div class="especificaciones-section">
                <h3 class="section-title">
                    <i class="bi bi-list-check"></i> Especificaciones Adicionales
                </h3>
                <div class="especificaciones-grid">
        `;

    eq.especificaciones.forEach((spec) => {
      html += `
                <div class="especificacion-card">
                    <div class="espec-label">${spec.clave || "N/A"}</div>
                    <div class="espec-value">${spec.valor || "N/A"}</div>
                </div>
            `;
    });

    html += `
                </div>
            </div>
        `;
  } else {
    html += `
            <div class="especificaciones-section">
                <h3 class="section-title">
                    <i class="bi bi-list-check"></i> Especificaciones Adicionales
                </h3>
                <div class="empty-state">
                    <i class="bi bi-inbox"></i>
                    <p>No hay especificaciones adicionales para este equipo.</p>
                </div>
            </div>
        `;
  }

  html += `</div>`;

  html += `
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="closeModalBtn">
                <i class="bi bi-x-circle"></i> Cerrar
            </button>
            <button type="button" class="btn btn-danger" id="exportPdfModalBtn">
                <i class="bi bi-file-pdf"></i> Exportar a PDF
            </button>
        </div>
    `;

  modalContent.innerHTML = html;
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // Event listeners del modal
  const closeModalBtn = modalContent.querySelector("#closeModalBtn");
  const exportPdfModalBtn = modalContent.querySelector("#exportPdfModalBtn");
  const btnCloseModal = modalContent.querySelector(".btn-close-modal");

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      document.body.removeChild(modalOverlay);
    });
  }

  if (exportPdfModalBtn) {
    exportPdfModalBtn.addEventListener("click", () => {
      exportarDetallePDF(eq);
    });
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", () => {
      document.body.removeChild(modalOverlay);
    });
  }
}

// ===== EXPORTACIÓN PDF =====
function exportarDetallePDF(eq) {
  showFormStatus("Generando PDF...", "info", true);

  setTimeout(() => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text("DETALLE DE EQUIPO", margin, 20);
    doc.setLineWidth(0.5);
    doc.line(margin, 25, pageWidth - margin, 25);

    const basicInfo = [
      { campo: "INE", valor: eq.ine || "N/A" },
      { campo: "NNE", valor: eq.nne || "N/A" },
      { campo: "N° de Serie", valor: eq.serie || "N/A" },
      { campo: "Tipo", valor: eq.tipo || "N/A" },
      { campo: "Estado", valor: eq.estado || "N/A" },
      { campo: "Responsable", valor: eq.responsable || "N/A" },
      { campo: "Ubicación", valor: eq.ubicacion || "N/A" },
    ];

    doc.autoTable({
      startY: 35,
      head: [["Campo", "Valor"]],
      body: basicInfo.map((item) => [item.campo, item.valor]),
      margin: { left: margin, right: margin },
      styles: {
        cellPadding: 5,
        fontSize: 10,
      },
      headStyles: {
        fillColor: [44, 62, 80],
        textColor: 255,
        fontStyle: "bold",
      },
      theme: "grid",
    });

    if (
      eq.especificaciones &&
      Array.isArray(eq.especificaciones) &&
      eq.especificaciones.length > 0
    ) {
      const specInfo = eq.especificaciones.map((spec) => [
        spec.clave || "N/A",
        spec.valor || "N/A",
      ]);

      doc.setFontSize(14);
      doc.setFont(undefined, "bold");
      doc.text(
        "ESPECIFICACIONES TÉCNICAS",
        margin,
        doc.autoTable.previous.finalY + 15
      );

      doc.autoTable({
        startY: doc.autoTable.previous.finalY + 20,
        head: [["ESPECIFICACIÓN", "VALOR"]],
        body: specInfo,
        margin: { left: margin, right: margin },
        styles: {
          cellPadding: 5,
          fontSize: 10,
        },
        headStyles: {
          fillColor: [44, 62, 80],
          textColor: 255,
          fontStyle: "bold",
        },
        theme: "grid",
      });
    }

    doc.save(`detalle_${(eq.ine || "equipo").replace(/[^a-z0-9]/gi, "_")}.pdf`);

    showNotification(
      "PDF generado",
      `El archivo PDF con los detalles del equipo se ha descargado correctamente`,
      "success"
    );

    hideFormStatus();
  }, 800);
}

function exportarPDF() {
  if (equipos.length === 0) {
    showNotification("Sin datos", "No hay equipos para exportar.", "warning");
    return;
  }

  showFormStatus("Generando PDF...", "info", true);

  setTimeout(() => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "pt", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    doc.setFontSize(18);
    doc.setTextColor(44, 62, 80);
    doc.setFont(undefined, "bold");
    doc.text("LISTADO DE EQUIPOS", margin, 40);

    const fecha = new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Generado el: ${fecha}`, margin, 60);

    const headers = [
      "INE",
      "NNE",
      "SERIE",
      "TIPO",
      "ESTADO",
      "RESPONSABLE",
      "UBICACIÓN",
    ];
    const data = equipos.map((equipo) => [
      equipo.ine || "-",
      equipo.nne || "-",
      equipo.serie || "-",
      equipo.tipo || "-",
      equipo.estado || "-",
      equipo.responsable || "-",
      equipo.ubicacion || "-",
    ]);

    doc.autoTable({
      startY: 80,
      head: [headers],
      body: data,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [44, 62, 80],
        textColor: 255,
        fontStyle: "bold",
      },
      theme: "grid",
    });

    doc.save(`equipos_${new Date().toISOString().split("T")[0]}.pdf`);

    showNotification(
      "PDF exportado",
      `Se ha exportado un listado de ${equipos.length} equipos a PDF`,
      "success"
    );

    hideFormStatus();
  }, 1000);
}

// ===== INICIALIZACIÓN =====
document.addEventListener("DOMContentLoaded", () => {
  if (form) form.addEventListener("submit", handleGuardarEquipo);
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", cancelarEdicion);
  if (searchInput) searchInput.addEventListener("input", cargarEquipos);

  const exportPdfBtn = document.getElementById("exportPdfBtn");
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", exportarPDF);
  }

  // Cargar equipos al iniciar
  cargarEquipos();
});

// Función global para agregar especificaciones
window.addEspecificacionField = addEspecificacionField;
