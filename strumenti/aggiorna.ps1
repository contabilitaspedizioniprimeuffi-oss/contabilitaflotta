<#
===============================================================================
  AGGIORNAMENTO AUTOMATICO - Banca Dati Automezzi
===============================================================================
  Scarica da GitHub l'ultima versione del programma e la prepara all'uso.

  I DATI NON VENGONO MAI TOCCATI
  - local_database.db, sheets_dump.txt, .env.local, backup\ ... sono esclusi
    da git (.gitignore): l'aggiornamento non li modifica e non li cancella.
  - Prima di ogni aggiornamento viene comunque salvata una copia del database
    nella cartella "backup" (si tengono le ultime 20 copie).
  - Se la nuova versione non si installa o non si compila, il programma torna
    da solo alla versione precedente.

  Come viene usato
  - in automatico da "Banca Dati Automezzi.exe" a ogni apertura del programma
  - a mano con un doppio clic su "aggiorna-da-github.bat"
  - una sola volta, dal file "primo-collegamento.bat", per collegare il PC

  Registro dettagliato: logs\aggiornamento.log
===============================================================================
#>
param(
    [switch]$DaLauncher,         # chiamato dal programma all'avvio
    [switch]$PrimoCollegamento,  # primo collegamento del PC a GitHub
    [switch]$Forza,              # ricompila anche se non ci sono novita'
    [switch]$Manuale,            # (compatibilita') avvio manuale
    [string]$Cartella = '',      # cartella del programma (di solito non serve)
    [string]$IdFoglioGoogle = '' # solo per il primo collegamento
)

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------------------
# Impostazioni
# ---------------------------------------------------------------------------
$RepoUrl = 'https://github.com/contabilitaspedizioniprimeuffi-oss/contabilitaflotta.git'
if ($env:BDA_REPO_URL) { $RepoUrl = $env:BDA_REPO_URL }   # solo per i test
$Ramo    = 'main'
$NomeExe = 'Banca Dati Automezzi.exe'
$Porta   = 3000
$SuWindows = ($env:OS -eq 'Windows_NT')

if (-not $Cartella) { $Cartella = Split-Path -Parent $PSScriptRoot }
$Cartella = (Resolve-Path -LiteralPath $Cartella).Path
Set-Location -LiteralPath $Cartella

$CartellaLog     = Join-Path $Cartella 'logs'
$CartellaBackup  = Join-Path $Cartella 'backup'
$FileLog         = Join-Path $CartellaLog 'aggiornamento.log'
$FileUltimaBuild = Join-Path $Cartella 'strumenti/.ultima-build'
$FileScartata    = Join-Path $Cartella 'strumenti/.versione-scartata'
$FileExeVecchio  = Join-Path $Cartella ($NomeExe + '.old')

New-Item -ItemType Directory -Force -Path $CartellaLog | Out-Null
if ((Test-Path -LiteralPath $FileLog) -and ((Get-Item -LiteralPath $FileLog).Length -gt 1MB)) {
    Move-Item -LiteralPath $FileLog -Destination ($FileLog + '.1') -Force -ErrorAction SilentlyContinue
}

if ($DaLauncher) {
    try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
}

$script:Vecchio = $null             # versione installata prima dell'aggiornamento
$script:Nuovo = $null               # versione scaricata da GitHub
$script:Aggiornato = $false
$script:DipendenzeCambiate = $false

# ---------------------------------------------------------------------------
# Messaggi e registro
# ---------------------------------------------------------------------------
function Scrivi-Log([string]$testo) {
    $riga = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $testo
    try { Add-Content -LiteralPath $FileLog -Value $riga -Encoding UTF8 } catch {}
}

function Mostra-Stato([string]$testo) {
    Scrivi-Log $testo
    if ($DaLauncher) { [Console]::Out.WriteLine('STATO|' + $testo); [Console]::Out.Flush() }
    else { Write-Host ('>> ' + $testo) -ForegroundColor Cyan }
}

