// Servicio encargado exclusivamente de la lógica de sincronización de equipos
// NO maneja conexiones ni logs de consola

function hayConflictoReal(local, remote) {
  if (!local || !remote) return false;
  if (!local.updated_at || !remote.updated_at) return false;

  return local.hash !== remote.hash;
}

function resolverConflicto(local, remote) {
  return new Date(local.updated_at) >= new Date(remote.updated_at)
    ? { ganador: "local", equipo: local }
    : { ganador: "remote", equipo: remote };
}


async function sincronizarEquipos({
    obtenerEquiposLocal,
    obtenerEquiposRemote,
    actualizarLocal,
    actualizarRemote
}) {
  const stats = {
    creados: 0,
    actualizados: 0,
    pendientesFaseRemoteLocal: 0,
    conflictosReales: 0
  };

  const equiposLocal = await obtenerEquiposLocal();
  const equiposRemote = await obtenerEquiposRemote();

  const mapLocal = new Map(equiposLocal.map(e => [e.id, e]));
  const mapRemote = new Map(equiposRemote.map(e => [e.id, e]));

  // 🔁 Local → Remote
  for (const [id, local] of mapLocal) {
    const remote = mapRemote.get(id);

    if (!remote) {
    if (!remote && local.is_deleted) {
      // No recrear equipos borrados
      continue;
    }
      await actualizarRemote(local);
      stats.creados++;
      continue;
    }

    if (local.updated_at > remote.updated_at) {
      await actualizarRemote(local);
      stats.actualizados++;
      continue;
    }

    if (hayConflictoReal(local, remote)) {
      stats.conflictosReales++;

      const resultado = resolverConflicto(local, remote);

      if (resultado.ganador === "local") {
        await actualizarRemote(resultado.equipo);
      } else {
        await actualizarLocal(resultado.equipo);
      }

      continue;
    }

  }

  // 🔁 Remote → Local
  for (const [id, remote] of mapRemote) {
    const local = mapLocal.get(id);

    if (!local) {
    if (!remote && local.is_deleted) {
      // No recrear equipos borrados
      continue;
    }
      await actualizarLocal(remote);
      stats.creados++;
      continue;
    }

    if (remote.updated_at > local.updated_at) {
      await actualizarLocal(remote);
      stats.pendientesFaseRemoteLocal++;
    }
  }

  return {
    stats,
    equiposLocalFinal: await obtenerEquiposLocal(),
    equiposRemoteFinal: await obtenerEquiposRemote()
  };
}

module.exports = {
  sincronizarEquipos
};

