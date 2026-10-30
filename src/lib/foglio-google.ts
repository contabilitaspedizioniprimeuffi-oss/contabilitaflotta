import fs from "node:fs";
import path from "node:path";

/**
 * Collegamento al Foglio Google tramite l'app web Apps Script
 * (codice in strumenti/foglio-google.gs).
 *
 * L'indirizzo dell'app web e' salvato nel file locale .env.local
 * (GOOGLE_SHEET_URL=...), che non va mai su GitHub. Ogni download riuscito
 * viene salvato anche in sheets_dump.txt: se manca internet, la
 * sincronizzazione usa quella copia.
 */

const CHIAVE_URL = "GOOGLE_SHEET_URL";

const fileEnvLocale = () => path.resolve(process.cwd(), ".env.local");
const fileEnv = () => path.resolve(process.cwd(), ".env");
const fileCopia = () => path.resolve(process.cwd(), "sheets_dump.txt");
const fileCopiaTemp = () => path.resolve(process.cwd(), "sheets_dump.txt.tmp");

function leggiVariabile(testo: string | null, chiave: string): string | null {
  if (!testo) return null;
  for (const riga of testo.split(/\r?\n/)) {
    const m = riga.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === chiave) {
      const valore = m[2].replace(/^["']|["']$/g, "").trim();
      return valore || null;
    }
  }
  return null;
}

function leggiFile(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

/** Valore di una impostazione: .env.local, poi .env, poi variabili d'ambiente */
function impostazione(chiave: string): string | null {
  return (
    leggiVariabile(leggiFile(fileEnvLocale()), chiave) ??
    leggiVariabile(leggiFile(fileEnv()), chiave) ??
    (process.env[chiave]?.trim() || null)
  );
}

export function indirizzoFoglio(): string | null {
  return impostazione(CHIAVE_URL);
}

/** ID del Foglio Google (GOOGLE_SHEET_ID in .env), se valido */
export function idFoglio(): string | null {
  const id = impostazione("GOOGLE_SHEET_ID");
  return id && /^[A-Za-z0-9_-]{20,}$/.test(id) ? id : null;
}

/** Link per aprire il Foglio nel browser */
export function linkFoglio(): string | null {
  const id = idFoglio();
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

export function normalizzaIndirizzo(testo: string): string {
  return testo.trim().replace(/[?#].*$/, "");
}

export function indirizzoValido(url: string): boolean {
  // solo per l'anteprima e i test: finto Foglio sul PC stesso
  if (process.env.BDA_FOGLIO_TEST === "1" && /^http:\/\/127\.0\.0\.1:\d+\/\S+$/.test(url)) return true;
  return /^https:\/\/script\.google\.com\/(macros|a\/macros\/[^/\s]+)\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(url);
}

/** Indirizzo mostrato a schermo, accorciato */
export function mascheraIndirizzo(url: string): string {
  const m = url.match(/^(https?:\/\/[^/]+\/.*?\/s\/)([A-Za-z0-9_-]+)(\/exec)$/);
  if (!m) return url.length > 48 ? `${url.slice(0, 40)}…` : url;
  const id = m[2];
  return `${m[1]}${id.slice(0, 6)}…${id.slice(-4)}${m[3]}`;
}

/** Salva (o toglie, con null) l'indirizzo nel file .env.local */
export function salvaIndirizzoFoglio(url: string | null): void {
  const file = fileEnvLocale();
  const esistente = leggiFile(file);
  let righe = esistente ? esistente.split(/\r?\n/) : [];
  righe = righe.filter(
    (r) => !/^\s*GOOGLE_SHEET_URL\s*=/.test(r) && !r.startsWith("# Indirizzo dell'app web del Foglio Google"),
  );
  while (righe.length && righe[righe.length - 1].trim() === "") righe.pop();
  if (url) {
    righe.push("# Indirizzo dell'app web del Foglio Google (funziona come una password: mai su GitHub)");
    righe.push(`${CHIAVE_URL}=${url}`);
  }
  if (righe.length) fs.writeFileSync(file, `${righe.join("\n")}\n`, "utf-8");
  else fs.rmSync(file, { force: true });
}

export type Scaricato =
  | { ok: true; testo: string; schede: number }
  | { ok: false; errore: string };

/** Scarica il contenuto del Foglio dall'app web */
export async function scaricaFoglio(url: string, timeoutMs = 120_000): Promise<Scaricato> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow", signal: ctrl.signal });
    const testo = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        errore:
          res.status === 404
            ? "indirizzo non trovato (il deployment è stato archiviato o l'indirizzo è sbagliato)"
            : `il Foglio Google ha risposto con un errore (${res.status})`,
      };
    }
    if (/^\s*</.test(testo)) {
      return {
        ok: false,
        errore: "accesso negato: nel deployment dell'app web «Chi ha accesso» deve essere «Chiunque»",
      };
    }
    if (!/^--- RIEPILOGO ---$/m.test(testo)) {
      return { ok: false, errore: "nel Foglio non c'è la scheda RIEPILOGO (è il Foglio giusto?)" };
    }
    const schede = (testo.match(/^--- .+ ---$/gm) ?? []).length;
    return { ok: true, testo, schede };
  } catch (e) {
    const scaduto = (e as Error)?.name === "AbortError";
    return {
      ok: false,
      errore: scaduto ? "il Foglio Google non ha risposto in tempo" : "nessuna connessione a internet (o Google non risponde)",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Copia locale dell'ultimo download (usata se manca internet) */
export function salvaCopiaLocale(testo: string): void {
  fs.writeFileSync(fileCopiaTemp(), testo, "utf-8");
  fs.renameSync(fileCopiaTemp(), fileCopia());
}

export function leggiCopiaLocale(): string | null {
  return leggiFile(fileCopia());
}

export function infoCopiaLocale(): { presente: boolean; aggiornataIl: string | null } {
  try {
    const st = fs.statSync(fileCopia());
    return { presente: true, aggiornataIl: st.mtime.toISOString() };
  } catch {
    return { presente: false, aggiornataIl: null };
  }
}

export function formattaDataOra(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