function Mostra-Avviso([string]$testo) {
    Scrivi-Log ('ATTENZIONE: ' + $testo)
    if ($DaLauncher) { [Console]::Out.WriteLine('AVVISO|' + $testo); [Console]::Out.Flush() }
    else { Write-Host ('!! ' + $testo) -ForegroundColor Yellow }
}

function Leggi-File([string]$percorso) {
    if (-not (Test-Path -LiteralPath $percorso)) { return '' }
    $t = Get-Content -LiteralPath $percorso -Raw -ErrorAction SilentlyContinue
    if ($null -eq $t) { return '' }
    return ([string]$t).Trim()
}

function Scrivi-File([string]$percorso, [string]$testo) {
    try {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $percorso) | Out-Null
        Set-Content -LiteralPath $percorso -Value $testo -Encoding ASCII -ErrorAction Stop
    } catch { Scrivi-Log ('Impossibile scrivere ' + $percorso + ': ' + $_.Exception.Message) }
}

# ---------------------------------------------------------------------------
# Programmi necessari (Git e Node.js)
# ---------------------------------------------------------------------------
function Trova-Programma([string[]]$percorsi, [string]$comando) {
    foreach ($p in $percorsi) {
        if ($p -and (Test-Path -LiteralPath $p -PathType Leaf)) { return $p }
    }
    $c = Get-Command $comando -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return $c.Path }
    return $null
}

$la = $env:LOCALAPPDATA; $pf = $env:ProgramFiles; $pf86 = ${env:ProgramFiles(x86)}
$Git = Trova-Programma @(
    $(if ($la)   { Join-Path $la   'Programs\Git\cmd\git.exe' }),
    $(if ($pf)   { Join-Path $pf   'Git\cmd\git.exe' }),
    $(if ($pf86) { Join-Path $pf86 'Git\cmd\git.exe' })
) 'git'
$Node = Trova-Programma @(
    $(if ($la) { Join-Path $la 'Programs\nodejs\node.exe' }),
    $(if ($pf) { Join-Path $pf 'nodejs\node.exe' })
) 'node'

$NpmCli = $null
if ($Node) {
    $dirNode = Split-Path -Parent $Node
    $candidati = @(
        (Join-Path $dirNode 'node_modules/npm/bin/npm-cli.js'),
        (Join-Path (Split-Path -Parent $dirNode) 'lib/node_modules/npm/bin/npm-cli.js')
    )
    foreach ($c in $candidati) { if (Test-Path -LiteralPath $c) { $NpmCli = $c; break } }
}

# Node e Git raggiungibili anche dai comandi lanciati da qui
$sep = [IO.Path]::PathSeparator
foreach ($p in @($Node, $Git)) {
    if ($p) {
        $d = Split-Path -Parent $p
        if (($env:PATH -split [regex]::Escape($sep)) -notcontains $d) { $env:PATH = $d + $sep + $env:PATH }
    }
}
$env:GIT_TERMINAL_PROMPT = '0'     # niente richieste di password
$env:GCM_INTERACTIVE = 'never'
$env:GIT_ASK_YESNO = 'false'
$env:NEXT_TELEMETRY_DISABLED = '1'

