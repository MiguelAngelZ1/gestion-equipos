const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "../equipos.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error al abrir la base de datos:", err.message);
  } else {
    console.log("Conectado a la base de datos SQLite:", dbPath);
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS equipos (
    id TEXT PRIMARY KEY,
    ine TEXT NOT NULL,
    nne TEXT NOT NULL,
    serie TEXT NOT NULL,
    tipo TEXT NOT NULL,
    estado TEXT NOT NULL,
    responsable TEXT NOT NULL,
    ubicacion TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS especificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipo_id TEXT NOT NULL,
    clave TEXT NOT NULL,
    valor TEXT NOT NULL,
    FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE
  )`);
});

module.exports = db;
