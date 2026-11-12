/**
 * Registro autisti: lettura della scheda USCITA_AUTISTI del Foglio Google «registro presenze autisti».
 *
 * Il Foglio è compilato a mano dal magazzino (una pagina per furgone) e produce da solo una scheda piatta,
 * USCITA_AUTISTI, con una riga per evento:
 *   TIPO (PRESENZA | STATO) · DATA (AAAA-MM-GG) · TARGA · AUTISTA_1 · AUTISTA_2 · STATO · CAUSALE ·
 *   TARGA_SOSTITUTIVA · NOTE · ORIGINE (PAGINA | NOLEGGI | STATI MEZZI)
 * - PRESENZA: chi ha guidato quel furgone quel giorno (con lo stato scritto in quella riga, se c'è).
 * - STATO: cambio di stato del furgone (IN SERVIZIO, FERMO, NOLEGGIO, MANUTENZIONE, VENDUTO, ROTTAMATO, ALTRO);
 *   con MANUTENZIONE c'è la CAUSALE (FRENI, BATTERIA, AMMORTIZZATORI, TAGLIANDO, FRIZIONE, MOTORE, GOMME) e, se c'è,
 *   la TARGA_SOSTITUTIVA. Uno stato vale fino al cambio successivo della stessa targa.
 *
 * Questo file non tocca il database: dal testo ricava un «piano» per targa (diario autisti, manutenzioni, stato
 * corrente, targhe sostitutive) che sync-autisti.ts scrive nel database. È puro, quindi provato con node:test.
 */

export const SCHEDA_USCITA = "USCITA_AUTISTI";

/** Prefisso che marca le righe scritte dal registro (per aggiornarle senza toccare quelle scritte a mano). */
export const MARCA_REGISTRO = "[Registro autisti]";

export const INTESTAZIONE_USCITA = [
  "TIPO",
  "DATA",
  "TARGA",
  "AUTISTA_1",
  "AUTISTA_2",
  "STATO",
  "CAUSALE",
  "TARGA_SOSTITUTIVA",
  "NOTE",
  "ORIGINE",
] as const;

export interface RigaUscita {
  tipo: "PRESENZA" | "STATO";
  data: string;
  targa: string;
  autista1: string;
  autista2: string;
  stato: string;
  causale: string;
  targaSostitutiva: string;
  note: string;
  origine: string;
}

const RE_TARGA = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function pulisciTarga(t: string | null | undefined): string {
  return String(t ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-.]/g, "");
}

/** Le righe (senza l'intestazione «--- NOME ---») di una sola scheda del testo dell'antenna; null se manca. */
export function estraiScheda(testo: string, nome: string = SCHEDA_USCITA): string[] | null {
  const righe = testo.split("\n").map((r) => r.replace(/\r$/, ""));
  let dentro = false;
  const out: string[] = [];
  for (const riga of righe) {
    const m = riga.trim().match(/^---\s+(.+?)\s+---$/);
    if (m) {
      if (dentro) break;
      dentro = m[1].trim() === nome;
      continue;
    }
    if (dentro) out.push(riga);
  }
  return dentro ? out : null;
}

/**
 * Righe valide della scheda USCITA_AUTISTI. Le colonne si riconoscono dall'intestazione (non dalla posizione):
 * se un giorno il Foglio aggiunge una colonna in mezzo, il programma continua a leggere. Scartate = righe con
 * TIPO sconosciuto, data non AAAA-MM-GG o targa non valida.
 */
export function leggiUscitaAutisti(testo: string): { righe: RigaUscita[]; scartate: number } {
  const scheda = estraiScheda(testo);
  if (!scheda) throw new Error(`nel testo non c'è la scheda ${SCHEDA_USCITA} (è il Foglio del registro autisti?)`);
  const righe: RigaUscita[] = [];
  let scartate = 0;
  let colonne: Record<string, number> | null = null;
  for (const riga of scheda) {
    if (!riga.trim()) continue;
    const celle = riga.split("\t").map((c) => c.trim());
    if (!colonne) {
      const idx: Record<string, number> = {};
      celle.forEach((c, i) => {
        idx[c.toUpperCase()] = i;
      });
      const mancanti = INTESTAZIONE_USCITA.filter((k) => !(k in idx));
      if (mancanti.length) throw new Error(`scheda ${SCHEDA_USCITA}: mancano le colonne ${mancanti.join(", ")}`);
      colonne = idx;
      continue;
    }
    const v = (k: (typeof INTESTAZIONE_USCITA)[number]) => celle[colonne![k]] ?? "";
    const tipo = v("TIPO").toUpperCase();
    const data = v("DATA");
    const targa = pulisciTarga(v("TARGA"));
    if ((tipo !== "PRESENZA" && tipo !== "STATO") || !RE_DATA.test(data) || !RE_TARGA.test(targa)) {
      scartate++;
      continue;
    }
    righe.push({
      tipo,
      data,
      targa,
      autista1: v("AUTISTA_1"),
      autista2: v("AUTISTA_2"),
      stato: v("STATO").toUpperCase(),
      causale: v("CAUSALE").toUpperCase(),
      targaSostitutiva: pulisciTarga(v("TARGA_SOSTITUTIVA")),
      note: v("NOTE"),
      origine: v("ORIGINE").toUpperCase(),
    });
  }
  if (!colonne) throw new Error(`scheda ${SCHEDA_USCITA} vuota: manca la riga di intestazione`);
  return { righe, scartate };
}

