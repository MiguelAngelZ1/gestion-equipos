const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { Client } = require("pg");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");

async function exportToSQLite() {
  try {
    console.log("URL de conexión:", process.env.DATABASE_URL);

    // Conectar a PostgreSQL
    const pgClient = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    await pgClient.connect();
    console.log("✅ Conectado a PostgreSQL");

    // Crear/conectar a SQLite
    const dbPath = path.join(__dirname, "../../equipos.db");
    const db = new sqlite3.Database(dbPath);
    console.log("✅ Base de datos SQLite creada/abierta");

    // Crear tablas en SQLite
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`
                    CREATE TABLE IF NOT EXISTS equipos (
                        id TEXT PRIMARY KEY,
                        ine TEXT NOT NULL,
                        nne TEXT NOT NULL,
                        serie TEXT NOT NULL,
                        tipo TEXT NOT NULL,
                        estado TEXT NOT NULL,
                        responsable TEXT NOT NULL,
                        ubicacion TEXT NOT NULL
                    )
                `);

        db.run(
          `
                    CREATE TABLE IF NOT EXISTS especificaciones (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        equipo_id TEXT NOT NULL,
                        clave TEXT NOT NULL,
                        valor TEXT NOT NULL,
                        FOREIGN KEY (equipo_id) REFERENCES equipos(id)
                    )
                `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    // Exportar datos de equipos
    const equipos = await pgClient.query("SELECT * FROM equipos");
    console.log(`📦 Exportando ${equipos.rows.length} equipos...`);

    for (const equipo of equipos.rows) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO equipos (id, ine, nne, serie, tipo, estado, responsable, ubicacion)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            equipo.id,
            equipo.ine,
            equipo.nne,
            equipo.serie,
            equipo.tipo,
            equipo.estado,
            equipo.responsable,
            equipo.ubicacion,
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Exportar especificaciones
    const specs = await pgClient.query("SELECT * FROM especificaciones");
    console.log(`📦 Exportando ${specs.rows.length} especificaciones...`);

    for (const spec of specs.rows) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO especificaciones (equipo_id, clave, valor)
                     VALUES (?, ?, ?)`,
          [spec.equipo_id, spec.clave, spec.valor],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    console.log("✅ Exportación completada con éxito");

    await pgClient.end();
    db.close();
  } catch (error) {
    console.error("❌ Error durante la exportación:", error);
    process.exit(1);
  }
}

exportToSQLite();
