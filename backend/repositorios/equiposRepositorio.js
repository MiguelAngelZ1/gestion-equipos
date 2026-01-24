/**
 * Obtiene todos los equipos junto con sus especificaciones.
 * Funciona tanto para SQLite como para PostgreSQL.
 */
async function obtenerEquiposCompletos(db, esPostgres) {
  let equipos;

  if (esPostgres) {
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

  const equiposCompletos = [];

  for (const equipo of equipos) {
    let especificaciones;

    if (esPostgres) {
      const result = await db.query(
        `SELECT clave, valor FROM especificaciones WHERE equipo_id = $1`,
        [equipo.id]
      );
      especificaciones = result.rows;
    } else {
      especificaciones = await new Promise((resolve, reject) => {
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

    equiposCompletos.push({
      ...equipo,
      especificaciones: especificaciones || [],
    });
  }

  return equiposCompletos;
}

module.exports = {
  obtenerEquiposCompletos,
};
