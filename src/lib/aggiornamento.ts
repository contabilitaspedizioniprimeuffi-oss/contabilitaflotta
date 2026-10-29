// ---------------------------------------------------------------------------
// Sincronizzazione del programma con GitHub (solo lato server)
// ---------------------------------------------------------------------------
// - controllaAggiornamenti(): confronta la versione installata con quella
//   pubblicata su GitHub ed elenca le novita'.
// - richiediAggiornamento(): chiede a "Banca Dati Automezzi.exe" di installare
//   la nuova versione. Il programma di avvio chiude il server, esegue
//   strumenti/aggiorna.ps1 (backup dei dati, aggiornamento, compilazione,
//   ritorno automatico alla versione precedente se qualcosa va storto) e
//   riavvia il programma.
// I dati (local_database.db, sheets_dump.txt, .env.local) non vengono toccati.
// ---------------------------------------------------------------------------
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_URL =
  process.env.BDA_REPO_URL ||
  "https://github.com/contabilitaspedizioniprimeuffi-oss/contabilitaflotta.git";
const RAMO = "main";
const RIF_GITHUB = `refs/remotes/origin/${RAMO}`;
const FORMATO = "--format=%H%x1f%cI%x1f%s";
const DURATA_CACHE = 60_000;

export type Versione = {
  sha: string;
  breve: string;
  data: string;
  messaggio: string;
};

export type EsitoUltimo = {
  esito: string;
  quando: string;
  versione?: string | null;
  messaggio?: string | null;
};

export type StatoSincronizzazione = {
  /** aggiornato | novita (da installare) | prima-volta (cartella non ancora collegata) | offline | errore */
  stato: "aggiornato" | "novita" | "prima-volta" | "offline" | "errore";
  installata: Versione | null;
  github: Versione | null;
  novita: Versione[];
  totaleNovita: number;
  /** l'ultima versione di GitHub non si era installata correttamente */
  versioneScartata: boolean;
  /** il programma e' stato aperto da "Banca Dati Automezzi.exe" (necessario per installare) */
  puoInstallare: boolean;
  ultimoEsito: EsitoUltimo | null;
  controllatoIl: string;
  errore?: string;
};

const cartella = () => process.cwd();
// percorsi fissi nella cartella del programma
const fileEsito = () => path.resolve(process.cwd(), "logs", "ultimo-aggiornamento.json");
const fileRichiesta = () => path.resolve(process.cwd(), "logs", "richiesta-aggiornamento");
const fileScartata = () => path.resolve(process.cwd(), "strumenti", ".versione-scartata");
const cartellaLog = () => path.resolve(process.cwd(), "logs");

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------
// Git viene chiamato per nome: se non e' nel PATH si aggiunge la sua cartella
// (installazione per l'utente o in Programmi)
let pathConGit: string | null = null;

function percorsoConGit(): string {
  if (pathConGit !== null) return pathConGit;
  const attuale = process.env.PATH ?? process.env.Path ?? "";
  const candidati: string[] = [];
  if (process.platform === "win32") {
    const la = process.env.LOCALAPPDATA;
    const pf = process.env.ProgramFiles;
    const pf86 = process.env["ProgramFiles(x86)"];
    if (la) candidati.push(path.join(/*turbopackIgnore: true*/ la, "Programs", "Git", "cmd"));
    if (pf) candidati.push(path.join(/*turbopackIgnore: true*/ pf, "Git", "cmd"));
    if (pf86) candidati.push(path.join(/*turbopackIgnore: true*/ pf86, "Git", "cmd"));
  }
  const dir = candidati.find((c) => existsSync(/*turbopackIgnore: true*/ path.join(c, "git.exe")));
  pathConGit = dir ? `${dir}${path.delimiter}${attuale}` : attuale;
  return pathConGit;
}

function ambienteGit(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.toUpperCase() === "PATH") delete env[k]; // su Windows la variabile si chiama "Path"
  }
  env.PATH = percorsoConGit();
  env.GIT_TERMINAL_PROMPT = "0";
  env.GCM_INTERACTIVE = "never";
  return env;
}

type RisultatoGit = { ok: boolean; out: string; err: string; mancante: boolean };

function git(args: string[], timeout = 15_000): Promise<RisultatoGit> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-c", "safe.directory=*", ...args],
      {
        cwd: cartella(),
        timeout,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        env: ambienteGit(),
      },
      (error, stdout, stderr) => {
        const codice = (error as NodeJS.ErrnoException | null)?.code;
        resolve({
          ok: !error,
          out: String(stdout ?? "").trim(),
          err: String(stderr || error?.message || "").trim(),
          mancante: codice === "ENOENT",
        });
      },
    );
  });
}

function analizza(riga: string): Versione {
  const [sha = "", data = "", ...resto] = riga.split("\x1f");
  return { sha, breve: sha.slice(0, 7), data, messaggio: resto.join(" ").trim() };
}

async function leggiVersione(rif: string): Promise<Versione | null> {
  const r = await git(["log", "-1", FORMATO, rif, "--"]);
  if (!r.ok || !r.out) return null;
  return analizza(r.out.split(/\r?\n/)[0]);
}

