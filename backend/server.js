const express = require("express");
const cors = require("cors");
const db = require("./db/database"); // Nueva base de datos
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

// La sincronización automática se maneja directamente importando el script de sync
const syncScript = require("./db/sync");

// Función para disparar sincronización automática
function triggerAutoSync() {
  const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  if (dbUrl) {
    try {
      console.log("🔄 [Server] Cambios detectados. Sincronizando con la nube...");
      syncScript().catch((error) => {
        console.error("❌ [Server] Error en sincronización de fondo:", error.message);
      });
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

// Endpoint para exportar a la Nube (vía Excel)
app.get("/api/exportar-nube", async (req, res) => {
  let tempExcelPath = "";
  let tempDataPath = "";
  
  try {
    const isLocal = !(process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL);
    console.log("📊 [Server] Iniciando sincronización a la nube...");
    
    const timestamp = Date.now();
    tempExcelPath = path.join(__dirname, `../temp_export_${timestamp}.xlsx`);
    tempDataPath = path.join(__dirname, `../temp_data_${timestamp}.json`);
    
    // 1. Obtener datos
    const isPG = !isLocal;
    const deletedFilter = isPG 
      ? "(is_deleted IS NULL OR is_deleted = false)"
      : "(is_deleted IS NULL OR is_deleted = 0)";
    
    const equiposRaw = await db.all(`SELECT * FROM equipos WHERE ${deletedFilter} ORDER BY ine`);
    const equiposFull = [];
    
    for (const eq of equiposRaw) {
      const specs = await db.all("SELECT clave, valor FROM especificaciones WHERE equipo_id = ?", [eq.id]);
      equiposFull.push({ ...eq, especificaciones: specs || [] });
    }

    // 2. JSON temporal
    fs.writeFileSync(tempDataPath, JSON.stringify(equiposFull));
    
    // 3. Ejecutar Python
    const tryPython = (cmd, args, callback) => {
      exec(`${cmd} ${args}`, (error, stdout, stderr) => {
        if (error && cmd === 'python3') return tryPython('python', args, callback);
        callback(error, stdout, stderr);
      });
    };

    const scriptPath = path.join(__dirname, "../exportar_a_excel.py");
    const pythonArgs = `"${scriptPath}" "${tempExcelPath}" "${tempDataPath}"`;
    
    tryPython('python3', pythonArgs, (error, stdout, stderr) => {
      // Limpieza inmediata de datos
      if (fs.existsSync(tempDataPath)) fs.unlinkSync(tempDataPath);
      
      if (error) {
        console.error(`❌ [Server] Error Python: ${stderr || error.message}`);
        return res.status(500).json({ 
          error: "Error en el proceso de sincronización", 
          details: stderr || error.message 
        });
      }
      
      // Limpieza de Excel temp
      if (fs.existsSync(tempExcelPath)) fs.unlinkSync(tempExcelPath);
      
      console.log("✅ [Server] Sincronización completada exitosamente.");
      res.json({ 
        success: true, 
        message: "Sincronización completada", 
        isLocal: os.platform() === 'win32'
      });
    });
  } catch (err) {
    console.error("❌ [Server] Error crítico:", err);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint para Railway
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: (process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL) ? "PostgreSQL" : "SQLite",
  });
});


// Obtener todos los equipos con búsqueda - VERSIÓN CASE-INSENSITIVE
app.get("/api/equipos", async (req, res) => {
  try {
    const { q } = req.query;
    
    // Obtener equipos que NO estén eliminados
    // Usamos una sintaxis compatible con SQLite (0/1) y PostgreSQL (false/true)
    const isPG = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
    let equiposQuery = isPG 
      ? "SELECT * FROM equipos WHERE (is_deleted IS NULL OR is_deleted = false)"
      : "SELECT * FROM equipos WHERE (is_deleted IS NULL OR is_deleted = 0)";
    
    const params = [];

    if (q && q.trim() !== "") {
      const likeQ = `%${q}%`;
      equiposQuery += `
        AND (LOWER(ine) LIKE LOWER(?) OR LOWER(nne) LIKE LOWER(?) 
            OR LOWER(serie) LIKE LOWER(?) OR LOWER(tipo) LIKE LOWER(?) 
            OR LOWER(estado) LIKE LOWER(?) OR LOWER(responsable) LIKE LOWER(?) 
            OR LOWER(ubicacion) LIKE LOWER(?))
      `;
      params.push(...Array(7).fill(likeQ));
    }

    equiposQuery += " ORDER BY ine";

    const equipos = await db.all(equiposQuery, params);

    // Obtener especificaciones para cada equipo
    for (const equipo of equipos) {
      const especificaciones = await db.all(
        "SELECT clave, valor FROM especificaciones WHERE equipo_id = ?",
        [equipo.id]
      );
      equipo.especificaciones = especificaciones || [];
    }

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

    // Validar duplicados de NNE o Serie (solo en equipos no eliminados y que no sean placeholders)
    const isPG = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
    const deletedFilter = isPG 
      ? "(is_deleted IS NULL OR is_deleted = false)"
      : "(is_deleted IS NULL OR is_deleted = 0)";

    if (nne && nne.trim() !== "" && nne.trim() !== "-") {
      const existingNNE = await db.get(
        `SELECT id, ine FROM equipos WHERE nne = ? AND ${deletedFilter} AND id != ?`,
        [nne.trim(), id || '']
      );
      if (existingNNE) {
        return res.status(400).json({ 
          error: `El NNE "${nne}" ya está registrado en el equipo: ${existingNNE.ine}` 
        });
      }
    }

    if (serie && serie.trim() !== "" && serie.trim() !== "-") {
      const existingSerie = await db.get(
        `SELECT id, ine FROM equipos WHERE serie = ? AND ${deletedFilter} AND id != ?`,
        [serie.trim(), id || '']
      );
      if (existingSerie) {
        return res.status(400).json({ 
          error: `El número de serie "${serie}" ya está registrado en el equipo: ${existingSerie.ine}` 
        });
      }
    }

    const equipoId = id || `eq_${Date.now()}`;

    if (id) {
      console.log("🔄 Actualizando equipo existente:", id);
      const updateSQL = (process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL)
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
      const insertSQL = (process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL)
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
    console.log("🗑️ Marcando equipo como eliminado:", id);

    const deleteSQL = (process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL)
        ? `UPDATE equipos SET is_deleted = true, updated_at = NOW() WHERE id = $1`
        : `UPDATE equipos SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    const result = await db.run(deleteSQL, [id]);
    console.log("✅ Borrado lógico completado, cambios:", result.changes);

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
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  console.log(
    `📊 Modo: ${
      dbUrl ? "PostgreSQL (Railway)" : "SQLite (Local)"
    }`
  );
  console.log(`🌐 URL: http://localhost:${PORT}`);

  try {
    await db.connect();
    
    // Iniciar sincronización inmediata al arrancar el servidor
    // Solo si hay DATABASE_URL configurada
    if (dbUrl) {
      console.log("🔄 [Server] Iniciando sincronización de arranque...");
      const sync = require('./db/sync');
      sync().catch(err => console.error("⚠️ [Server] Error en sincronización inicial:", err.message));
    }
  } catch (error) {
    console.error("❌ [Server] Error conectando a la base de datos:", error);
  }

  // El servidor está listo y la sincronización de arranque se ejecutó en el bloque try anterior
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
