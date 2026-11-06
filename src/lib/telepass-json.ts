// Lettura e controllo del file JSON dei pedaggi Telepass.
// Il formato è descritto in strumenti/pedaggi-telepass/GUIDA-CONVERTITORE.md
// (esempio: strumenti/pedaggi-telepass/esempio-input-atteso.json).
// Solo funzioni pure: le usa il server sia per l'anteprima sia per l'importazione.

export const FORMATO_TELEPASS = "pedaggi-telepass";
export const VERSIONE_TELEPASS = 1;

const CAMPI_PASSAGGIO = [
  "id_prenotazione",
  "targa",
  "data_entrata",
  "ora_entrata",
  "stazione_entrata",
  "data_uscita",
  "ora_uscita",
  "stazione_uscita",
  "classe",
  "srv",
  "importo",
] as const;

const MAX_ERRORI = 25;

export type PassaggioTelepass = {
  dispositivo: string;
  idPrenotazione: string | null;
  targa: string; // "" se nel file manca
  dataEntrata: string | null;
  oraEntrata: string | null;
  stazioneEntrata: string | null;
  dataUscita: string;
  oraUscita: string | null;
  stazioneUscita: string | null;
  classe: string | null;
  servizio: string | null;
  importo: number; // IVA inclusa, come nel PDF
};

export type FatturaTelepass = {
  numero: string;
  data: string | null;
  periodoDal: string | null;
  periodoAl: string | null;
  totale: number | null;
};

export type FileTelepass = {
  fattura: FatturaTelepass;
  dispositivi: number;
  passaggi: PassaggioTelepass[];
  totale: number;
  avvisi: string[];
};

export type LetturaTelepass = { ok: true; file: FileTelepass } | { ok: false; errori: string[] };

type Oggetto = Record<string, unknown>;
const isOggetto = (v: unknown): v is Oggetto => typeof v === "object" && v !== null && !Array.isArray(v);

/** Somma arrotondata al centesimo */
export const centesimi = (n: number) => Math.round(n * 100) / 100;
const euro = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

