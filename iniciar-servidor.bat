@echo off
echo ========================================
echo   Iniciando Servidor de Equipos
echo   Con Sincronizacion Automatica
echo ========================================
echo.

cd /d "%~dp0"

echo Verificando Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js no esta instalado o no esta en el PATH
    pause
    exit /b 1
)

echo Node.js encontrado
echo.

echo Verificando puerto 3000...
netstat -ano | findstr :3000 >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ADVERTENCIA: El puerto 3000 esta en uso
    echo Cerrando procesos en puerto 3000...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
        taskkill /PID %%a /F >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
    echo Puerto liberado
    echo.
)

echo Iniciando servidor...
echo.

node backend/server.js

pause

