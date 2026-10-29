@echo off
title Popola Dati Demo - Banca Dati Automezzi
cd /d "%~dp0"
echo ========================================================
echo        POPOLAMENTO DATI DEMO FLOTTA
echo ========================================================
echo.
echo  ATTENZIONE: questa operazione CANCELLA TUTTI I DATI
echo  (mezzi, rifornimenti, scadenze, manutenzioni, multe)
echo  e li sostituisce con dati di esempio.
echo.
echo  Prima viene salvata una copia del database nella cartella "backup".
echo.
set "CONFERMA="
set /p "CONFERMA=Per continuare scrivi CANCELLA e premi Invio: "
if /i not "%CONFERMA%"=="CANCELLA" goto :annulla

set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if not exist "backup" mkdir "backup"
set "STAMP=%RANDOM%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%i"
if exist "local_database.db" (
    copy /y "local_database.db" "backup\demo-%STAMP%_local_database.db" >nul
    echo Copia di sicurezza: backup\demo-%STAMP%_local_database.db
)
echo.
call npm run seed
echo.
pause
exit /b

:annulla
echo.
echo Operazione annullata: nessun dato e' stato modificato.
echo.
pause