/** Tipo di manutenzione del programma (tendina «Tipo intervento») a partire dalla causale del registro. */
export function tipoManutenzione(causale: string): string {
  switch (causale.trim().toUpperCase()) {
    case "FRENI":
      return "freni";
    case "GOMME":
      return "gomme";
    case "TAGLIANDO":
      return "tagliando";
    case "BATTERIA":
    case "AMMORTIZZATORI":
    case "FRIZIONE":
    case "MOTORE":
      return "riparazione";
    default:
      return "altro";
  }
}

/** Stato del mezzo nel programma (attivo | in_manutenzione | fermo | venduto) a partire dallo stato del registro. */
export function statoMezzo(stato: string): string {
  switch (stato.trim().toUpperCase()) {
    case "MANUTENZIONE":
      return "in_manutenzione";
    case "FERMO":
      return "fermo";
    case "VENDUTO":
    case "ROTTAMATO":
      return "venduto";
    default:
      return "attivo"; // IN SERVIZIO, NOLEGGIO, ALTRO, vuoto
  }
}

export interface VoceDiario {
  data: string;
  conducente: string;
  note: string;
}

export interface VoceManutenzione {
  data: string;
  tipo: string;
  descrizione: string;
  dettaglioLavori: string;
  /** primo giorno con uno stato diverso (null = ancora in corso) */
  fineAl: string | null;
}

export interface PianoTarga {
  targa: string;
  /** true se la targa ha una pagina nel registro (righe PAGINA o STATO): si può creare nel programma se manca */
  haPagina: boolean;
  diario: VoceDiario[];
  manutenzioni: VoceManutenzione[];
  /** stato del programma in vigore a `oggi`, null se il registro non ne riporta uno */
  stato: string | null;
  statoDal: string | null;
  /** targhe usate come sostitutive mentre questa era in manutenzione o ferma */
  sostitutive: string[];
}

function descriviStato(r: { stato: string; causale: string; targaSostitutiva: string }): string {
  const parti = [r.stato];
  if (r.causale) parti.push(r.causale);
  if (r.targaSostitutiva) parti.push(`sostitutiva ${r.targaSostitutiva}`);
  return parti.join(" · ");
}

function conMarca(...parti: (string | null | undefined)[]): string {
  const testo = parti.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");
  return testo ? `${MARCA_REGISTRO} ${testo}` : MARCA_REGISTRO;
}

/**
 * Dalle righe della scheda al piano per targa. `oggi` (AAAA-MM-GG) serve per lo stato corrente: le righe STATO
 * future non contano. Ordine: per data, poi per ordine di arrivo (a pari data vince l'ultima).
 */
export function pianoImportazione(righe: RigaUscita[], oggi: string): Map<string, PianoTarga> {
  const piano = new Map<string, PianoTarga>();
  const prendi = (targa: string) => {
    let p = piano.get(targa);
    if (!p) {
      p = { targa, haPagina: false, diario: [], manutenzioni: [], stato: null, statoDal: null, sostitutive: [] };
      piano.set(targa, p);
    }
    return p;
  };
  const ordinate = righe.map((r, i) => ({ r, i })).sort((a, b) => (a.r.data < b.r.data ? -1 : a.r.data > b.r.data ? 1 : a.i - b.i));

  for (const { r } of ordinate) {
    const p = prendi(r.targa);
    if (r.origine !== "NOLEGGI") p.haPagina = true;
    if (r.tipo === "PRESENZA") {
      const nota = conMarca(r.stato ? descriviStato(r) : "", r.note, r.origine === "NOLEGGI" ? "pagina NOLEGGI" : "");
      for (const a of [r.autista1, r.autista2]) {
        if (a.trim()) p.diario.push({ data: r.data, conducente: a.trim(), note: nota });
      }
      if (r.targaSostitutiva && !p.sostitutive.includes(r.targaSostitutiva)) p.sostitutive.push(r.targaSostitutiva);
    } else {
      // STATO: chiude l'eventuale manutenzione aperta e, se è una manutenzione, ne apre una nuova
      const aperta = p.manutenzioni.find((m) => m.fineAl === null);
      if (aperta && (r.stato !== "MANUTENZIONE" || aperta.data !== r.data)) aperta.fineAl = r.data;
      if (r.stato === "MANUTENZIONE") {
        p.manutenzioni.push({
          data: r.data,
          tipo: tipoManutenzione(r.causale),
          descrizione: conMarca(`Manutenzione${r.causale ? ` · ${r.causale}` : ""}`),
          dettaglioLavori: [r.targaSostitutiva ? `sostitutiva ${r.targaSostitutiva}` : "", r.note].filter(Boolean).join(" · "),
          fineAl: null,
        });
      }
      if (r.targaSostitutiva && !p.sostitutive.includes(r.targaSostitutiva)) p.sostitutive.push(r.targaSostitutiva);
      if (r.data <= oggi) {
        p.stato = statoMezzo(r.stato);
        p.statoDal = r.data;
      }
    }
  }
  // una manutenzione aperta alla stessa data del cambio successivo (stesso giorno) resta chiusa quel giorno
  return piano;
}
