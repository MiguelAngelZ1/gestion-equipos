const path = require("path");
const fs = require("fs");

class Database {
  constructor() {
    this.isPostgreSQL = false;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;

    // Detectar si estamos en Railway (PostgreSQL) o local (SQLite)
    // Leemos la variable aquí para asegurar que está disponible
    const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
    this.isPostgreSQL = !!dbUrl;

    try {
      if (this.isPostgreSQL) {
        // PostgreSQL para producción (Railway)
        const { Client } = require("pg");
        this.client = new Client({
          connectionString: dbUrl,
          ssl: { rejectUnauthorized: false },
        });
        await this.client.connect();
        console.log("✅ Conectado a PostgreSQL (Railway)");
      } else {
        // SQLite para desarrollo local
        const sqlite3 = require("sqlite3").verbose();
        const dbPath = path.resolve(__dirname, "../../equipos.db");

        console.log("🔍 Conectando a SQLite en:", dbPath);

        this.client = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            console.error("❌ Error con SQLite:", err.message);
          } else {
            console.log("✅ Conectado a SQLite en:", dbPath);
          }
        });
      }

      this.connected = true;
      await this.initializeTables();
    } catch (error) {
      console.error("❌ Error conectando a la base de datos:", error);
      throw error;
    }
  }

  async initializeTables() {
    if (this.isPostgreSQL) {
      // Crear tablas en PostgreSQL
      await this.client.query(`
                CREATE TABLE IF NOT EXISTS equipos (
                    id TEXT PRIMARY KEY,
                    ine TEXT NOT NULL,
                    nne TEXT NOT NULL,
                    serie TEXT NOT NULL,
                    tipo TEXT NOT NULL,
                    estado TEXT NOT NULL,
                    responsable TEXT NOT NULL,
                    ubicacion TEXT NOT NULL,
                    is_deleted BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);

      // Asegurar columnas existen (migración segura)
      await this.client.query(`ALTER TABLE equipos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
      await this.client.query(`ALTER TABLE equipos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

      await this.client.query(`
                CREATE TABLE IF NOT EXISTS especificaciones (
                    id SERIAL PRIMARY KEY,
                    equipo_id TEXT NOT NULL,
                    clave TEXT NOT NULL,
                    valor TEXT NOT NULL,
                    FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE
                )
            `);
      console.log("✅ Tablas de PostgreSQL listas");
    } else {
      // SQLite mantiene la estructura actual
      return new Promise((resolve, reject) => {
        this.client.serialize(() => {
          this.client.run(
            `CREATE TABLE IF NOT EXISTS equipos (
                        id TEXT PRIMARY KEY,
                        ine TEXT NOT NULL,
                        nne TEXT NOT NULL,
                        serie TEXT NOT NULL,
                        tipo TEXT NOT NULL,
                        estado TEXT NOT NULL,
                        responsable TEXT NOT NULL,
                        is_deleted INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`, (err) => { if (err) reject(err); });

          // Migraciones para SQLite
          this.client.run(`ALTER TABLE equipos ADD COLUMN is_deleted INTEGER DEFAULT 0`, (err) => {});
          this.client.run(`ALTER TABLE equipos ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {});
          this.client.run(`ALTER TABLE equipos ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {});

          this.client.run(
            `CREATE TABLE IF NOT EXISTS especificaciones (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        equipo_id TEXT NOT NULL,
                        clave TEXT NOT NULL,
                        valor TEXT NOT NULL,
                        FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE
                    )`,
            (err) => {
              if (err) reject(err);
              else {
                console.log("✅ Tablas de SQLite listas");
                resolve();
              }
            }
          );
        });
      });
    }
  }

  // Método universal para consultas
  async query(sql, params = []) {
    if (!this.connected) await this.connect();

    if (this.isPostgreSQL) {
      // Adaptar consultas SQLite a PostgreSQL
      const adaptedSQL = this.adaptSQLToPostgreSQL(sql);
      try {
        const result = await this.client.query(adaptedSQL, params);
        return { rows: result.rows, changes: result.rowCount };
      } catch (error) {
        console.error("❌ Error en PostgreSQL query:", error);
        console.error("SQL:", adaptedSQL);
        console.error("Params:", params);
        throw error;
      }
    } else {
      return new Promise((resolve, reject) => {
        if (sql.trim().toUpperCase().startsWith("SELECT")) {
          this.client.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows, changes: 0 });
          });
        } else {
          this.client.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ rows: [], changes: this.changes });
          });
        }
      });
    }
  }

  adaptSQLToPostgreSQL(sql) {
    if (!sql) return sql;

    let adaptedSQL = sql;

    // Convertir parámetros ? a $1, $2, $3...
    let paramCount = 0;
    adaptedSQL = adaptedSQL.replace(/\?/g, () => {
      paramCount++;
      return `$${paramCount}`;
    });

    // Reemplazos específicos para PostgreSQL
    adaptedSQL = adaptedSQL.replace(/json_group_array/g, "jsonb_agg");
    adaptedSQL = adaptedSQL.replace(
      /json_object\(([^)]+)\)/g,
      "json_build_object($1)"
    );

    // Correcciones comunes
    adaptedSQL = adaptedSQL.replace(/responsible/g, "responsable");

    // Manejar diferencias de sintaxis INSERT
    adaptedSQL = adaptedSQL.replace(/INSERT OR REPLACE/gi, "INSERT");
    adaptedSQL = adaptedSQL.replace(/INSERT OR IGNORE/gi, "INSERT");

    // Caracteres de escape
    adaptedSQL = adaptedSQL.replace(/`/g, '"');

    return adaptedSQL;
  }

  // Métodos compatibles
  async all(sql, params = []) {
    const result = await this.query(sql, params);
    return result.rows;
  }

  async get(sql, params = []) {
    const result = await this.query(sql + " LIMIT 1", params);
    return result.rows[0] || null;
  }

  async run(sql, params = []) {
    const result = await this.query(sql, params);
    return { changes: result.changes, lastID: result.rows[0]?.id };
  }
}

module.exports = new Database();
