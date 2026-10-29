@echo off
title Aggiornamento da GitHub - Banca Dati Automezzi
cd /d "%~dp0"
echo ============================================================
echo    AGGIORNAMENTO DA GITHUB - Banca Dati Automezzi
echo ============================================================
echo.
echo Di solito non serve: nel programma c'e' il pulsante "Sincronizza con GitHub".
echo Usa questo file solo se il programma non si apre. Chiudi il programma prima.
echo Scarica l'ultima versione del programma. I dati NON vengono toccati
echo (prima viene comunque salvata una copia nella cartella "backup").
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0strumenti\aggiorna.ps1" -Manuale & echo. & pause & exit /b
