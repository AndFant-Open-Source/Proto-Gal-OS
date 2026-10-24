@echo off
REM SPDX-License-Identifier: AGPL-3.0-or-later
REM SPDX-FileCopyrightText: 2026 Andrea Fantini
REM Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
title ProtoGal — Registro di Protocollo
color 1F

echo.
echo  ==========================================
echo   ProtoGal - Registro di Protocollo
echo  ==========================================
echo.

:: Vai nella cartella del progetto (quella dove si trova questo file)
cd /d "%~dp0"

:: Controlla se node_modules esiste, altrimenti installa
if not exist "node_modules\" (
    echo  [*] Prima esecuzione: installazione dipendenze...
    echo.
    npm install
    echo.
)

:: Apri il browser dopo 3 secondi (in background, non blocca il server)
start "" cmd /c "timeout /t 3 /nobreak > nul & start http://localhost:5173"

:: Avvia il server di sviluppo
echo  [*] Avvio server in corso...
echo  [*] L'app si aprira' automaticamente su: http://localhost:5173
echo.
echo  Per chiudere l'applicazione premi CTRL+C
echo.
npm run dev

pause