async function antenato(a: string, b: string): Promise<boolean> {
  return (await git(["merge-base", "--is-ancestor", a, b])).ok;
}

function normalizza(p: string): string {
  const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? n.toLowerCase() : n;
}

// ---------------------------------------------------------------------------
// File di stato scritti da strumenti/aggiorna.ps1
// ---------------------------------------------------------------------------
function leggiTesto(file: string): string {
  try {
    return readFileSync(/*turbopackIgnore: true*/ file, "utf8").replace(/^\uFEFF/, "").trim();
  } catch {
    return "";
  }
}

function leggiEsito(): EsitoUltimo | null {
  const testo = leggiTesto(fileEsito());
  if (!testo) return null;
  try {
    const d = JSON.parse(testo);
    return d && typeof d.esito === "string" ? (d as EsitoUltimo) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Controllo delle novita'
// ---------------------------------------------------------------------------
let cache: { quando: number; valore: StatoSincronizzazione } | null = null;
let inCorso: Promise<StatoSincronizzazione> | null = null;

export async function controllaAggiornamenti(forza = false): Promise<StatoSincronizzazione> {
  if (!forza && cache && Date.now() - cache.quando < DURATA_CACHE) {
    return { ...cache.valore, ultimoEsito: leggiEsito() };
  }
  if (!inCorso) {
    inCorso = eseguiControllo()
      .then((valore) => {
        cache = { quando: Date.now(), valore };
        return valore;
      })
      .finally(() => {
        inCorso = null;
      });
  }
  return inCorso;
}

async function eseguiControllo(): Promise<StatoSincronizzazione> {
  const base = {
    installata: null as Versione | null,
    github: null as Versione | null,
    novita: [] as Versione[],
    totaleNovita: 0,
    versioneScartata: false,
    puoInstallare: process.env.BDA_LAUNCHER === "1",
    ultimoEsito: leggiEsito(),
    controllatoIl: new Date().toISOString(),
  };

  const top = await git(["rev-parse", "--show-toplevel"]);
  if (top.mancante) {
    return { ...base, stato: "errore", errore: "Git non risulta installato su questo PC." };
  }
  const collegata = top.ok && normalizza(top.out) === normalizza(cartella());

  if (!collegata) {
    // Cartella non ancora collegata a git: si verifica solo che GitHub risponda
    const r = await git(["ls-remote", REPO_URL, `refs/heads/${RAMO}`], 45_000);
    if (!r.ok) return { ...base, stato: "offline", errore: "GitHub non raggiungibile." };
    return { ...base, stato: "prima-volta" };
  }

  base.installata = await leggiVersione("HEAD");

  const fetch = await git(
    [
      "-c", "http.lowSpeedLimit=1000",
      "-c", "http.lowSpeedTime=20",
      "fetch", "--no-tags", "--quiet", REPO_URL,
      `+refs/heads/${RAMO}:${RIF_GITHUB}`,
    ],
    60_000,
  );
  if (!fetch.ok) {
    return { ...base, stato: "offline", errore: "GitHub non raggiungibile (manca internet?)." };
  }

  const github = await leggiVersione(RIF_GITHUB);
  if (!github) return { ...base, stato: "errore", errore: "Impossibile leggere la versione su GitHub." };
  base.github = github;
  base.versioneScartata = leggiTesto(fileScartata()) === github.sha;

  const installata = base.installata;
  if (installata && installata.sha === github.sha) return { ...base, stato: "aggiornato" };

  if (installata && (await antenato(installata.sha, github.sha))) {
    const log = await git(["log", FORMATO, `${installata.sha}..${github.sha}`, "--"]);
    const righe = log.ok && log.out ? log.out.split(/\r?\n/).filter(Boolean) : [];
    return {
      ...base,
      stato: "novita",
      novita: righe.slice(0, 15).map(analizza),
      totaleNovita: righe.length,
    };
  }

  // Versione locale piu' recente di GitHub (succede solo durante lo sviluppo)
  if (installata && (await antenato(github.sha, installata.sha))) {
    return { ...base, stato: "aggiornato" };
  }

  // Storia diversa da quella di GitHub: prima sincronizzazione di questo PC
  return { ...base, stato: "prima-volta", novita: [github], totaleNovita: 1 };
}

// ---------------------------------------------------------------------------
// Richiesta di installazione (eseguita da "Banca Dati Automezzi.exe")
// ---------------------------------------------------------------------------
export function richiediAggiornamento(forza: boolean): { ok: boolean; messaggio: string } {
  if (process.env.BDA_LAUNCHER !== "1") {
    return {
      ok: false,
      messaggio:
        "Il programma non è stato aperto da «Banca Dati Automezzi.exe», quindi non può aggiornarsi da solo. " +
        "Chiudilo e fai doppio clic su «aggiorna-da-github.bat» (oppure riaprilo dall'icona del programma).",
    };
  }
  try {
    mkdirSync(cartellaLog(), { recursive: true });
    writeFileSync(
      fileRichiesta(),
      `${forza ? "forza " : ""}${new Date().toISOString()}`,
    );
    cache = null;
    return { ok: true, messaggio: "Aggiornamento avviato." };
  } catch (e) {
    return {
      ok: false,
      messaggio: `Impossibile avviare l'aggiornamento: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
