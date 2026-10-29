@echo off
setlocal EnableDelayedExpansion
title Primo Caricamento su GitHub - Banca Dati Automezzi
echo ========================================================
echo        COLLEGAMENTO E PRIMO PUSH SU GITHUB
echo ========================================================
echo.

cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%LOCALAPPDATA%\Programs\nodejs;%PATH%"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo Crea un nuovo repository VUOTO su GitHub (senza README e senza .gitignore).
    echo Poi copia il link del repository.
    echo.
    set /p REPO_URL="Incolla qui l'URL del repository GitHub: "
    if "!REPO_URL!"=="" (
        echo Errore: URL non inserito.
        pause
        exit /b 1
    )
    git remote add origin !REPO_URL!
    git branch -M main
) else (
    echo Repository remoto gia configurato.
)

echo.
echo Invio del codice sorgente su GitHub in corso...
git push -u origin main

if errorlevel 1 (
    echo.
    echo ATTENZIONE: Se GitHub richiede il login, assicurati di aver fatto l'accesso.
) else (
    echo.
    echo ========================================================
    echo  CODICE CARICATO SU GITHUB CON SUCCESSO!
    echo  Ora puoi far modificare il codice alla tua AI su browser.
    echo ========================================================
)

echo.
pause
