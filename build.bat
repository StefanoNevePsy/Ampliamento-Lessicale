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
echo.
echo  --- Scontorno NPU nativo (Tab S11) ---
echo  8) Setup/aggiorna plugin nativo NPU
echo  9) Capacitor Sync + plugin NPU
echo 10) Build APK Android + NPU nativo (Release)
echo.
echo  --- Git ---
echo 11) Aggiorna da GitHub (git pull)
echo 12) Aggiorna da GitHub + Capacitor Sync
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
if "%scelta%"=="8" goto NPU_SETUP
if "%scelta%"=="9" goto CAP_SYNC_NPU
if "%scelta%"=="10" goto CAP_BUILD_NPU
if "%scelta%"=="11" goto GIT_PULL
if "%scelta%"=="12" goto GIT_PULL_SYNC
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

:GIT_PULL
echo.
echo --- Aggiorno da GitHub (branch claude/psychology-app-setup-CmBhq) ---
call git pull origin claude/psychology-app-setup-CmBhq
goto PAUSA

:GIT_PULL_SYNC
echo.
echo --- Aggiorno da GitHub + Capacitor Sync ---
call git pull origin claude/psychology-app-setup-CmBhq
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

:NPU_SETUP
echo.
echo --- Setup/aggiorna plugin nativo NPU ---
echo (inietta il plugin, registra in MainActivity, aggiunge ONNX Runtime,
echo  e copia i modelli da native-models\ negli assets Android)
call npm run cap:npu:setup
goto PAUSA

:CAP_SYNC_NPU
echo.
echo --- Capacitor Sync + plugin NPU nativo ---
call npm run cap:sync:native
goto PAUSA

:CAP_BUILD_NPU
echo.
echo --- Build APK Android + NPU nativo (Release) ---
call npm run cap:build:android:native
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
