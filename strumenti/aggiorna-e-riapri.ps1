<#
  Aggiornamento dal pulsante "Sincronizza con GitHub" quando il programma NON
  e' stato aperto da "Banca Dati Automezzi.exe" (per esempio da avvia.bat).
  Lo avvia il programma stesso, che subito dopo si chiude da solo.

  1) aspetta che il programma si chiuda
  2) esegue l'aggiornamento normale (strumenti\aggiorna.ps1): copia dei dati
     nella cartella "backup", download da GitHub, preparazione e ritorno
     automatico alla versione precedente se qualcosa va storto
  3) riapre il programma da "Banca Dati Automezzi.exe" (se non parte: avvia.bat)

  I dati (local_database.db, sheets_dump.txt, .env.local) non vengono toccati.
#>
param(
    [int]$PidServer = 0,
    [switch]$Forza
)

$ErrorActionPreference = 'Continue'
$Cartella    = Split-Path -Parent $PSScriptRoot
$Porta       = 3000
$Exe         = Join-Path $Cartella 'Banca Dati Automezzi.exe'
$Avvia       = Join-Path $Cartella 'avvia.bat'
$Script      = Join-Path $PSScriptRoot 'aggiorna.ps1'
$CartellaLog = Join-Path $Cartella 'logs'
$FileLog     = Join-Path $CartellaLog 'aggiorna-e-riapri.log'

try { $Host.UI.RawUI.WindowTitle = 'Aggiornamento - Banca Dati Automezzi' } catch { }
try { New-Item -ItemType Directory -Force -Path $CartellaLog | Out-Null } catch { }

# Segnale per il programma: lo script e' partito, il programma puo' chiudersi
try { Set-Content -LiteralPath (Join-Path $CartellaLog 'aggiornamento-avviato') -Value (Get-Date -Format 'o') } catch { }

function Scrivi([string]$testo) {
    Write-Host $testo
    try { Add-Content -LiteralPath $FileLog -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $testo) } catch { }
}

function Porta-Occupata {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $r = $c.BeginConnect('127.0.0.1', $Porta, $null, $null)
        if (-not $r.AsyncWaitHandle.WaitOne(700)) { return $false }
        try { $c.EndConnect($r) } catch { return $false }
        return $c.Connected
    } catch { return $false } finally { $c.Close() }
}

function Programma-Pronto {
    try {
        $req = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:' + $Porta + '/api/health')
        $req.Timeout = 2500
        $req.Proxy = $null
        $risposta = $req.GetResponse()
        $ok = ([int]$risposta.StatusCode -eq 200)
        $risposta.Close()
        return $ok
    } catch { return $false }
}

function Attendi-Pronto([int]$secondi) {
    $limite = (Get-Date).AddSeconds($secondi)
    while ((Get-Date) -lt $limite) {
        if (Programma-Pronto) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

Scrivi '============================================================'
Scrivi '   AGGIORNAMENTO DA GITHUB - Banca Dati Automezzi'
Scrivi '============================================================'
Scrivi 'Non chiudere questa finestra: alla fine il programma si riapre da solo.'
Scrivi ''

# ---------------------------------------------------------------------------
# 1) Chiusura del programma (si chiude da solo dopo aver avviato questo script)
# ---------------------------------------------------------------------------
Scrivi 'Chiusura del programma...'
if ($PidServer -gt 0) {
    $processo = Get-Process -Id $PidServer -ErrorAction SilentlyContinue
    if ($processo) { try { [void]$processo.WaitForExit(30000) } catch { } }
}
$limite = (Get-Date).AddSeconds(20)
while ((Porta-Occupata) -and ((Get-Date) -lt $limite)) { Start-Sleep -Milliseconds 500 }
while (Porta-Occupata) {
    Scrivi ''
    Scrivi 'Il programma risulta ancora aperto. Chiudi tutte le finestre del programma'
    Scrivi '(anche quella nera di avvia.bat, se c''e''), poi premi INVIO qui.'
    [void](Read-Host)
}

# ---------------------------------------------------------------------------
# 2) Aggiornamento (copia dei dati, download, preparazione)
# ---------------------------------------------------------------------------
Scrivi 'Aggiornamento in corso: puo'' richiedere qualche minuto...'
Scrivi ''
$argomenti = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Script, '-Manuale')
if ($Forza) { $argomenti += '-Forza' }
& powershell.exe @argomenti
$codice = $LASTEXITCODE
Scrivi ''
Scrivi ('Aggiornamento terminato (codice ' + $codice + ').')

# ---------------------------------------------------------------------------
# 3) Riapertura dall'exe (se non parte: avvia.bat)
# ---------------------------------------------------------------------------
Scrivi 'Riapertura del programma da "Banca Dati Automezzi.exe"...'
$aperto = $false
$lanciato = $null
if (Test-Path -LiteralPath $Exe) {
    try {
        $lanciato = Start-Process -FilePath $Exe -WorkingDirectory $Cartella -PassThru -ErrorAction Stop
        $null = $lanciato.Handle
    } catch {
        Scrivi ('Impossibile aprire "Banca Dati Automezzi.exe": ' + $_.Exception.Message)
        $lanciato = $null
    }
}
if ($lanciato) {
    # si aspetta il programma finche' l'exe e' al lavoro (al massimo 10 minuti)
    $limite = (Get-Date).AddMinutes(10)
    while ((Get-Date) -lt $limite) {
        if (Programma-Pronto) { $aperto = $true; break }
        if ($lanciato.HasExited) { break }
        Start-Sleep -Seconds 2
    }
}
if ((-not $aperto) -and (-not (Porta-Occupata)) -and (Test-Path -LiteralPath $Avvia)) {
    Scrivi 'Il programma non si e'' aperto dall''exe: lo apro con avvia.bat...'
    Start-Process -FilePath $Avvia -WorkingDirectory $Cartella | Out-Null
    $aperto = Attendi-Pronto 300
}

Scrivi ''
if ($aperto) {
    Scrivi 'Fatto: il programma e'' di nuovo aperto. Questa finestra si chiude da sola.'
    Start-Sleep -Seconds 6
} else {
    Scrivi 'Il programma non si e'' riaperto da solo: aprilo con "Banca Dati Automezzi.exe".'
    Scrivi ('Dettagli nella cartella: ' + $CartellaLog)
    Scrivi ''
    [void](Read-Host 'Premi INVIO per chiudere')
}
