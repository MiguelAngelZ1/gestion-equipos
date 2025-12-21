const express = require("express");
const cors = require("cors");
const db = require("./db/database"); // Nueva base de datos
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Stub para evitar ReferenceError si no hay gestor real
const autoSyncManager = null;

// Función para disparar sincronización automática
function triggerAutoSync() {
  // Disparar sincronización si tenemos DATABASE_URL (para sincronizar con Railway)
  if (process.env.DATABASE_URL && autoSyncManager) {
    try {
      console.log(
        "🔄 [Server] Disparando sincronización automática desde servidor..."
      );
      autoSyncManager.triggerSyncNow();
    } catch (error) {
      console.error(
        "❌ [Server] Error disparando sincronización:",
        error.message
      );
    }
  }
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

// Health check endpoint para Railway
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: process.env.DATABASE_URL ? "PostgreSQL" : "SQLite",
  });
});

// Obtener todos los equipos con búsqueda - VERSIÓN CASE-INSENSITIVE
app.get("/api/equipos", async (req, res) => {
  try {
    const { q } = req.query;

    let query = `
      SELECT e.*, 
          jsonb_agg(json_build_object('clave', esp.clave, 'valor', esp.valor)) AS especificaciones
      FROM equipos e
      LEFT JOIN especificaciones esp ON e.id = esp.equipo_id
    `;
    const params = [];

    if (q && q.trim() !== "") {
      const likeQ = `%${q}%`;
      query += `
        WHERE LOWER(e.ine) LIKE LOWER($1) OR LOWER(e.nne) LIKE LOWER($2) 
            OR LOWER(e.serie) LIKE LOWER($3) OR LOWER(e.tipo) LIKE LOWER($4) 
            OR LOWER(e.estado) LIKE LOWER($5) OR LOWER(e.responsable) LIKE LOWER($6) 
            OR LOWER(e.ubicacion) LIKE LOWER($7)
            OR LOWER(esp.clave) LIKE LOWER($8) OR LOWER(esp.valor) LIKE LOWER($9)
      `;
      params.push(...Array(9).fill(likeQ));
    }

    query += ` GROUP BY e.id ORDER BY e.ine`;

    const rows = await db.all(query, params);

    const equipos = rows.map((row) => ({
      ...row,
      especificaciones: row.especificaciones || [],
    }));

    res.json(equipos);
  } catch (err) {
    console.error("Error en /api/equipos:", err);
    res.status(500).json({ error: err.message });
  }
});

// Obtener un equipo específico
app.get("/api/equipos/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const equipo = await db.get("SELECT * FROM equipos WHERE id = ?", [id]);
    if (!equipo) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    const especificaciones = await db.all(
      "SELECT clave, valor FROM especificaciones WHERE equipo_id = ?",
      [id]
    );

    res.json({ ...equipo, especificaciones });
  } catch (err) {
    console.error("Error en /api/equipos/:id:", err);
    res.status(500).json({ error: err.message });
  }
});

// Crear o actualizar equipo
app.post("/api/equipos", async (req, res) => {
  try {
    const {
      id,
      ine,
      nne,
      serie,
      tipo,
      estado,
      responsable,
      ubicacion,
      especificaciones = [],
    } = req.body;

    console.log("📝 Recibiendo datos para guardar:", { id, ine, nne });

    if (
      !ine ||
      !nne ||
      !serie ||
      !tipo ||
      !estado ||
      !responsable ||
      !ubicacion
    ) {
      return res
        .status(400)
        .json({ error: "Todos los campos principales son obligatorios" });
    }

    const equipoId = id || `eq_${Date.now()}`;

    if (id) {
      console.log("🔄 Actualizando equipo existente:", id);
      const updateSQL = process.env.DATABASE_URL
        ? `UPDATE equipos SET ine = $1, nne = $2, serie = $3, tipo = $4, 
                 estado = $5, responsable = $6, ubicacion = $7, updated_at = NOW() WHERE id = $8`
        : `UPDATE equipos SET ine = ?, nne = ?, serie = ?, tipo = ?, 
                 estado = ?, responsable = ?, ubicacion = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const result = await db.run(updateSQL, [
        ine,
        nne,
        serie,
        tipo,
        estado,
        responsable,
        ubicacion,
        id,
      ]);
      console.log("✅ Equipo actualizado, cambios:", result.changes);
      await db.run("DELETE FROM especificaciones WHERE equipo_id = ?", [id]);
    } else {
      console.log("➕ Insertando nuevo equipo:", equipoId);
      const insertSQL = process.env.DATABASE_URL
        ? `INSERT INTO equipos (id, ine, nne, serie, tipo, estado, responsable, ubicacion, created_at, updated_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`
        : `INSERT INTO equipos (id, ine, nne, serie, tipo, estado, responsable, ubicacion, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      const result = await db.run(insertSQL, [
        equipoId,
        ine,
        nne,
        serie,
        tipo,
        estado,
        responsable,
        ubicacion,
      ]);
      console.log("✅ Equipo insertado, cambios:", result.changes);
    }

    if (especificaciones.length > 0) {
      console.log("📋 Insertando especificaciones:", especificaciones.length);
      for (const spec of especificaciones) {
        if (spec.clave && spec.valor) {
          await db.run(
            "INSERT INTO especificaciones (equipo_id, clave, valor) VALUES (?, ?, ?)",
            [equipoId, spec.clave.trim(), spec.valor.trim()]
          );
        }
      }
      console.log("✅ Especificaciones insertadas");
    }

    const equipoGuardado = await db.get("SELECT * FROM equipos WHERE id = ?", [
      equipoId,
    ]);
    console.log(
      "🔍 Equipo verificado en BD:",
      equipoGuardado ? "EXISTE" : "NO EXISTE"
    );

    triggerAutoSync();

    res.json({ id: equipoId, success: true });
  } catch (err) {
    console.error("❌ Error en POST /api/equipos:", err);
    res.status(500).json({ error: err.message });
  }
});

// Eliminar equipo
app.delete("/api/equipos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("🗑️ Eliminando equipo:", id);

    const result = await db.run("DELETE FROM equipos WHERE id = ?", [id]);
    console.log("✅ Eliminación completada, cambios:", result.changes);

    if (result.changes > 0) {
      triggerAutoSync();
    }

    res.json({ deleted: result.changes > 0 });
  } catch (err) {
    console.error("❌ Error en DELETE /api/equipos:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ruta catch-all
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// Iniciar servidor
const server = app.listen(PORT, async () => {
  console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
  console.log(
    `📊 Modo: ${
      process.env.DATABASE_URL ? "PostgreSQL (Railway)" : "SQLite (Local)"
    }`
  );
  console.log(`🌐 URL: http://localhost:${PORT}`);

  try {
    await db.connect();
  } catch (error) {
    console.error("❌ Error conectando a la base de datos:", error);
  }

  // Stub evita ReferenceError
  if (autoSyncManager && process.env.DATABASE_URL) {
    setTimeout(() => {
      autoSyncManager.startAutoSync();
    }, 2000);
  }
});

// Manejar errores del servidor
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`❌ Error: El puerto ${PORT} ya está en uso`);
    console.error(
      `💡 Solución: Cierra el proceso que está usando el puerto ${PORT}`
    );
    console.error(`💡 O ejecuta: cerrar-puerto-3000.bat`);
    console.error(
      `💡 O cambia el puerto con: PORT=3001 node backend/server.js`
    );
    process.exit(1);
  } else {
    console.error("❌ Error del servidor:", error);
    process.exit(1);
  }
});
