@echo off
REM Meshtastic Bridge GUI - Complete Uninstaller for Windows
REM This script removes ALL traces of the application from your system

echo =====================================
echo Meshtastic Bridge GUI - Uninstaller
echo =====================================
echo.
echo WARNING: This will remove:
echo    - All node modules
echo    - All build artifacts
echo    - All cached data
echo    - Service worker registrations
echo    - Browser storage data
echo.
set /p CONFIRM="Are you sure you want to continue? (yes/no): "
if /i not "%CONFIRM%"=="yes" (
    echo Uninstall cancelled.
    exit /b 0
)

echo.
echo Starting complete removal...
echo.

REM Remove node_modules
if exist "node_modules" (
    echo Removing node_modules...
    rmdir /s /q node_modules
    echo [OK] node_modules removed
)

REM Remove package-lock.json
if exist "package-lock.json" (
    echo Removing package-lock.json...
    del /f /q package-lock.json
    echo [OK] package-lock.json removed
)

REM Remove yarn.lock
if exist "yarn.lock" (
    echo Removing yarn.lock...
    del /f /q yarn.lock
    echo [OK] yarn.lock removed
)

REM Remove pnpm-lock.yaml
if exist "pnpm-lock.yaml" (
    echo Removing pnpm-lock.yaml...
    del /f /q pnpm-lock.yaml
    echo [OK] pnpm-lock.yaml removed
)

REM Remove dist directory
if exist "dist" (
    echo Removing dist directory...
    rmdir /s /q dist
    echo [OK] dist directory removed
)

REM Remove .vite cache
if exist ".vite" (
    echo Removing Vite cache...
    rmdir /s /q .vite
    echo [OK] Vite cache removed
)

REM Remove TypeScript build info
if exist "tsconfig.tsbuildinfo" (
    echo Removing TypeScript build info...
    del /f /q tsconfig.tsbuildinfo
    echo [OK] TypeScript build info removed
)

REM Remove log files
echo Removing log files...
del /f /q npm-debug.log 2>nul
del /f /q yarn-error.log 2>nul
del /f /q pnpm-debug.log 2>nul
echo [OK] Log files removed

REM Remove .cache directories
if exist ".cache" (
    echo Removing .cache directory...
    rmdir /s /q .cache
    echo [OK] .cache directory removed
)

REM Remove .parcel-cache
if exist ".parcel-cache" (
    echo Removing .parcel-cache...
    rmdir /s /q .parcel-cache
    echo [OK] .parcel-cache removed
)

REM Remove coverage directories
if exist "coverage" (
    echo Removing coverage directory...
    rmdir /s /q coverage
    echo [OK] coverage directory removed
)

REM Remove .nyc_output
if exist ".nyc_output" (
    echo Removing .nyc_output...
    rmdir /s /q .nyc_output
    echo [OK] .nyc_output removed
)

REM Remove temp directories
if exist "tmp" (
    echo Removing tmp directory...
    rmdir /s /q tmp
    echo [OK] tmp directory removed
)

if exist "temp" (
    echo Removing temp directory...
    rmdir /s /q temp
    echo [OK] temp directory removed
)

REM Clean npm cache
echo Cleaning npm cache...
call npm cache clean --force 2>nul
echo [OK] npm cache cleaned

REM Try to kill any running dev servers
echo Checking for running dev servers...
taskkill /f /im node.exe /fi "WINDOWTITLE eq npm*" 2>nul
echo [OK] Stopped any running dev servers

REM Remove from PATH
echo Removing mesh-bridge from PATH...
set PROJECT_DIR=%CD%

REM Get current user PATH
for /f "usebackq tokens=2,*" %%A in (`reg query HKCU\Environment /v PATH 2^>nul`) do set CURRENT_PATH=%%B

REM Remove the bin directory from PATH
if defined CURRENT_PATH (
    setlocal enabledelayedexpansion
    set "NEW_PATH=!CURRENT_PATH:%PROJECT_DIR%\bin;=!"
    set "NEW_PATH=!NEW_PATH:;%PROJECT_DIR%\bin=!"
    set "NEW_PATH=!NEW_PATH:%PROJECT_DIR%\bin=!"
    endlocal & set "NEW_PATH=%NEW_PATH%"

    if not "!NEW_PATH!"=="!CURRENT_PATH!" (
        setx PATH "!NEW_PATH!" >nul 2>&1
        echo [OK] Removed bin directory from PATH
    ) else (
        echo [OK] bin directory was not in PATH
    )
) else (
    echo [OK] PATH variable not found
)

REM Remove bin directory
if exist "bin" (
    echo Removing bin directory...
    rmdir /s /q bin 2>nul
    echo [OK] bin directory removed
)

echo.
echo =====================================
echo [OK] Application Removed Successfully
echo =====================================
echo.
echo Manual cleanup required for browser data:
echo.
echo To remove ALL browser data for this app:
echo.
echo Chrome/Edge/Brave:
echo   1. Open DevTools (F12)
echo   2. Go to Application tab
echo   3. In 'Storage' section, click 'Clear site data'
echo   4. Or visit: chrome://settings/siteData
echo   5. Search for 'localhost' and remove all entries
echo.
echo Firefox:
echo   1. Open DevTools (F12)
echo   2. Go to Storage tab
echo   3. Right-click on each storage type and select 'Delete All'
echo   4. Or visit: about:preferences#privacy
echo   5. Click 'Clear Data' under Cookies and Site Data
echo.
echo To unregister service workers:
echo   Chrome: chrome://serviceworker-internals/
echo   Firefox: about:serviceworkers
echo   Edge: edge://serviceworker-internals/
echo   Find entries for 'localhost:5173' and click 'Unregister'
echo.
echo To clear browser cache completely:
echo   Chrome: chrome://settings/clearBrowserData
echo   Firefox: about:preferences#privacy
echo   Edge: edge://settings/clearBrowserData
echo.
echo Press any key to exit...
pause >nul