# ---------------------------------------------------------------------------
# Esecuzione comandi
# ---------------------------------------------------------------------------
function Ferma-Albero([int]$id) {
    if ($SuWindows) { & taskkill.exe /PID $id /T /F 2>&1 | Out-Null }
    else { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
}

# Esegue un comando con tempo massimo; l'output va nel registro.
# Restituisce il codice di uscita (-1 = tempo scaduto, -2 = avvio fallito).
function Esegui([string]$exe, [string]$argomenti, [int]$timeoutSec, [string]$nome) {
    Scrivi-Log ('> ' + $nome)
    $out = [IO.Path]::GetTempFileName()
    $err = [IO.Path]::GetTempFileName()
    try {
        $p = Start-Process -FilePath $exe -ArgumentList $argomenti -WorkingDirectory $Cartella `
            -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
        $null = $p.Handle
        if (-not $p.WaitForExit($timeoutSec * 1000)) {
            Ferma-Albero $p.Id
            Scrivi-Log ('  TEMPO SCADUTO dopo ' + $timeoutSec + ' secondi')
            $codice = -1
        } else {
            $null = $p.WaitForExit()
            $codice = $p.ExitCode
        }
        foreach ($f in @($out, $err)) {
            $testo = Get-Content -LiteralPath $f -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
            if ($testo) {
                if ($testo.Length -gt 20000) { $testo = '...' + $testo.Substring($testo.Length - 20000) }
                Scrivi-Log ('  ' + $testo.TrimEnd())
            }
        }
        Scrivi-Log ('  codice di uscita: ' + $codice)
        return $codice
    } catch {
        Scrivi-Log ('  ERRORE: ' + $_.Exception.Message)
        return -2
    } finally {
        Remove-Item -LiteralPath $out, $err -Force -ErrorAction SilentlyContinue
    }
}

# Comando git veloce: restituisce l'output (testo) o $null se fallisce
function Git-Out([string[]]$argomenti) {
    $o = & $Git @argomenti 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return (($o | Out-String).Trim())
}

# Comando git che modifica qualcosa: output nel registro, restituisce il codice
function Git-Esegui([string[]]$argomenti) {
    Scrivi-Log ('> git ' + ($argomenti -join ' '))
    & $Git @argomenti 2>&1 | ForEach-Object { Scrivi-Log ('  ' + $_) }
    return $LASTEXITCODE
}

function Porta-Occupata([int]$numero) {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $r = $c.BeginConnect('127.0.0.1', $numero, $null, $null)
        if (-not $r.AsyncWaitHandle.WaitOne(700)) { return $false }
        try { $c.EndConnect($r) } catch { return $false }
        return $c.Connected
    } catch { return $false } finally { $c.Close() }
}

function Normalizza([string]$p) {
    if (-not $p) { return '' }
    $n = ($p -replace '\\', '/').TrimEnd('/')
    if ($SuWindows) { $n = $n.ToLowerInvariant() }
    return $n
}

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------
function Backup-Dati {
    New-Item -ItemType Directory -Force -Path $CartellaBackup | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $copiati = 0
    $file = @('local_database.db', 'local_database.db-wal', 'local_database.db-shm',
              'local_database.db-journal', 'sheets_dump.txt', '.env.local', '.env')
    foreach ($nome in $file) {
        $src = Join-Path $Cartella $nome
        if (Test-Path -LiteralPath $src -PathType Leaf) {
            try {
                Copy-Item -LiteralPath $src -Destination (Join-Path $CartellaBackup ($stamp + '_' + $nome)) -Force -ErrorAction Stop
                $copiati++
            } catch { Scrivi-Log ('Backup non riuscito per ' + $nome + ': ' + $_.Exception.Message) }
        }
    }
    Scrivi-Log ('Backup dati: ' + $copiati + ' file salvati in ' + $CartellaBackup)

    # si tengono solo le ultime 20 copie
    $copie = @(Get-ChildItem -LiteralPath $CartellaBackup -File -ErrorAction SilentlyContinue |
               Where-Object { $_.Name -match '^\d{8}-\d{6}_' } |
               ForEach-Object { $_.Name.Substring(0, 15) } | Sort-Object -Unique -Descending)
    if ($copie.Count -gt 20) {
        foreach ($prefisso in ($copie | Select-Object -Skip 20)) {
            Get-ChildItem -LiteralPath $CartellaBackup -File | Where-Object { $_.Name.StartsWith($prefisso + '_') } |
                Remove-Item -Force -ErrorAction SilentlyContinue
        }
    }
}

# Copia completa della cartella (solo al primo collegamento)
function Backup-Completo {
    $dest = Join-Path $CartellaBackup ('prima-del-collegamento-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $escludi = @('node_modules', '.next', '.next_precedente', 'backup', 'logs')
    foreach ($el in @(Get-ChildItem -LiteralPath $Cartella -Force)) {
        if ($escludi -contains $el.Name) { continue }
        try { Copy-Item -LiteralPath $el.FullName -Destination $dest -Recurse -Force -ErrorAction Stop }
        catch { Scrivi-Log ('Backup completo: impossibile copiare ' + $el.FullName + ': ' + $_.Exception.Message) }
    }
    Mostra-Stato ('Copia di sicurezza completa salvata in: backup\' + (Split-Path -Leaf $dest))
}

# ---------------------------------------------------------------------------
# Git
# ---------------------------------------------------------------------------
function Prepara-Repository {
    $top = Git-Out @('rev-parse', '--show-toplevel')
    if (-not $top) {
        $msg = (& $Git rev-parse --show-toplevel 2>&1 | Out-String)
        if ($msg -match 'dubious ownership|safe\.directory') {
            Scrivi-Log 'Cartella non considerata sicura da git: la aggiungo a safe.directory'
            $null = Git-Esegui @('config', '--global', '--add', 'safe.directory', ($Cartella -replace '\\', '/'))
            $top = Git-Out @('rev-parse', '--show-toplevel')
        }
    }
    if ((Normalizza $top) -ne (Normalizza $Cartella)) {
        if (Test-Path -LiteralPath (Join-Path $Cartella '.git')) {
            Mostra-Avviso 'La cartella .git del programma non risulta valida: aggiornamento saltato.'
            return $false
        }
        Mostra-Stato 'Collego la cartella del programma a GitHub...'
        if ((Git-Esegui @('init', '-b', $Ramo)) -ne 0) { $null = Git-Esegui @('init') }
    }
    $url = Git-Out @('remote', 'get-url', 'origin')
    if (-not $url) { $null = Git-Esegui @('remote', 'add', 'origin', $RepoUrl) }
    elseif ($url -ne $RepoUrl) { $null = Git-Esegui @('remote', 'set-url', 'origin', $RepoUrl) }
    return $true
}

function Scarica-Aggiornamenti {
    Mostra-Stato 'Controllo aggiornamenti su GitHub...'
    $a = '-c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 fetch --no-tags origin +refs/heads/' + $Ramo + ':refs/remotes/origin/' + $Ramo
    return ((Esegui $Git $a 180 'git fetch') -eq 0)
}

function Installa-Dipendenze {
    if (-not $NpmCli) { Mostra-Avviso 'npm non trovato: impossibile installare i componenti.'; return $false }
    Mostra-Stato 'Installo i componenti necessari (puo'' richiedere qualche minuto)...'
    $codice = Esegui $Node ('"' + $NpmCli + '" install --no-audit --no-fund --loglevel=error') 2400 'npm install'
    return ($codice -eq 0)
}

function Ripristina-Exe {
    $exe = Join-Path $Cartella $NomeExe
    if (-not (Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $FileExeVecchio)) {
        try { Move-Item -LiteralPath $FileExeVecchio -Destination $exe -ErrorAction Stop } catch {}
    }
}

function Torna-Indietro {
    if (-not $script:Vecchio -or $PrimoCollegamento) { return }
    Mostra-Stato 'Ripristino la versione precedente del programma...'
    $null = Git-Esegui @('reset', '--hard', $script:Vecchio)
    Ripristina-Exe
    if ($script:DipendenzeCambiate) { $null = Installa-Dipendenze }
    Scrivi-File $FileScartata $script:Nuovo
    $script:Aggiornato = $false
}

function Applica-Aggiornamento {
    $vecchio = $script:Vecchio
    $nuovo = $script:Nuovo
    Mostra-Stato 'Nuova versione trovata: salvo una copia dei dati...'
    Backup-Dati
    if ($PrimoCollegamento) { Backup-Completo }

    # file che cambiano
    $cambiati = @()
    if ($vecchio) {
        $lista = Git-Out @('diff', '--name-only', $vecchio, $nuovo)
        if ($lista) { $cambiati = @($lista -split "`r?`n") }
    }
    $script:DipendenzeCambiate = (-not $vecchio) -or ($cambiati -contains 'package.json') -or ($cambiati -contains 'package-lock.json')

    # eventuali modifiche fatte a mano sul PC: salvate prima di sovrascriverle
    if ($vecchio) {
        $mod = Git-Out @('status', '--porcelain', '--untracked-files=no', '--', '.', ':(exclude)package-lock.json')
        if ($mod) {
            New-Item -ItemType Directory -Force -Path $CartellaBackup | Out-Null
            $patch = Join-Path $CartellaBackup ('modifiche-locali-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.patch')
            $null = Git-Esegui @('diff', '--binary', ('--output=' + $patch), 'HEAD')
            Scrivi-Log ('Modifiche locali salvate in ' + $patch)
        }
    }

    # file di dati che erano nel vecchio git e non nel nuovo: protetti
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('bda-protetti-' + [guid]::NewGuid().ToString('N'))
    $protetti = @()
    if ($vecchio) {
        $eliminati = Git-Out @('diff', '--name-only', '--diff-filter=D', $vecchio, $nuovo)
        if ($eliminati) {
            foreach ($f in ($eliminati -split "`r?`n")) {
                if ($f -match '(^|/)(sheets_dump\.txt|[^/]*\.db(-[a-z]+)?|\.env[^/]*|[^/]*\.(xlsx?|csv|sqlite3?))$') {
                    $src = Join-Path $Cartella $f
                    if (Test-Path -LiteralPath $src -PathType Leaf) {
                        $dst = Join-Path $tmp $f
                        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
                        Copy-Item -LiteralPath $src -Destination $dst -Force
                        $protetti += $f
                    }
                }
            }
        }
    }

    # il programma di avvio in uso non si puo' sovrascrivere: lo si rinomina
    if ($cambiati -contains $NomeExe) {
        $exe = Join-Path $Cartella $NomeExe
        if (Test-Path -LiteralPath $exe) {
            Remove-Item -LiteralPath $FileExeVecchio -Force -ErrorAction SilentlyContinue
            try { Move-Item -LiteralPath $exe -Destination $FileExeVecchio -ErrorAction Stop }
            catch { Scrivi-Log ('Impossibile rinominare il programma di avvio: ' + $_.Exception.Message) }
        }
    }

    Mostra-Stato 'Installo la nuova versione del programma...'
    $ramoAttuale = Git-Out @('symbolic-ref', '--short', '-q', 'HEAD')
    if ($ramoAttuale -eq $Ramo) { $codice = Git-Esegui @('reset', '--hard', $nuovo) }
    else { $codice = Git-Esegui @('checkout', '-f', '-B', $Ramo, $nuovo) }

    # ripristino dei file di dati protetti (se mancano)
    foreach ($f in $protetti) {
        $dst = Join-Path $Cartella $f
        if (-not (Test-Path -LiteralPath $dst)) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
            Copy-Item -LiteralPath (Join-Path $tmp $f) -Destination $dst -Force
            Scrivi-Log ('File di dati mantenuto: ' + $f)
        }
    }
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue

    if ($codice -ne 0) {
        Mostra-Avviso 'Aggiornamento dei file non riuscito: torno alla versione precedente.'
        if ($vecchio) { $null = Git-Esegui @('reset', '--hard', $vecchio) }
        Ripristina-Exe
        return $false
    }
    Ripristina-Exe
    $null = Git-Esegui @('branch', ('--set-upstream-to=origin/' + $Ramo), $Ramo)
    $script:Aggiornato = $true

    $next = Join-Path $Cartella 'node_modules/next/dist/bin/next'
    if ($script:DipendenzeCambiate -or -not (Test-Path -LiteralPath $next)) {
        if (-not (Installa-Dipendenze)) {
            Mostra-Avviso 'Installazione dei componenti non riuscita.'
            Torna-Indietro
            return $false
        }
    }
    return $true
}

# ---------------------------------------------------------------------------
# Compilazione (next build) con ripristino della build precedente se fallisce
# ---------------------------------------------------------------------------
function Serve-Compilare {
    if ($Forza) { return $true }
    if (-not (Test-Path -LiteralPath (Join-Path $Cartella '.next/BUILD_ID'))) { return $true }
    if (-not $Git) { return $false }
    $head = Git-Out @('rev-parse', 'HEAD')
    if (-not $head) { return $false }
    return ((Leggi-File $FileUltimaBuild) -ne $head)
}

function Compila {
    $next = Join-Path $Cartella 'node_modules/next/dist/bin/next'
    if (-not (Test-Path -LiteralPath $next)) {
        if (-not (Installa-Dipendenze)) { return $false }
    }
    Mostra-Stato 'Preparo il programma (compilazione: 1-3 minuti)...'
    $dist = Join-Path $Cartella '.next'
    $distPrec = Join-Path $Cartella '.next_precedente'
    if (Test-Path -LiteralPath $distPrec) { Remove-Item -LiteralPath $distPrec -Recurse -Force -ErrorAction SilentlyContinue }
    $haPrecedente = $false
    if (Test-Path -LiteralPath $dist) {
        try { Rename-Item -LiteralPath $dist -NewName '.next_precedente' -ErrorAction Stop; $haPrecedente = $true }
        catch { Scrivi-Log ('Impossibile mettere da parte la build precedente: ' + $_.Exception.Message) }
    }
    if ($haPrecedente -and (Test-Path -LiteralPath (Join-Path $distPrec 'cache'))) {
        try {
            New-Item -ItemType Directory -Force -Path $dist | Out-Null
            Move-Item -LiteralPath (Join-Path $distPrec 'cache') -Destination (Join-Path $dist 'cache') -ErrorAction Stop
        } catch {}
    }

    $codice = Esegui $Node ('"' + $next + '" build') 2400 'next build'

    if ($codice -eq 0 -and (Test-Path -LiteralPath (Join-Path $dist 'BUILD_ID'))) {
        if ($haPrecedente) { Remove-Item -LiteralPath $distPrec -Recurse -Force -ErrorAction SilentlyContinue }
        $head = ''
        if ($Git) { $head = Git-Out @('rev-parse', 'HEAD') }
        Scrivi-File $FileUltimaBuild $head
        return $true
    }

    Mostra-Avviso 'Compilazione non riuscita (dettagli in logs\aggiornamento.log).'
    if ($haPrecedente) {
        Remove-Item -LiteralPath $dist -Recurse -Force -ErrorAction SilentlyContinue
        try { Rename-Item -LiteralPath $distPrec -NewName '.next' -ErrorAction Stop }
        catch { Scrivi-Log ('Impossibile ripristinare la build precedente: ' + $_.Exception.Message) }
    }
    return $false
}

function Imposta-IdFoglio {
    if (-not $IdFoglioGoogle) { return }
    $f = Join-Path $Cartella '.env.local'
    $contenuto = Leggi-File $f
    if ($contenuto -match '(?m)^\s*GOOGLE_SHEET_ID\s*=') { return }
    $riga = 'GOOGLE_SHEET_ID=' + $IdFoglioGoogle
    try {
        if (Test-Path -LiteralPath $f) { Add-Content -LiteralPath $f -Value ("`r`n" + $riga) -Encoding ASCII }
        else { Set-Content -LiteralPath $f -Value $riga -Encoding ASCII }
        Scrivi-Log 'ID del Foglio Google salvato in .env.local'
    } catch { Scrivi-Log ('Impossibile scrivere .env.local: ' + $_.Exception.Message) }
}

# ---------------------------------------------------------------------------
# Programma principale
# ---------------------------------------------------------------------------
$CodiceUscita = 0
$lucchetto = $null
try {
    try {
        $lucchetto = [System.IO.File]::Open((Join-Path $CartellaLog 'aggiornamento.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    } catch {
        Mostra-Avviso 'Un aggiornamento e'' gia'' in corso.'
        exit 0
    }

    $modo = 'manuale'
    if ($PrimoCollegamento) { $modo = 'primo collegamento' } elseif ($DaLauncher) { $modo = 'avvio del programma' }
    Scrivi-Log '=============================================================='
    Scrivi-Log ('Aggiornamento - modalita'': ' + $modo + ' - cartella: ' + $Cartella)
    Scrivi-Log ('git: ' + $Git + ' | node: ' + $Node + ' | npm: ' + $NpmCli)

    if (Test-Path -LiteralPath $FileExeVecchio) { Remove-Item -LiteralPath $FileExeVecchio -Force -ErrorAction SilentlyContinue }

    if (Porta-Occupata $Porta) {
        Mostra-Avviso 'Il programma risulta gia'' aperto: chiudilo e riprova ad aggiornare.'
        if ($DaLauncher) { exit 0 } else { exit 3 }
    }

    if (-not $Git) {
        Mostra-Avviso 'Git non trovato: aggiornamento automatico non disponibile.'
    } elseif (Prepara-Repository) {
        if (Scarica-Aggiornamenti) {
            $script:Nuovo = Git-Out @('rev-parse', '--verify', '-q', ('refs/remotes/origin/' + $Ramo))
            $script:Vecchio = Git-Out @('rev-parse', '--verify', '-q', 'HEAD')
            Scrivi-Log ('Versione installata: ' + $script:Vecchio + ' | su GitHub: ' + $script:Nuovo)
            if ($script:Nuovo -and ($script:Nuovo -ne $script:Vecchio)) {
                if (-not $Forza -and -not $PrimoCollegamento -and ((Leggi-File $FileScartata) -eq $script:Nuovo)) {
                    Mostra-Avviso 'L''ultima versione non si era installata correttamente: resto sulla versione attuale.'
                } else {
                    $null = Applica-Aggiornamento
                }
            }
        } else {
            Mostra-Avviso 'GitHub non raggiungibile (manca internet?): uso la versione attuale.'
        }
    }

    if ($PrimoCollegamento) { Imposta-IdFoglio }

    if (Serve-Compilare) {
        if (-not $Node) {
            Mostra-Avviso 'Node.js non trovato: impossibile preparare il programma.'
            $CodiceUscita = 2
        } elseif (-not (Compila)) {
            if ($script:Aggiornato -and -not $PrimoCollegamento) {
                Torna-Indietro
                if ((Serve-Compilare) -and -not (Compila)) { $CodiceUscita = 2 }
            } elseif (-not (Test-Path -LiteralPath (Join-Path $Cartella '.next/BUILD_ID'))) {
                $CodiceUscita = 2
            }
        }
    }

    if ($CodiceUscita -eq 0) {
        if ($script:Aggiornato) { Mostra-Stato 'Programma aggiornato all''ultima versione.' }
        else { Mostra-Stato 'Programma pronto.' }
    }
} catch {
    Scrivi-Log ('ERRORE IMPREVISTO: ' + $_.Exception.Message + ' | ' + $_.ScriptStackTrace)
    Mostra-Avviso ('Errore durante l''aggiornamento: ' + $_.Exception.Message)
    $CodiceUscita = 1
} finally {
    if ($lucchetto) { $lucchetto.Close() }
}
exit $CodiceUscita
