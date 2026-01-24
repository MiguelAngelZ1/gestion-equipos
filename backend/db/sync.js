const sqlite3 = require("sqlite3").verbose();
const { Client } = require("pg");
const path = require("path");
const calcularHashEquipo = require("../sincronizacion/calcularHashEquipo");
const { obtenerEquiposCompletos } = require("../repositorios/equiposRepositorio");
const { sincronizarEquipos } = require("../servicios/sincronizacionEquipos");
const {
  borrarEspecificacionesPorEquipo,
  insertarEspecificaciones
} = require("../repositorios/especificacionesRepositorio");
const { crearStatsSync } = require("../servicios/syncStats");
const { imprimirResumenSync } = require("../servicios/syncLogger");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// Configuración
const SQLITE_PATH = path.resolve(__dirname, "../../equipos.db");
const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

// Función para insertar/actualizar equipo
async function upsertEquipo(db, equipo, isPostgreSQL) {
  if (isPostgreSQL) {
    const sql = `
      INSERT INTO equipos (
        id, ine, nne, serie, tipo, estado,
        responsable, ubicacion, is_deleted,
        created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
      ON CONFLICT (id) DO UPDATE SET
        ine = EXCLUDED.ine,
        nne = EXCLUDED.nne,
        serie = EXCLUDED.serie,
        tipo = EXCLUDED.tipo,
        estado = EXCLUDED.estado,
        responsable = EXCLUDED.responsable,
        ubicacion = EXCLUDED.ubicacion,
        is_deleted = EXCLUDED.is_deleted,
        updated_at = NOW()
    `;

    const params = [
      equipo.id,
      equipo.ine,
      equipo.nne,
      equipo.serie,
      equipo.tipo,
      equipo.estado,
      equipo.responsable,
      equipo.ubicacion,
      equipo.is_deleted ? true : false
    ];

    await db.query(sql, params);
  } else {
    await new Promise((resolve, reject) => {
      db.run(
        `
        INSERT OR REPLACE INTO equipos (
          id, ine, nne, serie, tipo, estado,
          responsable, ubicacion, is_deleted,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          equipo.id,
          equipo.ine,
          equipo.nne,
          equipo.serie,
          equipo.tipo,
          equipo.estado,
          equipo.responsable,
          equipo.ubicacion,
          equipo.is_deleted ? 1 : 0,
          equipo.created_at || new Date().toISOString()
        ],
        err => (err ? reject(err) : resolve())
      );
    });
  }
}

// Función principal de sincronización
async function sync() {
  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL no encontrada.");
    process.exit(1);
  }

  console.log("🔄 Iniciando sincronización bidireccional...");
  console.log("📁 SQLite local:", SQLITE_PATH);
  console.log("🌐 PostgreSQL (Railway):", DATABASE_URL.split("@")[1] || "Railway");

  const sqliteDB = new sqlite3.Database(SQLITE_PATH);
  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const stats = crearStatsSync();

  try {
    await pgClient.connect();

    // Obtener equipos
    const equiposLocal = await obtenerEquiposCompletos(sqliteDB, false);
    const equiposRemote = await obtenerEquiposCompletos(pgClient, true);

    console.log("\n📊 Resumen inicial:");
    console.log(`   • SQLite: ${equiposLocal.length} equipos`);
    console.log(`   • PostgreSQL: ${equiposRemote.length} equipos`);

    const {
      equiposLocalFinal,
      equiposRemoteFinal,
      stats: newStats,
      detalles
    } = await sincronizarEquipos({
      obtenerEquiposLocal: () => obtenerEquiposCompletos(sqliteDB, false),
      obtenerEquiposRemote: () => obtenerEquiposCompletos(pgClient, true),

      actualizarLocal: async (equipo) => {
        await upsertEquipo(sqliteDB, equipo, false);
        await borrarEspecificacionesPorEquipo(sqliteDB, false, equipo.id);
        await insertarEspecificaciones(
          sqliteDB,
          false,
          equipo.id,
          equipo.especificaciones || []
        );
      },

      actualizarRemote: async (equipo) => {
        await upsertEquipo(pgClient, equipo, true);
        await borrarEspecificacionesPorEquipo(pgClient, true, equipo.id);
        await insertarEspecificaciones(
          pgClient,
          true,
          equipo.id,
          equipo.especificaciones || []
        );
      }
    });

    imprimirResumenSync(
      newStats,
      equiposLocalFinal.length,
      equiposRemoteFinal.length,
      detalles
    );

  } catch (error) {
    console.error("❌ Error durante la sincronización:", error);
    throw error;
  } finally {
    sqliteDB.close();
    await pgClient.end();
    console.log("\n🔒 Conexiones cerradas");
  }
}

if (require.main === module) {
  sync()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = sync;
