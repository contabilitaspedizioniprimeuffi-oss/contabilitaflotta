@echo off
title Banca Dati Automezzi (modalita' console)
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
echo ========================================================
echo        BANCA DATI AUTOMEZZI - modalita' console
echo ========================================================
echo.
echo Di solito basta aprire "Banca Dati Automezzi.exe".
echo Questa finestra serve se il programma non parte: mostra gli errori.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0strumenti\aggiorna.ps1" -SoloAvvio & echo. & echo Avvio del server su http://localhost:3000 - per fermarlo chiudi questa finestra. & echo. & start "" "http://localhost:3000" & call npm start || call npm run dev
