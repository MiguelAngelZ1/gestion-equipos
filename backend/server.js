const express = require("express");
const cors = require("cors");
const db = require("./db/database"); // Nueva base de datos
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

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
      // BÚSQUEDA CASE-INSENSITIVE
      query += `
                WHERE LOWER(e.ine) LIKE LOWER($1) OR LOWER(e.nne) LIKE LOWER($2) 
                    OR LOWER(e.serie) LIKE LOWER($3) OR LOWER(e.tipo) LIKE LOWER($4) 
                    OR LOWER(e.estado) LIKE LOWER($5) OR LOWER(e.responsable) LIKE LOWER($6) 
                    OR LOWER(e.ubicacion) LIKE LOWER($7)
                    OR LOWER(esp.clave) LIKE LOWER($8) OR LOWER(esp.valor) LIKE LOWER($9)
            `;
      const likeQ = `%${q}%`;
      params.push(...Array(9).fill(likeQ));
    }

    query += ` GROUP BY e.id ORDER BY e.ine`;

    const rows = await db.all(query, params);

    // CORREGIDO: PostgreSQL ya devuelve objetos, no necesita JSON.parse
    const equipos = rows.map((row) => ({
      ...row,
      especificaciones: row.especificaciones || [], // ← Solo esto cambió
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

// Crear o actualizar equipo - VERSIÓN SIMPLIFICADA
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

    // Validaciones
    if (
      !ine ||
      !nne ||
      !serie ||
      !tipo ||
      !estado ||
      !responsable ||
      !ubicacion
    ) {
      return res.status(400).json({
        error: "Todos los campos principales son obligatorios",
      });
    }

    const equipoId = id || `eq_${Date.now()}`;

    // SIMPLIFICADO: Sin transacciones complejas
    if (id) {
      // Actualizar equipo existente
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

      // Eliminar especificaciones antiguas
      await db.run("DELETE FROM especificaciones WHERE equipo_id = ?", [id]);
    } else {
      // Insertar nuevo equipo
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

    // Insertar especificaciones (si las hay)
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

    // VERIFICAR que realmente se guardó
    const equipoGuardado = await db.get("SELECT * FROM equipos WHERE id = ?", [
      equipoId,
    ]);
    console.log(
      "🔍 Equipo verificado en BD:",
      equipoGuardado ? "EXISTE" : "NO EXISTE"
    );

    res.json({ id: equipoId, success: true });
  } catch (err) {
    console.error("❌ Error en POST /api/equipos:", err);
    res.status(500).json({ error: err.message });
  }
});

// Eliminar equipo - CON LOGGING
app.delete("/api/equipos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("🗑️ Eliminando equipo:", id);

    const result = await db.run("DELETE FROM equipos WHERE id = ?", [id]);
    console.log("✅ Eliminación completada, cambios:", result.changes);

    res.json({ deleted: result.changes > 0 });
  } catch (err) {
    console.error("❌ Error en DELETE /api/equipos:", err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para sincronización (solo disponible en producción)
app.post("/api/sync", async (req, res) => {
  try {
    // Solo permitir sincronización si estamos en producción (PostgreSQL)
    if (!process.env.DATABASE_URL) {
      return res.status(400).json({
        error:
          "La sincronización desde el servidor solo está disponible en producción",
        hint: "Usa el script 'npm run sync' desde tu entorno local",
      });
    }

    const sync = require("./db/sync");
    console.log("🔄 Iniciando sincronización desde API...");

    // Ejecutar sincronización en segundo plano
    sync()
      .then(() => {
        console.log("✅ Sincronización completada desde API");
      })
      .catch((error) => {
        console.error("❌ Error en sincronización desde API:", error);
      });

    res.json({
      message: "Sincronización iniciada",
      status: "processing",
      note: "La sincronización se está ejecutando en segundo plano",
    });
  } catch (err) {
    console.error("❌ Error en POST /api/sync:", err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para obtener estado de sincronización
app.get("/api/sync/status", async (req, res) => {
  try {
    const equipos = await db.all("SELECT COUNT(*) as count FROM equipos");
    const count = equipos[0]?.count || 0;

    res.json({
      database: process.env.DATABASE_URL
        ? "PostgreSQL (Railway)"
        : "SQLite (Local)",
      equipos: count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Error en GET /api/sync/status:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ruta catch-all para el frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// Iniciar servidor
app.listen(PORT, async () => {
  console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
  console.log(
    `📊 Modo: ${
      process.env.DATABASE_URL ? "PostgreSQL (Railway)" : "SQLite (Local)"
    }`
  );
  console.log(`🌐 URL: http://localhost:${PORT}`);

  // Conectar a la base de datos
  try {
    await db.connect();
    console.log("✅ Base de datos conectada correctamente");
  } catch (error) {
    console.error("❌ Error conectando a la base de datos:", error);
  }
});
