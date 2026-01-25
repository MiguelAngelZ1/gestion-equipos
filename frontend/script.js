// ===== VARIABLES GLOBALES Y ELEMENTOS DEL DOM =====
let equipos = [];
let cambiosPendientes = [];
let isOnline = true;
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

// ===== SISTEMA OFFLINE =====
const OFFLINE_STORAGE_KEY = "equipos_offline_data";
const PENDING_CHANGES_KEY = "equipos_pending_changes";

// Verificar estado de conexión
function checkOnlineStatus() {
  isOnline = navigator.onLine;
  updateOnlineStatusUI();

  if (isOnline) {
    sincronizarCambiosPendientes();
  }
}

function updateOnlineStatusUI() {
  const onlineStatus = document.getElementById("onlineStatus");
  if (!onlineStatus) return;

  if (isOnline) {
    onlineStatus.className = "online-status online";
    onlineStatus.innerHTML = '<i class="bi bi-wifi"></i> En línea';
    onlineStatus.style.display = "block";
  } else {
    onlineStatus.className = "online-status offline";
    onlineStatus.innerHTML =
      '<i class="bi bi-wifi-off"></i> Modo offline - Los cambios se guardarán localmente';
    onlineStatus.style.display = "block";
  }
}

// Guardar datos localmente
function guardarDatosLocales() {
  try {
    const data = {
      equipos: equipos,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Error guardando datos locales:", error);
  }
}

// Cargar datos locales
function cargarDatosLocales() {
  try {
    const saved = localStorage.getItem(OFFLINE_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      equipos = data.equipos || [];
      return true;
    }
  } catch (error) {
    console.error("Error cargando datos locales:", error);
  }
  return false;
}

// Guardar cambios pendientes
function guardarCambioPendiente(accion, datos) {
  try {
    const cambio = {
      id: Date.now().toString(),
      accion: accion,
      datos: datos,
      timestamp: new Date().toISOString(),
    };

    cambiosPendientes.push(cambio);
    localStorage.setItem(
      PENDING_CHANGES_KEY,
      JSON.stringify(cambiosPendientes)
    );

    showNotification(
      "Modo offline",
      "Cambio guardado localmente. Se sincronizará cuando haya conexión.",
      "warning"
    );
  } catch (error) {
    console.error("Error guardando cambio pendiente:", error);
  }
}

// Cargar cambios pendientes
function cargarCambiosPendientes() {
  try {
    const saved = localStorage.getItem(PENDING_CHANGES_KEY);
    cambiosPendientes = saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error("Error cargando cambios pendientes:", error);
    cambiosPendientes = [];
  }
}

// Sincronizar cambios pendientes
async function sincronizarCambiosPendientes() {
  if (cambiosPendientes.length === 0 || !isOnline) return;

  showFormStatus("Sincronizando cambios...", "info", true);

  try {
    for (const cambio of [...cambiosPendientes]) {
      switch (cambio.accion) {
        case "crear":
          await guardarEquipo(cambio.datos);
          break;
        case "editar":
          await guardarEquipo({ ...cambio.datos, id: cambio.datos.id });
          break;
        case "eliminar":
          await eliminarEquipoAPI(cambio.datos.id);
          break;
      }

      // Remover cambio sincronizado
      cambiosPendientes = cambiosPendientes.filter((c) => c.id !== cambio.id);
    }

    localStorage.setItem(
      PENDING_CHANGES_KEY,
      JSON.stringify(cambiosPendientes)
    );

    if (cambiosPendientes.length === 0) {
      showNotification(
        "Sincronización completada",
        "Todos los cambios se han sincronizado con el servidor",
        "success"
      );
    }

    await cargarEquipos();
  } catch (error) {
    console.error("Error sincronizando cambios:", error);
    showNotification(
      "Error de sincronización",
      "Algunos cambios no pudieron sincronizarse. Se reintentará más tarde.",
      "error"
    );
  } finally {
    hideFormStatus();
  }
}

// ===== API FUNCTIONS (MODIFICADAS PARA OFFLINE) =====
const API_BASE = "/api";

async function apiRequest(endpoint, options = {}) {
  // Si estamos offline, lanzar error específico
  if (!isOnline) {
    throw new Error("OFFLINE_MODE");
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      // No es un JSON o está vacío
    }

    if (!response.ok) {
      const errorMessage = (data && data.error) 
        ? data.error 
        : `Error ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    // Si es error de conexión (offline), lanzar error específico
    if (
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError")
    ) {
      throw new Error("OFFLINE_MODE");
    }
    throw error;
  }
}

// ===== CRUD OPERATIONS (MODIFICADAS PARA OFFLINE) =====
async function cargarEquipos() {
  const tableLoader = document.getElementById("tableLoader");
  try {
    if (tableLoader) tableLoader.classList.remove("d-none");
    
    // Intentar cargar desde servidor
    const query = searchInput.value.trim().toLowerCase();
    const endpoint = query
      ? `/api/equipos?q=${encodeURIComponent(query)}`
      : "/api/equipos";
    
    // Usar fetch directo o apiRequest (pero apiRequest ya tiene la lógica offline)
    equipos = await apiRequest(query ? `/equipos?q=${encodeURIComponent(query)}` : "/equipos");

    // Forzar una pequeña espera para que el spinner sea visible si la conexión es ultra rápida
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Guardar localmente
    guardarDatosLocales();
    renderEquipos();
  } catch (error) {
    if (error.message === "OFFLINE_MODE") {
      if (cargarDatosLocales()) {
        renderEquipos();
        showNotification(
          "Modo offline",
          "Mostrando datos guardados localmente",
          "warning"
        );
      } else {
        showNotification(
          "Sin conexión",
          "No hay datos locales disponibles",
          "error"
        );
      }
    } else {
      console.error("Error cargando equipos:", error);
      showNotification("Error", "No se pudieron cargar los equipos", "error");
    }
  } finally {
    if (tableLoader) tableLoader.classList.add("d-none");
    hideFormStatus();
  }
}

async function guardarEquipo(equipoData) {
  try {
    return await apiRequest("/equipos", {
      method: "POST",
      body: JSON.stringify(equipoData),
    });
  } catch (error) {
    if (error.message === "OFFLINE_MODE") {
      // Guardar localmente
      const accion = equipoData.id ? "editar" : "crear";
      guardarCambioPendiente(accion, equipoData);

      // Actualizar UI localmente
      if (accion === "crear") {
        equipoData.id = "offline_" + Date.now();
        equipos.push(equipoData);
      } else {
        const index = equipos.findIndex((eq) => eq.id === equipoData.id);
        if (index !== -1) {
          equipos[index] = { ...equipos[index], ...equipoData };
        }
      }

      guardarDatosLocales();
      renderEquipos();

      return { id: equipoData.id, success: true, offline: true };
    }
    throw error;
  }
}

async function eliminarEquipoAPI(id) {
  try {
    return await apiRequest(`/equipos/${id}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error.message === "OFFLINE_MODE") {
      // Guardar localmente
      const equipo = equipos.find((eq) => eq.id === id);
      if (equipo) {
        guardarCambioPendiente("eliminar", { id: id, ine: equipo.ine });

        // Actualizar UI localmente
        equipos = equipos.filter((eq) => eq.id !== id);
        guardarDatosLocales();
        renderEquipos();

        return { deleted: true, offline: true };
      }
    }
    throw error;
  }
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

  // El usuario pidió eliminar el spinner de carga del formulario
  if (loading) {
    // Si es carga de equipo, podemos usar un icono de guardando o similar, pero no un spinner animado circular si así lo prefiere
    formStatusIcon.innerHTML = '<i class="bi bi-hourglass-split text-info"></i>';
  } else {
    let iconClass = "bi-info-circle";
    if (type === "success") iconClass = "bi-check-circle";
    if (type === "warning") iconClass = "bi-exclamation-triangle";
    if (type === "error") iconClass = "bi-x-circle";

    formStatusIcon.innerHTML = `<i class="bi ${iconClass} text-${type}"></i>`;
  }

  // Notificamos también vía el sistema de notificaciones para mayor visibilidad
  // si el elemento formStatus está oculto
  const formStatusDiv = document.getElementById("formStatus");
  if (formStatusDiv && !formStatusDiv.classList.contains("hidden-element")) {
     formStatusDiv.classList.add("visible");
  }
}

