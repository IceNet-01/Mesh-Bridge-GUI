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

REM Add to PATH
echo Adding mesh-bridge command to PATH...

REM Get the current directory
set PROJECT_DIR=%CD%

REM Create a batch file in the project's bin directory
if not exist "bin" mkdir bin

REM Create the launcher batch file
echo @echo off > bin\mesh-bridge.bat
echo cd /d "%PROJECT_DIR%" >> bin\mesh-bridge.bat
echo call npm run dev >> bin\mesh-bridge.bat

REM Check if bin directory is in PATH
echo %PATH% | findstr /C:"%PROJECT_DIR%\bin" >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] bin directory already in PATH
    set PATH_ADDED=yes
) else (
    REM Add to user PATH
    echo Adding %PROJECT_DIR%\bin to user PATH...
    
    REM Get current user PATH
    for /f "usebackq tokens=2,*" %%A in (`reg query HKCU\Environment /v PATH 2^>nul`) do set CURRENT_PATH=%%B
    
    REM Add to PATH if not empty, otherwise create new
    if defined CURRENT_PATH (
        setx PATH "%CURRENT_PATH%;%PROJECT_DIR%\bin" >nul
    ) else (
        setx PATH "%PROJECT_DIR%\bin" >nul
    )
    
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Added bin directory to user PATH
        set PATH_ADDED=yes
    ) else (
        echo [WARN] Could not automatically add to PATH
        set PATH_ADDED=partial
    )
)

echo.
echo ==================================
echo [OK] Installation Complete!
echo ==================================
echo.

if "%PATH_ADDED%"=="yes" (
    echo To start the application from anywhere:
    echo   mesh-bridge
    echo.
    echo Note: You may need to restart your command prompt for PATH changes to take effect
    echo.
    echo Or from this directory:
    echo   npm run dev
) else if "%PATH_ADDED%"=="partial" (
    echo To start the application:
    echo   npm run dev
    echo.
    echo To add mesh-bridge to PATH manually:
    echo   1. Open System Properties ^(Windows Key + Pause^)
    echo   2. Click "Advanced system settings"
    echo   3. Click "Environment Variables"
    echo   4. Under "User variables", select "Path" and click "Edit"
    echo   5. Add: %PROJECT_DIR%\bin
) else (
    echo To start the application:
    echo   npm run dev
)

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
