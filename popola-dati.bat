@echo off
title Popola Dati Demo - Banca Dati Automezzi
echo ========================================================
echo        POPOLAMENTO DATI DEMO FLOTTA
echo ========================================================
echo.

cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

call npm run seed
echo.
pause
