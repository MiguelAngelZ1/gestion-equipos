/**
 * Obtiene todas las especificaciones de un equipo.
 * Compatible con SQLite y PostgreSQL.
 */
async function obtenerEspecificacionesPorEquipo(db, esPostgres, equipoId) {
  if (esPostgres) {
    const result = await db.query(
      `SELECT clave, valor FROM especificaciones WHERE equipo_id = $1`,
      [equipoId]
    );
    return result.rows || [];
  }

  return new Promise((resolve, reject) => {
    db.all(
      `SELECT clave, valor FROM especificaciones WHERE equipo_id = ?`,
      [equipoId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

/**
 * Elimina todas las especificaciones de un equipo.
 */
async function borrarEspecificacionesPorEquipo(db, esPostgres, equipoId) {
  if (esPostgres) {
    await db.query(
      `DELETE FROM especificaciones WHERE equipo_id = $1`,
      [equipoId]
    );
    return;
  }

  return new Promise((resolve, reject) => {
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

/**
 * Inserta un conjunto de especificaciones para un equipo.
 * Valida, limpia y descarta datos inválidos.
 */
async function insertarEspecificaciones(db, esPostgres, equipoId, especificaciones) {
  if (!Array.isArray(especificaciones) || especificaciones.length === 0) return;

  // Normalizar y filtrar especificaciones válidas
  const especificacionesValidas = especificaciones
    .filter((esp) => esp && typeof esp === "object")
    .map((esp) => ({
      clave: typeof esp.clave === "string" ? esp.clave.trim() : "",
      valor: typeof esp.valor === "string" ? esp.valor.trim() : "",
    }))
    .filter((esp) => esp.clave !== "" && esp.valor !== "");

  if (especificacionesValidas.length === 0) return;

  if (esPostgres) {
    for (const esp of especificacionesValidas) {
      await db.query(
        `INSERT INTO especificaciones (equipo_id, clave, valor)
         VALUES ($1, $2, $3)`,
        [equipoId, esp.clave, esp.valor]
      );
    }
    return;
  }

  for (const esp of especificacionesValidas) {
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO especificaciones (equipo_id, clave, valor)
         VALUES (?, ?, ?)`,
        [equipoId, esp.clave, esp.valor],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
}

module.exports = {
  obtenerEspecificacionesPorEquipo,
  borrarEspecificacionesPorEquipo,
  insertarEspecificaciones,
};
