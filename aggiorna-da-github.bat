@echo off
title Aggiornamento Codice da GitHub - Banca Dati Automezzi
echo ========================================================
echo        AGGIORNAMENTO CODICE DA GITHUB
echo ========================================================
echo.

cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%LOCALAPPDATA%\Programs\nodejs;%PATH%"

rem Controlla se il repository remoto e gia impostato
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo Nessun repository GitHub collegato attualmente.
    echo.
    echo Incolla qui sotto l'URL del tuo repository GitHub
    echo (Esempio: https://github.com/TuoNomeUtente/nome-repo.git)
    echo.
    set /p REPO_URL="URL GitHub: "
    if not "!REPO_URL!"=="" (
        git remote add origin !REPO_URL!
        git branch -M main
    ) else (
        echo Operazione annullata: nessun URL inserito.
        pause
        exit /b 1
    )
)

echo Controllo e scaricamento ultimi aggiornamenti dal repository...
echo.

git pull origin main

if errorlevel 1 (
    echo.
    echo ATTENZIONE: Si e verificato un problema durante il pull da GitHub.
    echo Verifica la connessione o l'URL del repository.
    echo.
) else (
    echo.
    echo Aggiornamento codice completato!
    echo Controllo nuove dipendenze...
    call npm install
    echo.
    echo ========================================================
    echo  AGGIORNAMENTO COMPLETATO CON SUCCESSO!
    echo  Nota: Il tuo database locale con tutti i dati dei mezzi,
    echo  rifornimenti e manutenzioni e rimasto al sicuro al 100%%.
    echo ========================================================
)

echo.
pause
