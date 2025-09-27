const express = require("express");
const cors = require("cors");
const db = require("./db/database"); // Nueva base de datos
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, "../frontend")));

// Health check endpoint para Railway
app.get("/health", (req, res) => {
    res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        database: process.env.DATABASE_URL ? "PostgreSQL" : "SQLite"
    });
});

// Obtener todos los equipos con búsqueda
app.get("/api/equipos", async (req, res) => {
    try {
        const { q } = req.query;
        
        let query = `
            SELECT e.*, 
                json_group_array(json_object('clave', esp.clave, 'valor', esp.valor)) AS especificaciones
            FROM equipos e
            LEFT JOIN especificaciones esp ON e.id = esp.equipo_id
        `;
        const params = [];

        if (q && q.trim() !== '') {
            query += `
                WHERE e.ine LIKE ? OR e.nne LIKE ? OR e.serie LIKE ? OR e.tipo LIKE ? 
                    OR e.estado LIKE ? OR e.responsable LIKE ? OR e.ubicacion LIKE ?
                    OR esp.clave LIKE ? OR esp.valor LIKE ?
            `;
            const likeQ = `%${q}%`;
            params.push(...Array(9).fill(likeQ));
        }

        query += ` GROUP BY e.id ORDER BY e.ine`;

        const rows = await db.all(query, params);
        
        // Parsear especificaciones JSON
        const equipos = rows.map((row) => ({
            ...row,
            especificaciones: row.especificaciones ? JSON.parse(row.especificaciones) : []
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
            especificaciones = []
        } = req.body;

        console.log('📝 Recibiendo datos para guardar:', { id, ine, nne });

        // Validaciones
        if (!ine || !nne || !serie || !tipo || !estado || !responsable || !ubicacion) {
            return res.status(400).json({ 
                error: "Todos los campos principales son obligatorios" 
            });
        }

        const equipoId = id || `eq_${Date.now()}`;

        // SIMPLIFICADO: Sin transacciones complejas
        if (id) {
            // Actualizar equipo existente
            console.log('🔄 Actualizando equipo existente:', id);
            const result = await db.run(
                `UPDATE equipos SET ine = ?, nne = ?, serie = ?, tipo = ?, 
                 estado = ?, responsable = ?, ubicacion = ? WHERE id = ?`,
                [ine, nne, serie, tipo, estado, responsable, ubicacion, id]
            );
            console.log('✅ Equipo actualizado, cambios:', result.changes);
            
            // Eliminar especificaciones antiguas
            await db.run("DELETE FROM especificaciones WHERE equipo_id = ?", [id]);
        } else {
            // Insertar nuevo equipo
            console.log('➕ Insertando nuevo equipo:', equipoId);
            const result = await db.run(
                `INSERT INTO equipos (id, ine, nne, serie, tipo, estado, responsable, ubicacion) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [equipoId, ine, nne, serie, tipo, estado, responsable, ubicacion]
            );
            console.log('✅ Equipo insertado, cambios:', result.changes);
        }

        // Insertar especificaciones (si las hay)
        if (especificaciones.length > 0) {
            console.log('📋 Insertando especificaciones:', especificaciones.length);
            for (const spec of especificaciones) {
                if (spec.clave && spec.valor) {
                    await db.run(
                        "INSERT INTO especificaciones (equipo_id, clave, valor) VALUES (?, ?, ?)",
                        [equipoId, spec.clave.trim(), spec.valor.trim()]
                    );
                }
            }
            console.log('✅ Especificaciones insertadas');
        }

        // VERIFICAR que realmente se guardó
        const equipoGuardado = await db.get("SELECT * FROM equipos WHERE id = ?", [equipoId]);
        console.log('🔍 Equipo verificado en BD:', equipoGuardado ? 'EXISTE' : 'NO EXISTE');

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
        console.log('🗑️ Eliminando equipo:', id);
        
        const result = await db.run("DELETE FROM equipos WHERE id = ?", [id]);
        console.log('✅ Eliminación completada, cambios:', result.changes);
        
        res.json({ deleted: result.changes > 0 });
    } catch (err) {
        console.error("❌ Error en DELETE /api/equipos:", err);
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
    console.log(`📊 Modo: ${process.env.DATABASE_URL ? 'PostgreSQL (Railway)' : 'SQLite (Local)'}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    
    // Conectar a la base de datos
    try {
        await db.connect();
        console.log('✅ Base de datos conectada correctamente');
    } catch (error) {
        console.error('❌ Error conectando a la base de datos:', error);
    }
});