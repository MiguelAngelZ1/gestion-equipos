const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });


console.log("🔑 DATABASE_PUBLIC_URL:", process.env.DATABASE_PUBLIC_URL);


// Conexión a PostgreSQL usando variable de entorno
const pgPool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

class Database {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;

    try {
      // SQLite para desarrollo local
      const dbPath = path.resolve(__dirname, "../../equipos.db");
      console.log("🔍 Conectando a SQLite en:", dbPath);

      this.client = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error("❌ Error con SQLite:", err.message);
        } else {
          console.log("✅ Conectado a SQLite en:", dbPath);
        }
      });

      this.connected = true;
      await this.initializeTables();
      console.log("✅ Base de datos conectada correctamente");
    } catch (error) {
      console.error("❌ Error conectando a la base de datos:", error);
      throw error;
    }
  }

  async initializeTables() {
    return new Promise((resolve, reject) => {
      this.client.serialize(() => {
        this.client.run(`
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

        this.client.run(
          `
          CREATE TABLE IF NOT EXISTS especificaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipo_id TEXT NOT NULL,
            clave TEXT NOT NULL,
            valor TEXT NOT NULL,
            FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE
          )
        `,
          (err) => {
            if (err) {
              console.error("❌ Error creando tablas:", err);
              reject(err);
            } else {
              console.log("✅ Tablas de SQLite listas");
              resolve();
            }
          }
        );
      });
    });
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.client.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async all(sql, params = []) {
    try {
      if (sql.includes("jsonb_agg") || sql.includes("json_build_object")) {
        const equipos = await this.query(
          "SELECT * FROM equipos ORDER BY ine",
          []
        );
        const equiposConSpecs = await Promise.all(
          equipos.map(async (equipo) => {
            const specs = await this.query(
              "SELECT clave, valor FROM especificaciones WHERE equipo_id = ?",
              [equipo.id]
            );
            return { ...equipo, especificaciones: specs };
          })
        );
        return equiposConSpecs;
      }
      return await this.query(sql, params);
    } catch (error) {
      console.error("Error en consulta:", error);
      throw error;
    }
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.client.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.client.run(sql, params, async (err) => {
        if (err) {
          reject(err);
        } else {
          await this.replicateToPostgres(sql, params);
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async replicateToPostgres(sql, params) {
    try {
      const isWrite = /insert|update|delete/i.test(sql);
      if (!isWrite) return;

      // Convertir placeholders de SQLite (?) a PostgreSQL ($1, $2, ...)
      let pgSql = sql;
      params.forEach((_, i) => {
        pgSql = pgSql.replace("?", `$${i + 1}`);
      });

      await pgPool.query(pgSql, params);
      console.log("🔁 Replicado en PostgreSQL");
    } catch (err) {
      console.error("⚠️ Error replicando en PostgreSQL:", err.message);
    }
  }
}

const db = new Database();
module.exports = db;
