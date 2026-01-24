/**
 * Imprime el resumen final de la sincronización
 */
function imprimirResumenSync(stats, totalLocal, totalRemote, detalles = []) {
  console.log("\n🎉 Sincronización completada!");
  
  if (detalles.length > 0) {
    console.log("\n📜 Detalles de los cambios:");
    detalles.forEach(d => console.log(`   ${d}`));
  } else {
    console.log("\nℹ️ No hubo cambios que sincronizar.");
  }

  console.log("\n📊 Resumen:");
  console.log(`   • Equipos creados: ${stats.creados}`);
  console.log(`   • Equipos actualizados: ${stats.actualizados}`);
  console.log(`   • Equipos eliminados: ${stats.eliminados}`);
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
