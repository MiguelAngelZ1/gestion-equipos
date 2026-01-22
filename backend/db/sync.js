const sqlite3 = require("sqlite3").verbose();
const { Client } = require("pg");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// Configuración
const SQLITE_PATH = path.resolve(__dirname, "../../equipos.db");
const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

// Función para calcular hash de un equipo (para detectar cambios)
function getEquipoHash(equipo) {
  const data = `${equipo.id}|${equipo.ine}|${equipo.nne}|${equipo.serie}|${equipo.tipo}|${equipo.estado}|${equipo.responsable}|${equipo.ubicacion}|${equipo.is_deleted}`;
  return crypto.createHash("md5").update(data).digest("hex");
}

// Función para obtener todos los equipos con sus especificaciones
async function getEquiposCompletos(db, isPostgreSQL) {
  let equipos;
  if (isPostgreSQL) {
    const result = await db.query(`SELECT * FROM equipos ORDER BY id`);
    equipos = result.rows;
  } else {
    equipos = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM equipos ORDER BY id`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Obtener especificaciones para cada equipo de forma separada para evitar SQL complejo
  const equiposCompletos = [];
  for (const equipo of equipos) {
    let specs;
    if (isPostgreSQL) {
      const result = await db.query(
        `SELECT clave, valor FROM especificaciones WHERE equipo_id = $1`,
        [equipo.id]
      );
      specs = result.rows;
    } else {
      specs = await new Promise((resolve, reject) => {
        db.all(
          `SELECT clave, valor FROM especificaciones WHERE equipo_id = ?`,
          [equipo.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    equiposCompletos.push({ ...equipo, especificaciones: specs || [] });
  }
  return equiposCompletos;
}

// Función para insertar/actualizar equipo
async function upsertEquipo(db, equipo, isPostgreSQL) {
  if (isPostgreSQL) {
    const sql = `INSERT INTO equipos (id, ine, nne, serie, tipo, estado, responsable, ubicacion, is_deleted, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         ine = EXCLUDED.ine,
         nne = EXCLUDED.nne,
         serie = EXCLUDED.serie,
         tipo = EXCLUDED.tipo,
         estado = EXCLUDED.estado,
         responsable = EXCLUDED.responsable,
         ubicacion = EXCLUDED.ubicacion,
         is_deleted = EXCLUDED.is_deleted,
         updated_at = NOW()`;
    
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
    // SQLite... (mantenemos igual)
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO equipos (id, ine, nne, serie, tipo, estado, responsable, ubicacion, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
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
          equipo.created_at || new Date().toISOString(),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
}

// Función para sincronizar especificaciones
async function syncEspecificaciones(
  db,
  equipoId,
  especificaciones,
  isPostgreSQL
) {
  // Eliminar especificaciones existentes
  if (isPostgreSQL) {
    await db.query(`DELETE FROM especificaciones WHERE equipo_id = $1`, [
      equipoId,
    ]);
  } else {
    await new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM especificaciones WHERE equipo_id = ?`,
        [equipoId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Insertar nuevas especificaciones
  if (
    especificaciones &&
    Array.isArray(especificaciones) &&
    especificaciones.length > 0
  ) {
    for (const spec of especificaciones) {
      // Manejar tanto objetos como arrays simples
      const clave = spec.clave || (typeof spec === "string" ? spec : null);
      const valor = spec.valor || (Array.isArray(spec) ? spec[1] : null);

      if (clave && valor) {
        if (isPostgreSQL) {
          await db.query(
            `INSERT INTO especificaciones (equipo_id, clave, valor) VALUES ($1, $2, $3)`,
            [equipoId, String(clave).trim(), String(valor).trim()]
          );
        } else {
          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO especificaciones (equipo_id, clave, valor) VALUES (?, ?, ?)`,
              [equipoId, String(clave).trim(), String(valor).trim()],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }
      }
    }
  }
}

// Función principal de sincronización
async function sync() {
  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL no encontrada.");
    console.log(
      "💡 Este script necesita DATABASE_URL para sincronizar con Railway."
    );
    process.exit(1);
  }

  console.log("🔄 Iniciando sincronización bidireccional...");
  console.log("📁 SQLite local:", SQLITE_PATH);
  console.log(
    "🌐 PostgreSQL (Railway):",
    DATABASE_URL.split("@")[1] || "Railway"
  );

  // Conectar a SQLite
  const sqliteDB = new sqlite3.Database(SQLITE_PATH, (err) => {
    if (err) {
      console.error("❌ Error conectando a SQLite:", err.message);
      process.exit(1);
    }
    console.log("✅ Conectado a SQLite");
  });

  // Conectar a PostgreSQL
  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pgClient.connect();
    console.log("✅ Conectado a PostgreSQL");

    // Asegurar que las columnas de sincronización existen
    console.log("\n🔧 Verificando estructura de tablas...");
    try {
      await pgClient.query(`
        ALTER TABLE equipos 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
      `);
      await pgClient.query(`
        ALTER TABLE equipos 
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
      `);
    } catch (err) {
      console.log(
        "⚠️  Nota: Algunas columnas ya existen o hay un error:",
        err.message
      );
    }

    // Para SQLite
    await new Promise((resolve) => {
      sqliteDB.run(
        `ALTER TABLE equipos ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        () => resolve()
      );
      sqliteDB.run(
        `ALTER TABLE equipos ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        () => resolve()
      );
    });

    // Obtener todos los equipos de ambas bases de datos
    console.log("\n📦 Obteniendo equipos de SQLite...");
    const equiposLocal = await getEquiposCompletos(sqliteDB, false);

    console.log("📦 Obteniendo equipos de PostgreSQL...");
    const equiposRemote = await getEquiposCompletos(pgClient, true);

    console.log(`\n📊 Resumen inicial:`);
    console.log(`   • SQLite: ${equiposLocal.length} equipos`);
    console.log(`   • PostgreSQL: ${equiposRemote.length} equipos`);

    // Crear mapas para comparación rápida
    const localMap = new Map(equiposLocal.map((e) => [e.id, e]));
    const remoteMap = new Map(equiposRemote.map((e) => [e.id, e]));

    let stats = {
      created: 0,
      updated: 0,
      conflicts: 0,
    };

    // Sincronizar de Local a Remote (SQLite -> PostgreSQL)
    console.log("\n⬆️  Sincronizando Local → Remote...");
    for (const equipoLocal of equiposLocal) {
      const equipoRemote = remoteMap.get(equipoLocal.id);

      if (!equipoRemote) {
        // Equipo solo existe en local, crear en remote
        console.log(`   ➕ Creando equipo ${equipoLocal.id} en Remote`);
        await upsertEquipo(pgClient, equipoLocal, true);
        await syncEspecificaciones(
          pgClient,
          equipoLocal.id,
          equipoLocal.especificaciones || [],
          true
        );
        stats.created++;
      } else {
        // Comparar timestamps para ver cuál es más reciente
        const localTime = new Date(
          equipoLocal.updated_at || equipoLocal.created_at || 0
        );
        const remoteTime = new Date(
          equipoRemote.updated_at || equipoRemote.created_at || 0
        );

        if (localTime > remoteTime) {
          // Local es más reciente, actualizar remote
          console.log(
            `   🔄 Actualizando equipo ${equipoLocal.id} en Remote (local más reciente)`
          );
          await upsertEquipo(pgClient, equipoLocal, true);
          await syncEspecificaciones(
            pgClient,
            equipoLocal.id,
            equipoLocal.especificaciones || [],
            true
          );
          stats.updated++;
        } else if (localTime < remoteTime) {
          // Remote es más reciente, se manejará en la siguiente fase
          stats.conflicts++;
        } else {
          // Mismo timestamp, verificar si hay diferencias
          const localHash = getEquipoHash(equipoLocal);
          const remoteHash = getEquipoHash(equipoRemote);
          if (localHash !== remoteHash) {
            console.log(
              `   ⚠️  Conflicto detectado en ${equipoLocal.id}, usando versión más reciente`
            );
            // Por defecto, usar la versión más reciente (ya está en remote)
            stats.conflicts++;
          }
        }
      }
    }

    // Sincronizar de Remote a Local (PostgreSQL -> SQLite)
    console.log("\n⬇️  Sincronizando Remote → Local...");
    for (const equipoRemote of equiposRemote) {
      const equipoLocal = localMap.get(equipoRemote.id);

      if (!equipoLocal) {
        // Equipo solo existe en remote, crear en local
        console.log(`   ➕ Creando equipo ${equipoRemote.id} en Local`);
        await upsertEquipo(sqliteDB, equipoRemote, false);
        await syncEspecificaciones(
          sqliteDB,
          equipoRemote.id,
          equipoRemote.especificaciones || [],
          false
        );
        stats.created++;
      } else {
        // Comparar timestamps
        const localTime = new Date(
          equipoLocal.updated_at || equipoLocal.created_at || 0
        );
        const remoteTime = new Date(
          equipoRemote.updated_at || equipoRemote.created_at || 0
        );

        if (remoteTime > localTime) {
          // Remote es más reciente, actualizar local
          console.log(
            `   🔄 Actualizando equipo ${equipoRemote.id} en Local (remote más reciente)`
          );
          await upsertEquipo(sqliteDB, equipoRemote, false);
          await syncEspecificaciones(
            sqliteDB,
            equipoRemote.id,
            equipoRemote.especificaciones || [],
            false
          );
          stats.updated++;
        }
        // Si local es más reciente, ya se manejó en la fase anterior
      }
    }

    // Verificar resultado final
    const equiposLocalFinal = await getEquiposCompletos(sqliteDB, false);
    const equiposRemoteFinal = await getEquiposCompletos(pgClient, true);

    console.log("\n🎉 Sincronización completada!");
    console.log("📊 Resumen:");
    console.log(`   • Equipos creados: ${stats.created}`);
    console.log(`   • Equipos actualizados: ${stats.updated}`);
    console.log(`   • Conflictos detectados: ${stats.conflicts}`);
    console.log(`\n📊 Estado final:`);
    console.log(`   • SQLite: ${equiposLocalFinal.length} equipos`);
    console.log(`   • PostgreSQL: ${equiposRemoteFinal.length} equipos`);

    if (equiposLocalFinal.length === equiposRemoteFinal.length) {
      console.log("✅ Ambas bases de datos están sincronizadas!");
    } else {
      console.log(
        "⚠️  Las bases de datos tienen diferentes cantidades de equipos."
      );
    }
  } catch (error) {
    console.error("❌ Error durante la sincronización:", error);
    throw error;
  } finally {
    sqliteDB.close();
    await pgClient.end();
    console.log("\n🔒 Conexiones cerradas");
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  sync()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error fatal:", error);
      process.exit(1);
    });
}

module.exports = sync;
