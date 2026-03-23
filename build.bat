@echo off
chcp 65001 >nul
title Terapia Attiva - Build Tools

:MENU
cls
echo ============================================
echo   Terapia Attiva - Comandi di Build
echo ============================================
echo.
echo  1) Build Web (www)
echo  2) Capacitor Sync (build + sync + fix)
echo  3) Genera Icone Android
echo  4) Build APK Android (Release)
echo  5) Build Electron Windows (.exe)
echo  6) Avvia Electron (dev)
echo  7) Installa dipendenze (npm install)
echo  0) Esci
echo.
echo ============================================
set /p scelta="Scegli un'opzione: "

if "%scelta%"=="1" goto BUILD_WEB
if "%scelta%"=="2" goto CAP_SYNC
if "%scelta%"=="3" goto CAP_ICONS
if "%scelta%"=="4" goto CAP_BUILD
if "%scelta%"=="5" goto ELECTRON_BUILD
if "%scelta%"=="6" goto ELECTRON_START
if "%scelta%"=="7" goto NPM_INSTALL
if "%scelta%"=="0" goto FINE

echo Opzione non valida.
timeout /t 2 >nul
goto MENU

:BUILD_WEB
echo.
echo --- Build Web ---
call npm run build:web
goto PAUSA

:CAP_SYNC
echo.
echo --- Capacitor Sync ---
call npm run cap:sync
goto PAUSA

:CAP_ICONS
echo.
echo --- Genera Icone Android ---
call npm run cap:icons
goto PAUSA

:CAP_BUILD
echo.
echo --- Build APK Android (Release) ---
call npm run cap:build:android
goto PAUSA

:ELECTRON_BUILD
echo.
echo --- Build Electron Windows ---
call npm run electron:build:win
goto PAUSA

:ELECTRON_START
echo.
echo --- Avvia Electron (dev) ---
call npm run electron:start
goto PAUSA

:NPM_INSTALL
echo.
echo --- Installazione dipendenze ---
call npm install
goto PAUSA

:PAUSA
echo.
echo ============================================
pause
goto MENU

:FINE
exit /b 0
