const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Client } = require('pg');

// Configuración
const SQLITE_PATH = path.resolve(__dirname, '../../equipos.db');
const { DATABASE_URL } = process.env;

async function migrate() {
    if (!DATABASE_URL) {
        console.error('❌ DATABASE_URL no encontrada. Este script es para migrar a PostgreSQL.');
        console.log('💡 Ejecuta este script en un entorno con DATABASE_URL (como Railway)');
        process.exit(1);
    }

    console.log('🚀 Iniciando migración de SQLite a PostgreSQL...');
    console.log('📁 SQLite:', SQLITE_PATH);
    console.log('🌐 PostgreSQL:', DATABASE_URL.split('@')[1] || 'Railway');

    // Conectar a SQLite
    const sqliteDB = new sqlite3.Database(SQLITE_PATH, (err) => {
        if (err) {
            console.error('❌ Error conectando a SQLite:', err.message);
            process.exit(1);
        }
        console.log('✅ Conectado a SQLite');
    });

    // Conectar a PostgreSQL
    const pgClient = new Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pgClient.connect();
        console.log('✅ Conectado a PostgreSQL');

        // Migrar equipos
        console.log('📦 Migrando tabla "equipos"...');
        const equipos = await new Promise((resolve, reject) => {
            sqliteDB.all('SELECT * FROM equipos', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (equipos.length > 0) {
            for (const equipo of equipos) {
                await pgClient.query(
                    `INSERT INTO equipos (id, ine, nne, serie, tipo, estado, responsable, ubicacion) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                     ON CONFLICT (id) DO NOTHING`,
                    [equipo.id, equipo.ine, equipo.nne, equipo.serie, equipo.tipo, 
                     equipo.estado, equipo.responsable, equipo.ubicacion]
                );
            }
            console.log(`✅ Migrados ${equipos.length} equipos`);
        }

        // Migrar especificaciones
        console.log('📦 Migrando tabla "especificaciones"...');
        const especificaciones = await new Promise((resolve, reject) => {
            sqliteDB.all('SELECT * FROM especificaciones', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (especificaciones.length > 0) {
            for (const spec of especificaciones) {
                await pgClient.query(
                    `INSERT INTO especificaciones (id, equipo_id, clave, valor) 
                     VALUES ($1, $2, $3, $4) 
                     ON CONFLICT (id) DO NOTHING`,
                    [spec.id, spec.equipo_id, spec.clave, spec.valor]
                );
            }
            console.log(`✅ Migradas ${especificaciones.length} especificaciones`);
        }

        // Verificar migración
        const equiposCount = await pgClient.query('SELECT COUNT(*) FROM equipos');
        const specsCount = await pgClient.query('SELECT COUNT(*) FROM especificaciones');

        console.log('\n🎉 Migración completada exitosamente!');
        console.log('📊 Resumen:');
        console.log(`   • Equipos: ${equipos.length} migrados`);
        console.log(`   • Especificaciones: ${especificaciones.length} migradas`);
        console.log(`   • PostgreSQL - Equipos: ${equiposCount.rows[0].count}`);
        console.log(`   • PostgreSQL - Especificaciones: ${specsCount.rows[0].count}`);

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
    } finally {
        sqliteDB.close();
        await pgClient.end();
        console.log('🔒 Conexiones cerradas');
        process.exit(0);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    migrate();
}

module.exports = migrate;