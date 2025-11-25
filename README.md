# Sistema de Gestión de Equipos

Sistema web para gestionar equipos con capacidad de exportación a PDF.

## 🚀 Características

- Gestión completa de equipos (CRUD)
- Búsqueda avanzada en todos los campos
- Especificaciones adicionales personalizadas
- Exportación a PDF
- Base de datos dual (SQLite local / PostgreSQL en producción)
- **Sincronización bidireccional** entre bases de datos local y remota

## 📦 Instalación Local

### Prerrequisitos
- Node.js 18+ 
- npm

### Pasos
```bash
# 1. Clonar o descargar el proyecto
git clone <tu-repositorio>
cd gestion-equipos

# 2. Instalar dependencias
npm install

# 3. Ejecutar en desarrollo (SQLite)
npm run dev

# 4. Abrir en navegador
# http://localhost:3000
```

## 🔄 Sincronización de Bases de Datos

Este sistema incluye sincronización bidireccional entre tu base de datos local (SQLite) y la base de datos en Railway (PostgreSQL).

### Sincronización Rápida

```bash
# Sincronizar ambas bases de datos
npm run sync
```

Este comando sincroniza automáticamente:
- ✅ Equipos nuevos desde local a Railway
- ✅ Equipos nuevos desde Railway a local
- ✅ Actualizaciones basadas en timestamps
- ✅ Especificaciones de cada equipo

**Para más detalles, consulta [SINCRONIZACION.md](./SINCRONIZACION.md)**