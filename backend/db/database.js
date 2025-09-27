const { DATABASE_URL } = process.env;
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.isPostgreSQL = !!DATABASE_URL;
        this.client = null;
        this.connected = false;
    }

    async connect() {
        if (this.connected) return;
        
        try {
            if (this.isPostgreSQL) {
                // PostgreSQL para producción (Railway)
                const { Client } = require('pg');
                this.client = new Client({
                    connectionString: DATABASE_URL,
                    ssl: { rejectUnauthorized: false }
                });
                await this.client.connect();
                console.log('✅ Conectado a PostgreSQL (Railway)');
            } else {
                // SQLite para desarrollo local - CORREGIDO
                const sqlite3 = require('sqlite3').verbose();
                
                // Ruta CORREGIDA - busca en directorio actual primero
                let dbPath = './equipos.db'; // Ruta relativa desde donde se ejecuta el servidor
                
                console.log('🔍 Buscando base de datos en:', path.resolve(dbPath));
                console.log('🔍 Directorio actual:', process.cwd());
                
                if (!fs.existsSync(dbPath)) {
                    // Si no encuentra, intenta otra ruta común
                    dbPath = path.join(__dirname, '../../equipos.db');
                    console.log('🔍 Intentando ruta alternativa:', dbPath);
                }
                
                this.client = new sqlite3.Database(dbPath, (err) => {
                    if (err) {
                        console.error('❌ Error abriendo SQLite:', err.message);
                    } else {
                        console.log('✅ Conectado a SQLite en:', path.resolve(dbPath));
                        console.log('✅ Archivo existe:', fs.existsSync(dbPath));
                    }
                });
            }
            
            this.connected = true;
            await this.initializeTables();
        } catch (error) {
            console.error('❌ Error conectando a la base de datos:', error);
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
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            await this.client.query(`
                CREATE TABLE IF NOT EXISTS especificaciones (
                    id SERIAL PRIMARY KEY,
                    equipo_id TEXT NOT NULL,
                    clave TEXT NOT NULL,
                    valor TEXT NOT NULL,
                    FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE
                )
            `);
            console.log('✅ Tablas de PostgreSQL listas');
        } else {
            // SQLite mantiene la estructura actual
            return new Promise((resolve, reject) => {
                this.client.serialize(() => {
                    this.client.run(`CREATE TABLE IF NOT EXISTS equipos (
                        id TEXT PRIMARY KEY,
                        ine TEXT NOT NULL,
                        nne TEXT NOT NULL,
                        serie TEXT NOT NULL,
                        tipo TEXT NOT NULL,
                        estado TEXT NOT NULL,
                        responsable TEXT NOT NULL,
                        ubicacion TEXT NOT NULL
                    )`, (err) => {
                        if (err) {
                            console.error('❌ Error creando tabla equipos:', err);
                            reject(err);
                        } else {
                            console.log('✅ Tabla equipos verificada');
                        }
                    });

                    this.client.run(`CREATE TABLE IF NOT EXISTS especificaciones (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        equipo_id TEXT NOT NULL,
                        clave TEXT NOT NULL,
                        valor TEXT NOT NULL,
                        FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE
                    )`, (err) => {
                        if (err) {
                            console.error('❌ Error creando tabla especificaciones:', err);
                            reject(err);
                        } else {
                            console.log('✅ Tabla especificaciones verificada');
                            resolve();
                        }
                    });
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
                console.error('❌ Error en PostgreSQL query:', error);
                console.error('SQL:', adaptedSQL);
                console.error('Params:', params);
                throw error;
            }
        } else {
            return new Promise((resolve, reject) => {
                if (sql.trim().toUpperCase().startsWith('SELECT')) {
                    this.client.all(sql, params, (err, rows) => {
                        if (err) {
                            console.error('❌ Error en consulta SQLite:', err);
                            reject(err);
                        } else {
                            resolve({ rows, changes: 0 });
                        }
                    });
                } else {
                    this.client.run(sql, params, function(err) {
                        if (err) {
                            console.error('❌ Error ejecutando SQLite:', err);
                            reject(err);
                        } else {
                            resolve({ rows: [], changes: this.changes });
                        }
                    });
                }
            });
        }
    }

    adaptSQLToPostgreSQL(sql) {
        if (!sql) return sql;
        
        let adaptedSQL = sql;
        
        // Reemplazos específicos para PostgreSQL
        adaptedSQL = adaptedSQL.replace(/json_group_array/g, 'jsonb_agg');
        adaptedSQL = adaptedSQL.replace(/json_object\(([^)]+)\)/g, 'json_build_object($1)');
        
        // Manejar diferencias de sintaxis INSERT
        adaptedSQL = adaptedSQL.replace(/INSERT OR REPLACE/gi, 'INSERT');
        adaptedSQL = adaptedSQL.replace(/INSERT OR IGNORE/gi, 'INSERT');
        
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
        const result = await this.query(sql + ' LIMIT 1', params);
        return result.rows[0] || null;
    }

    async run(sql, params = []) {
        const result = await this.query(sql, params);
        return { changes: result.changes, lastID: result.rows[0]?.id };
    }

    // Para transacciones
    async transaction(callback) {
        if (this.isPostgreSQL) {
            try {
                await this.client.query('BEGIN');
                const result = await callback();
                await this.client.query('COMMIT');
                return result;
            } catch (error) {
                await this.client.query('ROLLBACK');
                throw error;
            }
        } else {
            return new Promise((resolve, reject) => {
                this.client.serialize(() => {
                    this.client.run('BEGIN TRANSACTION', (err) => {
                        if (err) reject(err);
                        else {
                            callback()
                                .then((result) => {
                                    this.client.run('COMMIT', (err) => {
                                        if (err) reject(err);
                                        else resolve(result);
                                    });
                                })
                                .catch((error) => {
                                    this.client.run('ROLLBACK', () => reject(error));
                                });
                        }
                    });
                });
            });
        }
    }
}

module.exports = new Database();