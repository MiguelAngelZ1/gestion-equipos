const crypto = require("crypto");

/**
 * Calcula un hash MD5 de un equipo para detectar cambios de estado.
 * Se usa como mecanismo de verificación cuando los timestamps coinciden.
 */
function calcularHashEquipo(equipo) {
  const data = `${equipo.id}|${equipo.ine}|${equipo.nne}|${equipo.serie}|${equipo.tipo}|${equipo.estado}|${equipo.responsable}|${equipo.ubicacion}|${equipo.is_deleted}`;
  return crypto.createHash("md5").update(data).digest("hex");
}

module.exports = calcularHashEquipo;
