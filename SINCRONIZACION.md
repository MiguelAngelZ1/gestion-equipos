# 🔄 Guía de Sincronización de Bases de Datos

Este sistema permite sincronizar bidireccionalmente tu base de datos local (SQLite) con la base de datos desplegada en Railway (PostgreSQL).

## 📋 Requisitos Previos

1. Tener configurada la variable de entorno `DATABASE_URL` con la conexión a PostgreSQL de Railway
2. Tener ambas bases de datos con las tablas actualizadas (con campos `created_at` y `updated_at`)

## 🚀 Cómo Sincronizar

### Opción 1: Sincronización Manual (Recomendada)

Desde tu entorno local, ejecuta:

```bash
npm run sync
```

Este comando:
- ✅ Conecta a tu base de datos SQLite local
- ✅ Conecta a la base de datos PostgreSQL en Railway
- ✅ Compara ambos y sincroniza cambios bidireccionalmente
- ✅ Resuelve conflictos usando el timestamp más reciente

### Opción 2: Sincronización desde la API

Si estás en producción (Railway), puedes iniciar una sincronización haciendo una petición POST:

```bash
curl -X POST https://tu-app.railway.app/api/sync
```

**Nota:** Esta opción solo funciona desde el servidor en producción.

## 🔍 Verificar Estado de Sincronización

Puedes verificar el estado de sincronización con:

```bash
# Desde la API
curl https://tu-app.railway.app/api/sync/status

# O desde el navegador
https://tu-app.railway.app/api/sync/status
```

## ⚙️ Cómo Funciona

### Detección de Cambios

El sistema utiliza los campos `updated_at` para determinar qué versión de un registro es más reciente:

1. **Si un equipo solo existe en una base de datos**: Se crea en la otra
2. **Si un equipo existe en ambas**: Se compara `updated_at`
   - La versión más reciente sobrescribe la antigua
   - Si tienen el mismo timestamp, se mantiene la versión actual

### Resolución de Conflictos

Cuando el mismo equipo se modifica en ambas bases de datos:
- Se usa la versión con `updated_at` más reciente
- Las especificaciones se sincronizan completamente (se reemplazan)

### Sincronización Bidireccional

El proceso se ejecuta en dos fases:
1. **Local → Remote**: Sincroniza cambios desde SQLite a PostgreSQL
2. **Remote → Local**: Sincroniza cambios desde PostgreSQL a SQLite

## 📊 Ejemplo de Salida

```
🔄 Iniciando sincronización bidireccional...
📁 SQLite local: C:\...\equipos.db
🌐 PostgreSQL (Railway): railway.app
✅ Conectado a SQLite
✅ Conectado a PostgreSQL

📦 Obteniendo equipos de SQLite...
📦 Obteniendo equipos de PostgreSQL...

📊 Resumen inicial:
   • SQLite: 15 equipos
   • PostgreSQL: 10 equipos

⬆️  Sincronizando Local → Remote...
   ➕ Creando equipo eq_123 en Remote
   🔄 Actualizando equipo eq_456 en Remote (local más reciente)

⬇️  Sincronizando Remote → Local...
   ➕ Creando equipo eq_789 en Local

🎉 Sincronización completada!
📊 Resumen:
   • Equipos creados: 6
   • Equipos actualizados: 2
   • Conflictos detectados: 0

📊 Estado final:
   • SQLite: 16 equipos
   • PostgreSQL: 16 equipos
✅ Ambas bases de datos están sincronizadas!
```

## 🔄 Automatización

### Sincronización Automática Periódica

Puedes configurar una tarea programada (cron en Linux/Mac, Task Scheduler en Windows) para ejecutar la sincronización automáticamente:

**Windows (Task Scheduler):**
```powershell
# Ejecutar cada hora
schtasks /create /tn "Sync DB" /tr "npm run sync" /sc hourly /ru "SYSTEM"
```

**Linux/Mac (cron):**
```bash
# Agregar a crontab (ejecutar cada hora)
0 * * * * cd /ruta/al/proyecto && npm run sync
```

## ⚠️ Consideraciones Importantes

1. **Backup**: Siempre haz un backup antes de sincronizar por primera vez
2. **Conflictos**: Si hay conflictos, el sistema usa la versión más reciente automáticamente
3. **Especificaciones**: Las especificaciones se reemplazan completamente durante la sincronización
4. **Timestamps**: Asegúrate de que los relojes de ambos sistemas estén sincronizados

## 🐛 Solución de Problemas

### Error: "DATABASE_URL no encontrada"
- Asegúrate de tener la variable de entorno `DATABASE_URL` configurada
- En Railway, esta variable se configura automáticamente

### Error: "No se puede conectar a SQLite"
- Verifica que el archivo `equipos.db` existe en la raíz del proyecto
- Verifica los permisos del archivo

### Las bases de datos no se sincronizan correctamente
- Verifica que ambas bases de datos tienen las columnas `created_at` y `updated_at`
- Revisa los logs para ver qué está pasando
- Asegúrate de que no hay problemas de red al conectar a Railway

## 📝 Notas Adicionales

- La sincronización es **idempotente**: puedes ejecutarla múltiples veces sin problemas
- Los cambios se propagan inmediatamente después de la sincronización
- El sistema mantiene la integridad referencial (especificaciones se sincronizan con sus equipos)

