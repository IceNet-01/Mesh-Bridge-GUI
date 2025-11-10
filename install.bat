@echo off
REM Meshtastic Bridge GUI - Windows Installer

echo =========================================
echo   Meshtastic Bridge GUI - Installer
echo =========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo X Node.js is not installed.
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

echo + Node.js found
node -v
echo.

REM Check if Git is installed
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo X Git is not installed.
    echo Please install Git from https://git-scm.com/
    pause
    exit /b 1
)

echo + Git found
echo.

REM Installation directory
set INSTALL_DIR=%USERPROFILE%\meshtastic-bridge-gui

REM Clone or update repository
if exist "%INSTALL_DIR%" (
    echo Updating existing installation...
    cd /d "%INSTALL_DIR%"
    git pull
) else (
    echo Cloning repository...
    git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git "%INSTALL_DIR%"
    cd /d "%INSTALL_DIR%"
)

echo.
echo Installing dependencies...
call npm install

echo.
echo Building application...
call npm run build

echo.
echo Creating distributable package...
call npm run package

echo.
echo =========================================
echo   Installation Complete!
echo =========================================
echo.
echo Application built in: %INSTALL_DIR%\release
echo.
echo To run the application, look for:
echo   - Installer: Meshtastic-Bridge-GUI-Setup-*.exe
echo   - Portable: Meshtastic-Bridge-GUI-*.exe
echo.
echo Double-click the installer to install, or run the portable version directly.
echo.
pause
