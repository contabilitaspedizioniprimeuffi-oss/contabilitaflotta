@echo off
title Banca Dati Automezzi
echo ========================================================
echo        AVVIO BANCA DATI AUTOMEZZI AZIENDALI
echo ========================================================
echo.

cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

echo Controllo ambiente...
if not exist node_modules (
    echo Installazione dipendenze in corso...
    call npm install
)

echo.
echo Avvio del server su http://localhost:3000 ...
echo Per fermare il server premi CTRL + C in questa finestra.
echo.

start "" "http://localhost:3000"
npm start || npm run dev
