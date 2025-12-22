@echo off
cls
chcp 65001 > nul
echo ================================
echo   Exportador de Excel - Python
echo ================================
echo.

set PYTHON_PATH=python

set SCRIPT_PATH=C:\Users\Miguel Angel Imperio\Documents\Proyectos\Control de Equipos 2.0 - BACKUP\exportar_a_excel.py

echo Ejecutando script...
echo.

python "%SCRIPT_PATH%"
if %errorlevel% neq 0 (
    echo.
    echo ❌ ERROR: El script Python fallo.
    echo Presiona una tecla para salir...
    pause > nul
    exit /b 1
)

echo.
echo Exportacion completada con exito. Cerrando en 3 segundos...
timeout /t 3 > nul
exit /b 0