function testo(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** Testo in maiuscolo con gli spazi in eccesso tolti; null se vuoto */
function maiuscolo(v: unknown): string | null {
  const t = testo(v).replace(/\s+/g, " ").toUpperCase();
  return t === "" ? null : t;
}

/** "AB 123 CD" / "ab-123-cd" → "AB123CD" */
export function normalizzaTarga(t: string): string {
  return t.toUpperCase().replace(/[\s.\-]/g, "");
}

/** "N. 1a2b3c4d / 6389…F" → "1A2B3C4D/6389…F" */
export function normalizzaDispositivo(c: string): string {
  return c.toUpperCase().replace(/^N\.\s*/, "").replace(/\s+/g, "");
}

/** "2026-11-03" o "03/11/2026" → "2026-11-03"; "" → null; non valida → undefined */
function data(v: unknown): string | null | undefined {
  const t = testo(v);
  if (t === "") return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let iso: string | null = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  if (!iso) {
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (!iso) return undefined;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? undefined : iso;
}

/** "9:05" / "09:05:30" → "09:05:00" / "09:05:30"; "" → null; non valida → undefined */
function ora(v: unknown): string | null | undefined {
  const t = testo(v);
  if (t === "") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) return undefined;
  return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

/** 1.7 / "1,70" / "-0,90" → numero; mancante o non valido → undefined */
function numero(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string" || v.trim() === "") return undefined;
  let t = v.trim().replace(/\s|€/g, "");
  t = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}

/** Chiave che riconosce lo stesso passaggio già caricato (per non importarlo due volte) */
export function chiavePassaggio(p: {
  dispositivo: string | null;
  dataUscita: string;
  oraUscita: string | null;
  stazioneUscita: string | null;
  servizio: string | null;
  importo: number | string;
}): string {
  return [
    normalizzaDispositivo(p.dispositivo ?? ""),
    p.dataUscita,
    p.oraUscita ?? "",
    (p.stazioneUscita ?? "").replace(/\s+/g, " ").trim().toUpperCase(),
    (p.servizio ?? "").trim().toUpperCase(),
    Number(p.importo).toFixed(2),
  ].join("|");
}

/** Legge il file e controlla tutto; se qualcosa non va restituisce l'elenco dei problemi */
export function leggiFileTelepass(contenuto: string): LetturaTelepass {
  let dati: unknown;
  try {
    dati = JSON.parse(contenuto.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, errori: ["Il file non è un JSON valido (controllalo con un validatore JSON)."] };
  }
  if (!isOggetto(dati)) return { ok: false, errori: ["Il file non ha la struttura attesa (vedi la guida)."] };

  const errori: string[] = [];
  let altri = 0;
  const errore = (msg: string) => (errori.length < MAX_ERRORI ? errori.push(msg) : altri++);

  if (dati.formato !== FORMATO_TELEPASS) errore(`«formato» deve essere "${FORMATO_TELEPASS}".`);
  if (Number(dati.versione) !== VERSIONE_TELEPASS) errore(`«versione» deve essere ${VERSIONE_TELEPASS}.`);

  // Fattura
  const f = isOggetto(dati.fattura) ? dati.fattura : null;
  if (!f) errore("Manca la parte «fattura».");
  const numeroFattura = testo(f?.numero);
  if (f && numeroFattura === "") errore("Manca il numero della fattura (fattura.numero).");
  const dataFattura = data(f?.data);
  const periodoDal = data(f?.periodo_dal);
  const periodoAl = data(f?.periodo_al);
  if (f && dataFattura === undefined) errore("fattura.data non è una data valida (AAAA-MM-GG).");
  if (f && periodoDal === undefined) errore("fattura.periodo_dal non è una data valida (AAAA-MM-GG).");
  if (f && periodoAl === undefined) errore("fattura.periodo_al non è una data valida (AAAA-MM-GG).");
  const totaleFattura = f && testo(f.totale) !== "" ? numero(f.totale) : null;
  if (totaleFattura === undefined) errore("fattura.totale non è un numero valido.");

  // Dispositivi e passaggi
  const passaggi: PassaggioTelepass[] = [];
  const dispositivi = Array.isArray(dati.dispositivi) ? dati.dispositivi : null;
  if (!dispositivi || dispositivi.length === 0) errore("Manca l'elenco «dispositivi» (o è vuoto).");

  (dispositivi ?? []).forEach((d, i) => {
    if (!isOggetto(d)) return errore(`Dispositivo n. ${i + 1}: struttura non valida.`);
    const codice = normalizzaDispositivo(testo(d.codice));
    const nome = codice ? `Dispositivo ${codice.split("/")[0]}` : `Dispositivo n. ${i + 1}`;
    if (!codice) errore(`${nome}: manca il codice OBU/PAN (codice).`);
    const totaleDisp = numero(d.totale);
    if (totaleDisp === undefined) errore(`${nome}: manca il totale (riga TOTALE del PDF) o non è un numero.`);
    if (!Array.isArray(d.passaggi)) return errore(`${nome}: manca l'elenco «passaggi».`);

    let somma = 0;
    d.passaggi.forEach((p: unknown, j: number) => {
      const dove = `${nome}, passaggio ${j + 1}`;
      if (!isOggetto(p)) return errore(`${dove}: struttura non valida.`);
      const mancanti = CAMPI_PASSAGGIO.filter((c) => !(c in p));
      const sconosciuti = Object.keys(p).filter((c) => !(CAMPI_PASSAGGIO as readonly string[]).includes(c) && c !== "iva");
      if (mancanti.length) errore(`${dove}: mancano i campi ${mancanti.join(", ")}.`);
      if (sconosciuti.length) errore(`${dove}: campi non previsti ${sconosciuti.join(", ")} (controlla i nomi nella guida).`);

      const dataUscita = data(p.data_uscita);
      const oraUscita = ora(p.ora_uscita);
      const dataEntrata = data(p.data_entrata);
      const oraEntrata = ora(p.ora_entrata);
      const importo = numero(p.importo);
      const targa = normalizzaTarga(testo(p.targa));
      if (!dataUscita) errore(`${dove}: data di uscita mancante o non valida (AAAA-MM-GG).`);
      if (oraUscita === undefined) errore(`${dove}: ora di uscita non valida (HH:MM:SS).`);
      if (dataEntrata === undefined) errore(`${dove}: data di entrata non valida (AAAA-MM-GG oppure "").`);
      if (oraEntrata === undefined) errore(`${dove}: ora di entrata non valida (HH:MM:SS oppure "").`);
      if (importo === undefined) errore(`${dove}: importo mancante o non valido (es. 1.70).`);
      if (targa !== "" && !/^[A-Z0-9]{2,10}$/.test(targa)) errore(`${dove}: targa non valida («${testo(p.targa)}»).`);
      if (importo !== undefined) somma += importo;

      if (dataUscita && oraUscita !== undefined && dataEntrata !== undefined && oraEntrata !== undefined && importo !== undefined) {
        passaggi.push({
          dispositivo: codice,
          idPrenotazione: maiuscolo(p.id_prenotazione),
          targa,
          dataEntrata,
          oraEntrata,
          stazioneEntrata: maiuscolo(p.stazione_entrata),
          dataUscita,
          oraUscita,
          stazioneUscita: maiuscolo(p.stazione_uscita),
          classe: maiuscolo(p.classe),
          servizio: maiuscolo(p.srv),
          importo: centesimi(importo),
        });
      }
    });

    if (totaleDisp !== undefined && Math.abs(centesimi(somma) - totaleDisp) > 0.005) {
      errore(
        `${nome}: la somma dei passaggi (${euro(centesimi(somma))}) non corrisponde al totale del PDF (${euro(totaleDisp)}). ` +
          "Probabilmente il convertitore ha perso o letto male una riga."
      );
    }
  });

  if (altri > 0) errori.push(`…e altri ${altri} problemi.`);
  if (errori.length > 0) return { ok: false, errori };

  const totale = centesimi(passaggi.reduce((s, p) => s + p.importo, 0));
  const avvisi: string[] = [];
  if (totaleFattura !== null && totaleFattura !== undefined && Math.abs(totale - totaleFattura) > 0.005) {
    avvisi.push(
      `La somma di tutti i passaggi (${euro(totale)}) è diversa dal totale della fattura (${euro(totaleFattura)}): ` +
        "controlla che il convertitore abbia letto tutte le pagine."
    );
  }

  return {
    ok: true,
    file: {
      fattura: {
        numero: numeroFattura,
        data: dataFattura ?? null,
        periodoDal: periodoDal ?? null,
        periodoAl: periodoAl ?? null,
        totale: totaleFattura ?? null,
      },
      dispositivi: dispositivi?.length ?? 0,
      passaggi,
      totale,
      avvisi,
    },
  };
}
