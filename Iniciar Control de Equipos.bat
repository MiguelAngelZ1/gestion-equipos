@echo off
chcp 65001 >nul
title Control de Equipos - Sistema de Gestión

:: Cambiar al directorio del script
cd /d "%~dp0"

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║       Sistema de Control de Equipos v2.0              ║
echo ╚════════════════════════════════════════════════════════╝
echo.

:: Verificar Node.js
echo [1/3] Verificando Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: Node.js no está instalado
    echo    Descarga desde: https://nodejs.org
    pause
    exit /b 1
)
echo ✅ Node.js encontrado

:: Verificar Python
echo [2/3] Verificando Python...
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: Python no está instalado
    echo    Descarga desde: https://www.python.org
    pause
    exit /b 1
)
echo ✅ Python encontrado

:: Instalar dependencias de Node.js
echo [3/3] Instalando dependencias de Node.js...
if not exist "node_modules" (
    echo    Instalando por primera vez...
    call npm install >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ Error instalando dependencias
        pause
        exit /b 1
    )
    echo ✅ Dependencias instaladas
) else (
    echo ✅ Dependencias ya instaladas
)

echo.
echo ═════════════════════════════════════════════════════════
echo.

:: Ejecutar el script Python
python iniciar.py

:: Si hay error, pausar
if errorlevel 1 (
    echo.
    echo ❌ Error al iniciar el sistema
    pause
)