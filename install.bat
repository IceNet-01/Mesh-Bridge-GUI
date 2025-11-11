@echo off
REM Meshtastic Bridge GUI - Complete Installer for Windows
REM This script installs all dependencies and sets up the application

echo ==================================
echo Meshtastic Bridge GUI - Installer
echo ==================================
echo.

REM Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

REM Get Node version
for /f "tokens=1" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Node.js %NODE_VERSION% detected

REM Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed!
    pause
    exit /b 1
)

REM Get npm version
for /f "tokens=1" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [OK] npm %NPM_VERSION% detected
echo.

REM Clean any previous installation
echo Cleaning previous installation...
if exist "node_modules" rmdir /s /q node_modules
if exist "package-lock.json" del /f /q package-lock.json
if exist "dist" rmdir /s /q dist
if exist ".vite" rmdir /s /q .vite
if exist ".cache" rmdir /s /q .cache
if exist "coverage" rmdir /s /q coverage
if exist ".nyc_output" rmdir /s /q .nyc_output
if exist "tmp" rmdir /s /q tmp
if exist "temp" rmdir /s /q temp
echo [OK] Cleaned previous installation
echo.

REM Clean npm cache
echo Cleaning npm cache...
call npm cache clean --force
echo [OK] npm cache cleaned
echo.

REM Install dependencies
echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

REM Build the application
echo Building application...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to build application
    pause
    exit /b 1
)
echo [OK] Application built successfully
echo.

echo ==================================
echo [OK] Installation Complete!
echo ==================================
echo.
echo To start the application:
echo   npm run dev
echo.
echo Then open your browser to:
echo   http://localhost:5173
echo.
echo Requirements:
echo   - Chrome, Edge, or Brave browser (Web Serial API support)
echo   - Meshtastic radio connected via USB
echo.
echo To uninstall and remove all traces:
echo   uninstall.bat
echo.
echo Press any key to exit...
pause >nul
