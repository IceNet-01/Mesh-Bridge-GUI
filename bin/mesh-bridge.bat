@echo off
REM Meshtastic Bridge GUI Launcher for Windows

REM Get the directory where this script is installed
set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..\lib\mesh-bridge-gui

REM Check if project directory exists
if not exist "%PROJECT_DIR%" (
    echo Error: Project directory not found at %PROJECT_DIR%
    exit /b 1
)

cd /d "%PROJECT_DIR%"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Error: Dependencies not installed. Please run the installer first.
    exit /b 1
)

REM Start the application
echo Starting Meshtastic Bridge GUI...
echo Open your browser to: http://localhost:5173
call npm run dev
