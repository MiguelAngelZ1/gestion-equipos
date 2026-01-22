@echo off
chcp 65001 >nul
title Exportar Equipos a Excel

:: Cambiar al directorio del script
cd /d "%~dp0"

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║         Exportador de Equipos a Excel                 ║
echo ╚════════════════════════════════════════════════════════╝
echo.

:: Verificar Python
echo [1/2] Verificando Python...
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: Python no está instalado
    echo    Descarga desde: https://www.python.org
    pause
    exit /b 1
)
echo ✅ Python encontrado

:: Verificar e instalar openpyxl si es necesario
echo [2/2] Verificando librería openpyxl...
python -c "import openpyxl" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ⚠️  Instalando openpyxl...
    pip install openpyxl >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo    ❌ Error instalando openpyxl
        echo    Por favor, ejecuta: pip install openpyxl
        pause
        exit /b 1
    )
    echo    ✅ openpyxl instalado correctamente
) else (
    echo ✅ openpyxl ya instalado
)

echo.
echo ═════════════════════════════════════════════════════════
echo.
echo 📊 Exportando equipos...
echo.

:: Ejecutar el script Python
python exportar_a_excel.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Error durante la exportación
    pause
    exit /b 1
)

echo.
echo ✅ Exportación completada exitosamente
echo.
timeout /t 3 >nul
