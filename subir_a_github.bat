@echo off
echo ===================================================
echo   CoreBIM Analytics - Automatizador de Subida
echo ===================================================
echo.
echo Preparando el envio a GitHub...
echo Repositorio: https://github.com/samuellancheros1-code/CoreBIM_Analytics
echo.

:: Asegurar que estamos en la rama correcta
git checkout main

:: Añadir todos los cambios
git add .

:: Hacer el commit (por si hubo cambios nuevos)
git commit -m "feat: integracion completa del skill de localizacion y visor 3D"

:: Intentar el push
echo.
echo Se abrira una ventana de GitHub para que inicies sesion.
echo Por favor, sigue las instrucciones en pantalla.
echo.
git push origin main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] No se pudo subir la informacion. 
    echo Verifica tus permisos en GitHub o intenta con un Personal Access Token.
) else (
    echo.
    echo [EXITO] Informacion subida correctamente al repositorio.
)

echo.
pause
