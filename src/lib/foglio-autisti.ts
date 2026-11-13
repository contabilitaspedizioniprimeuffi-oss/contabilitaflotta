import fs from "node:fs";
import path from "node:path";
import { indirizzoValido, mascheraIndirizzo, normalizzaIndirizzo } from "@/lib/foglio-google";
import { SCHEDA_USCITA, estraiScheda } from "@/lib/registro-autisti";

/**
 * Collegamento al secondo Foglio Google, il «registro presenze autisti», tramite una seconda antenna
 * Apps Script (codice in strumenti/foglio-google-autisti.gs). Stesso metodo del Foglio del gasolio:
 * - l'indirizzo dell'app web sta in .env.local (GOOGLE_SHEET_URL_AUTISTI=...), mai su GitHub;
 * - ogni download riuscito si salva in sheets_dump_autisti.txt, usato se manca internet.
 */

export const CHIAVE_URL_AUTISTI = "GOOGLE_SHEET_URL_AUTISTI";
const CHIAVE_ID_AUTISTI = "GOOGLE_SHEET_ID_AUTISTI";
const COMMENTO = "# Indirizzo dell'app web del Foglio «registro autisti» (funziona come una password: mai su GitHub)";

const fileEnvLocale = () => path.resolve(process.cwd(), ".env.local");
const fileEnv = () => path.resolve(process.cwd(), ".env");
const fileCopia = () => path.resolve(process.cwd(), "sheets_dump_autisti.txt");
const fileCopiaTemp = () => path.resolve(process.cwd(), "sheets_dump_autisti.txt.tmp");

function leggiFile(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

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

function impostazione(chiave: string): string | null {
  return (
    leggiVariabile(leggiFile(fileEnvLocale()), chiave) ??
    leggiVariabile(leggiFile(fileEnv()), chiave) ??
    (process.env[chiave]?.trim() || null)
  );
}

export function indirizzoFoglioAutisti(): string | null {
  return impostazione(CHIAVE_URL_AUTISTI);
}

/** ID del Foglio del registro autisti (GOOGLE_SHEET_ID_AUTISTI in .env), se valido: serve solo per il codice dell'antenna e il link */
export function idFoglioAutisti(): string | null {
  const id = impostazione(CHIAVE_ID_AUTISTI);
  return id && /^[A-Za-z0-9_-]{20,}$/.test(id) ? id : null;
}

export function linkFoglioAutisti(): string | null {
  const id = idFoglioAutisti();
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

export { indirizzoValido, mascheraIndirizzo, normalizzaIndirizzo };

/** Salva (o toglie, con null) l'indirizzo in .env.local senza toccare le altre righe */
export function salvaIndirizzoFoglioAutisti(url: string | null): void {
  const file = fileEnvLocale();
  const esistente = leggiFile(file);
  let righe = esistente ? esistente.split(/\r?\n/) : [];
  righe = righe.filter((r) => !new RegExp(`^\\s*${CHIAVE_URL_AUTISTI}\\s*=`).test(r) && r !== COMMENTO);
  while (righe.length && righe[righe.length - 1].trim() === "") righe.pop();
  if (url) {
    righe.push(COMMENTO);
    righe.push(`${CHIAVE_URL_AUTISTI}=${url}`);
  }
  if (righe.length) fs.writeFileSync(file, `${righe.join("\n")}\n`, "utf-8");
  else fs.rmSync(file, { force: true });
}

export type ScaricatoAutisti = { ok: true; testo: string; righe: number } | { ok: false; errore: string };

/** Scarica il testo dell'antenna del registro autisti e controlla che contenga la scheda USCITA_AUTISTI */
export async function scaricaFoglioAutisti(url: string, timeoutMs = 120_000): Promise<ScaricatoAutisti> {
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
      return { ok: false, errore: "accesso negato: nel deployment dell'app web «Chi ha accesso» deve essere «Chiunque»" };
    }
    const scheda = estraiScheda(testo);
    if (!scheda) return { ok: false, errore: `nel Foglio non c'è la scheda ${SCHEDA_USCITA} (è il Foglio del registro autisti?)` };
    const righe = Math.max(0, scheda.filter((r) => r.trim()).length - 1); // senza l'intestazione
    return { ok: true, testo, righe };
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

export function salvaCopiaLocaleAutisti(testo: string): void {
  fs.writeFileSync(fileCopiaTemp(), testo, "utf-8");
  fs.renameSync(fileCopiaTemp(), fileCopia());
}

export function leggiCopiaLocaleAutisti(): string | null {
  return leggiFile(fileCopia());
}

export function infoCopiaLocaleAutisti(): { presente: boolean; aggiornataIl: string | null } {
  try {
    const st = fs.statSync(fileCopia());
    return { presente: true, aggiornataIl: st.mtime.toISOString() };
  } catch {
    return { presente: false, aggiornataIl: null };
  }
}
