@echo off
REM Avvia lo scontorno locale per Terapia Attiva.
REM Serve solo se usi l'app dal BROWSER: la versione desktop lo avvia da sola.
REM
REM Metti qui sotto la cartella del tuo modello, poi doppio clic su questo file
REM e lascia la finestra aperta mentre prepari i set.

set "RMBG_MODEL=F:\Stable Diffusion\RMBG-2.0"

REM Facoltativi: immagini per passata GPU, minuti prima di liberare la VRAM.
set "RMBG_BATCH=4"
set "RMBG_IDLE_MIN=10"

cd /d "%~dp0"

REM "py -3" e' il lanciatore ufficiale di Windows; "python" a volte e' lo stub
REM del Microsoft Store, che apre il negozio invece di eseguire lo script.
py -3 rmbg_server.py
if errorlevel 1 python rmbg_server.py

echo.
echo Se vedi "ModuleNotFoundError", esegui una volta:
echo    py -3 -m pip install flask flask-cors torch torchvision transformers pillow
pause