function hideFormStatus() {
  formStatus.classList.remove("visible");
}

// ===== MANEJO DEL FORMULARIO (MODIFICADO) =====
async function handleGuardarEquipo(e) {
  e.preventDefault();

  // Cambiar estado del botón
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = isOnline
    ? '<span class="loading-spinner"></span> Guardando...'
    : '<span class="loading-spinner"></span> Guardando localmente...';
  submitBtn.disabled = true;

  showFormStatus(
    isOnline ? "Guardando equipo..." : "Guardando localmente...",
    "info",
    true
  );

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

    const resultado = await guardarEquipo(equipoData);

    if (resultado.offline) {
      showNotification(
        "Modo offline",
        "Equipo guardado localmente. Se sincronizará cuando haya conexión.",
        "warning"
      );
      showFormStatus("Equipo guardado localmente", "warning");
    } else {
      const action = editIdInput.value ? "actualizado" : "agregado";
      showNotification("Éxito", `Equipo ${action} correctamente`, "success");
      showFormStatus(`Equipo ${action} correctamente`, "success");
    }

    resetForm();
    await cargarEquipos();
  } catch (error) {
    console.error("Error guardando equipo:", error);
    if (error.message !== "OFFLINE_MODE") {
      showNotification(
        "Error",
        error.message || "Error al guardar el equipo",
        "error"
      );
      showFormStatus("Error al guardar", "error");
    }
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

// ===== RENDERIZADO DE EQUIPOS MEJORADO =====
function renderEquipos() {
  const query = searchInput.value.toLowerCase();
  tablaBody.innerHTML = "";

  // Filtrar también por especificaciones (clave y valor)
  const filtered = equipos.filter((eq) => {
    const baseMatch =
      (eq.ine || "").toLowerCase().includes(query) ||
      (eq.nne || "").toLowerCase().includes(query) ||
      (eq.serie || "").toLowerCase().includes(query) ||
      (eq.tipo || "").toLowerCase().includes(query) ||
      (eq.estado || "").toLowerCase().includes(query) ||
      (eq.responsable || "").toLowerCase().includes(query) ||
      (eq.ubicacion || "").toLowerCase().includes(query);

    if (baseMatch) return true;

    // Revisar especificaciones: puede ser array de {clave, valor}
    if (eq.especificaciones && Array.isArray(eq.especificaciones)) {
      for (const s of eq.especificaciones) {
        const clave = (s.clave || "").toLowerCase();
        const valor = (s.valor || "").toLowerCase();
        if (clave.includes(query) || valor.includes(query)) return true;
      }
    }

    return false;
  });

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

    // Marcar equipos creados offline
    const isOffline = eq.id && eq.id.startsWith("offline_");
    const rowClass = isOffline ? "equipo-offline" : "";

    const row = document.createElement("tr");
    if (rowClass) row.className = rowClass;

    row.innerHTML = `
            <td title="${eq.ine || "-"}">${eq.ine || "-"}</td>
            <td class="nne-column" title="${eq.nne || "-"}">${
      eq.nne || "-"
    }</td>
            <td class="serie-column" title="${eq.serie || "-"}">${
      eq.serie || "-"
    }</td>
            <td title="${eq.tipo || "-"}">${eq.tipo || "-"}</td>
            <td class="${estadoClass}" title="${estadoText}">${estadoText}</td>
            <td title="${eq.responsable || "-"}">${eq.responsable || "-"}</td>
            <td title="${eq.ubicacion || "-"}">${eq.ubicacion || "-"}</td>
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
    // Si estamos offline, cargar desde datos locales
    if (!isOnline) {
      const equipo = equipos.find((eq) => eq.id === id);
      if (equipo) {
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
        showFormStatus("Editando equipo (offline): " + equipo.ine, "info");
        showNotification(
          "Modo edición offline",
          `Estás editando el equipo "${equipo.ine}" localmente`,
          "warning"
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

    // Si estamos online, cargar desde servidor
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

  const mensaje = isOnline
    ? `¿Está seguro de que desea eliminar el equipo "${equipo.ine}"?`
    : `¿Está seguro de que desea eliminar el equipo "${equipo.ine}"? (Se eliminará localmente y se sincronizará después)`;

  if (confirm(mensaje)) {
    try {
      showFormStatus("Eliminando equipo...", "warning", true);
      const resultado = await eliminarEquipoAPI(id);

      if (resultado.offline) {
        showNotification(
          "Modo offline",
          `Equipo "${equipo.ine}" eliminado localmente. Se sincronizará cuando haya conexión.`,
          "warning"
        );
        showFormStatus("Equipo eliminado localmente", "warning");
      } else {
        showNotification(
          "Éxito",
          `Equipo "${equipo.ine}" eliminado correctamente`,
          "success"
        );
        showFormStatus("Equipo eliminado correctamente", "success");
      }

      await cargarEquipos();
    } catch (error) {
      console.error("Error eliminando equipo:", error);
      if (error.message !== "OFFLINE_MODE") {
        showNotification("Error", "No se pudo eliminar el equipo", "error");
        showFormStatus("Error al eliminar", "error");
      }
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

  // Marcar si es equipo offline
  const isOffline = eq.id && eq.id.startsWith("offline_");
  const offlineBadge = isOffline
    ? '<span class="badge bg-warning ms-2">Local</span>'
    : "";

  let html = `
        <div class="modal-header">
            <h2 class="modal-title">
                 <i class="bi bi-pencil-square"></i> Detalles del Equipo ${offlineBadge}
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
            <button type="button" class="btn btn-primary" id="exportCloudModalBtn">
                <i class="bi bi-cloud-arrow-up"></i> Exportar a la Nube
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
  const exportCloudModalBtn = modalContent.querySelector("#exportCloudModalBtn");
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

  if (exportCloudModalBtn) {
    exportCloudModalBtn.addEventListener("click", () => {
      // Sincronizar y cerrar este modal para mostrar el de progreso si se desea, 
      // o mantenerlo abierto. En este caso es mejor cerrar el de detalles.
      document.body.removeChild(modalOverlay);
      sincronizarExcelNube();
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

// ===== MODALES DE ACCIÓN MODERNOS =====
function showActionModal({ title, text, icon = "check-circle", primaryBtn, secondaryBtn, onPrimary, onSecondary }) {
  const overlay = document.createElement("div");
  overlay.className = "action-modal-overlay";
  
  const modal = document.createElement("div");
  modal.className = "action-modal";
  
  modal.innerHTML = `
    <div class="action-modal-icon">
      <i class="bi bi-${icon}"></i>
    </div>
    <h3 class="action-modal-title">${title}</h3>
    <p class="action-modal-text">${text}</p>
    <div class="action-modal-buttons">
      ${secondaryBtn ? `<button class="btn-modal btn-modal-secondary" id="btnSecondary">${secondaryBtn}</button>` : ""}
      <button class="btn-modal ${primaryBtn.class || 'btn-modal-primary'}" id="btnPrimary">
        ${primaryBtn.icon ? `<i class="bi bi-${primaryBtn.icon}"></i>` : ""}
        ${primaryBtn.text}
      </button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  const close = () => {
    modal.style.animation = "scaleIn 0.2s reverse forwards";
    overlay.style.opacity = "0";
    setTimeout(() => document.body.removeChild(overlay), 200);
  };
  
  modal.querySelector("#btnPrimary").onclick = () => {
    if (onPrimary) onPrimary();
    close();
  };
  
  if (secondaryBtn) {
    modal.querySelector("#btnSecondary").onclick = () => {
      if (onSecondary) onSecondary();
      close();
    };
  }
  
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
}

async function sincronizarExcelNube() {
  const modalEl = document.getElementById('syncProgressModal');
  const modal = new bootstrap.Modal(modalEl);
  
  const odBar = document.getElementById('onedriveBar');
  const odText = document.getElementById('onedrivePercent');
  const gdBar = document.getElementById('googledriveBar');
  const gdText = document.getElementById('googledrivePercent');

  // Reset bars
  [odBar, gdBar].forEach(bar => {
    bar.style.width = '0%';
    bar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-danger';
  });
  odText.textContent = '0%';
  gdText.textContent = '0%';

  const updateBar = async (bar, textEl, targetProgress) => {
    return new Promise(resolve => {
      let current = 0;
      const interval = setInterval(() => {
        current += 5;
        if (current > targetProgress) {
          clearInterval(interval);
          resolve();
          return;
        }
        bar.style.width = current + '%';
        textEl.textContent = current + '%';
        
        // Lógica de colores invertida: <25 rojo, <50 naranja, <75 celeste (info), 100 verde
        if (current <= 25) {
          bar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-danger';
        } else if (current <= 50) {
          bar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-warning';
        } else if (current <= 75) {
          bar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-info';
        } else {
          bar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-success';
        }
      }, 50);
    });
  };

  try {
    modal.show();
    
    // Simular progreso inicial de preparación
    await updateBar(odBar, odText, 30);
    
    const response = await fetch("/api/exportar-nube");
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Error en la sincronización");
    }

    // Completar OneDrive
    await updateBar(odBar, odText, 100);
    // Iniciar y completar Google Drive
    await updateBar(gdBar, gdText, 100);

    // Pequeña espera para que se vea el 100%
    await new Promise(r => setTimeout(r, 500));
    modal.hide();
    
    // Mostrar Modal de Éxito Final
    const isSimulated = response.ok && (await response.clone().json()).simulated;
    
    showActionModal({
      title: "¡Éxito!",
      text: isSimulated 
        ? "El reporte ha sido generado. <b>Nota:</b> Para sincronizar los archivos físicamente en tus carpetas de OneDrive y Google Drive, debes ejecutar este proceso desde el sistema en tu PC local."
        : "El reporte Excel ha sido generado y cargado en tu OneDrive y Google Drive correctamente.",
      icon: isSimulated ? "cloud-check" : "cloud-check-fill",
      primaryBtn: {
        text: "Enviar WhatsApp",
        icon: "whatsapp",
        class: "btn-modal-whatsapp"
      },
      secondaryBtn: "Cerrar",
      onPrimary: () => {
        const numero = "5491134569648";
        const mensaje = encodeURIComponent("✅ ¡Hola! He actualizado el reporte de equipos en la nube. Los archivos ya están disponibles en OneDrive y Google Drive.");
        window.open(`https://wa.me/${numero}?text=${mensaje}`, "_blank");
      }
    });

  } catch (error) {
    modal.hide();
    console.error("Error en sincronización nube:", error);
    const mensajeCompleto = error.details 
      ? `${error.message}. Detalle: ${error.details}`
      : error.message;
      
    showNotification("Error de Sincronización", mensajeCompleto, "error", 8000);
  }
}

// ===== INICIALIZACIÓN (MODIFICADA) =====
document.addEventListener("DOMContentLoaded", () => {
  if (form) form.addEventListener("submit", handleGuardarEquipo);
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", cancelarEdicion);
  // Al escribir en la búsqueda, filtrar localmente para incluir especificaciones
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderEquipos();
      // Si se borra la búsqueda, volver a cargar todo el set de datos del API
      // para asegurar consistencia
      if (searchInput.value.trim() === "") {
        cargarEquipos();
      }
    });
  }

  const exportPdfBtn = document.getElementById("exportPdfBtn");
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", exportarPDF);
  }

  const exportCloudBtn = document.getElementById("exportCloudBtn");
  if (exportCloudBtn) {
    exportCloudBtn.addEventListener("click", sincronizarExcelNube);
  }

  // Event listeners para detección de conexión
  window.addEventListener("online", checkOnlineStatus);
  window.addEventListener("offline", checkOnlineStatus);

  // Cargar datos iniciales
  cargarCambiosPendientes();
  checkOnlineStatus();
  cargarEquipos();
});

// Función global para agregar especificaciones
window.addEspecificacionField = addEspecificacionField;
