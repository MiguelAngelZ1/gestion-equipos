/**
 * Imprime el resumen final de la sincronización
 */
function imprimirResumenSync(stats, totalLocal, totalRemote) {
  console.log("\n🎉 Sincronización completada!");
  console.log("📊 Resumen:");
  console.log(`   • Equipos creados: ${stats.creados}`);
  console.log(`   • Equipos actualizados: ${stats.actualizados}`);
  console.log(
    `   • Pendientes resueltos en fase Remote → Local: ${stats.pendientesFaseRemoteLocal}`
  );
  console.log(
    `   • Conflictos REALES de datos: ${stats.conflictosReales}`
  );

  console.log(`\n📊 Estado final:`);
  console.log(`   • SQLite: ${totalLocal} equipos`);
  console.log(`   • PostgreSQL: ${totalRemote} equipos`);

  if (totalLocal === totalRemote) {
    console.log("✅ Ambas bases de datos están sincronizadas!");
  } else {
    console.log(
      "⚠️  Las bases de datos tienen diferentes cantidades de equipos."
    );
  }
}

module.exports = {
  imprimirResumenSync,
};
