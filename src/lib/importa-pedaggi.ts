"use server";

// «Carica JSON» nella sezione Pedaggi: anteprima del file, importazione di tutti i pedaggi
// (con le targhe non in anagrafica da aggiungere o scartare) e annullamento di un'importazione.
// Il file viene ricontrollato da capo anche al momento dell'importazione.

import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { importazioniPedaggi, tolls, vehicles, type ImportazionePedaggi } from "@/db/schema";
import {
  centesimi,
  chiavePassaggio,
  leggiFileTelepass,
  normalizzaTarga,
  type FatturaTelepass,
  type FileTelepass,
  type PassaggioTelepass,
} from "@/lib/telepass-json";

export type MezzoImport = { id: number; targa: string; marca: string; modello: string; venduto: boolean };

/** Passaggi con la targa scritta nel file, raggruppati per targa */
export type GruppoTarga = {
  targa: string;
  vehicleId: number | null; // null = targa non in anagrafica
  mezzo: string | null;
  passaggi: number;
  totale: number;
  giaPresenti: number;
  nuovi: number;
  totaleNuovi: number;
};

/** Passaggi senza targa nel file, raggruppati per dispositivo */
export type GruppoDispositivo = {
  dispositivo: string;
  passaggi: number;
  totale: number;
  giaPresenti: number;
  nuovi: number;
  totaleNuovi: number;
  // targa che di solito usa il dispositivo: prima dal file, poi dai pedaggi già nel programma
  abituale: { targa: string; vehicleId: number | null; fonte: "file" | "archivio" } | null;
};

/** La stessa fattura è già stata importata (dati dell'ultima volta) */
export type FatturaGiaImportata = { il: string; volte: number; pedaggi: number; fileNome: string | null };

export type AnteprimaPedaggi =
  | { ok: false; errori: string[] }
  | {
      ok: true;
      fattura: FatturaTelepass;
      giaImportata: FatturaGiaImportata | null;
      dispositivi: number;
      passaggi: number;
      totale: number;
      avvisi: string[];
      conTarga: GruppoTarga[];
      senzaTarga: GruppoDispositivo[];
      giaPresenti: number;
      mezzi: MezzoImport[];
    };

/** Cosa fare con una targa del file che non è in anagrafica */
export type DecisioneTarga =
  | { azione: "aggiungi"; marca?: string; modello?: string; categoria?: string }
  | { azione: "scarta" };

/** Mezzo per i passaggi senza targa di un dispositivo: id del mezzo, una targa nuova del file, null = non importare */
export type Assegnazione = number | { targaNuova: string } | null;

export type SceltaImportazione = {
  assegnazioni: Record<string, Assegnazione>;
  targheNuove: Record<string, DecisioneTarga>;
  /** la fattura era già stata importata: si aggiungono solo i passaggi che mancano */
  confermaFatturaGiaImportata?: boolean;
};

export type EsitoImportazione =
  | { ok: false; errori: string[] }
  | {
      ok: true;
      importati: number;
      totale: number;
      giaPresenti: number;
      scartati: number;
      targheAggiunte: string[];
      mese: string; // "2026-11" oppure "tutti"
    };

const CATEGORIE = new Set(["auto", "furgone", "camion", "altro"]);
const pulisci = (x: unknown, max: number) => (typeof x === "string" ? x.trim().replace(/\s+/g, " ").slice(0, max) : "");

type Analisi = {
  file: FileTelepass;
  mezzi: MezzoImport[];
  mezzoPerTarga: Map<string, MezzoImport>;
  presenti: Set<string>;
  abituali: Map<string, GruppoDispositivo["abituale"]>;
  precedenti: ImportazionePedaggi[]; // importazioni già fatte della stessa fattura (la più recente prima)
};

function piuFrequente(conteggi: Map<string, number>): string | null {
  let migliore: string | null = null;
  for (const [k, n] of conteggi) {
    if (migliore === null || n > conteggi.get(migliore)! || (n === conteggi.get(migliore)! && k < migliore)) migliore = k;
  }
  return migliore;
}

async function analizza(contenuto: string): Promise<{ ok: false; errori: string[] } | { ok: true; a: Analisi }> {
  const lettura = leggiFileTelepass(contenuto);
  if (!lettura.ok) return lettura;
  const file = lettura.file;

  const mezzi: MezzoImport[] = (await db.select().from(vehicles)).map((v) => ({
    id: v.id,
    targa: v.targa,
    marca: v.marca,
    modello: v.modello,
    venduto: v.stato === "venduto",
  }));
  const mezzoPerTarga = new Map(mezzi.map((m) => [normalizzaTarga(m.targa), m]));
  const mezzoPerId = new Map(mezzi.map((m) => [m.id, m]));

  // Pedaggi già nel programma per gli stessi dispositivi e lo stesso periodo
  const codici = [...new Set(file.passaggi.map((p) => p.dispositivo))];
  const date = file.passaggi.map((p) => p.dataUscita).sort();
  const esistenti =
    codici.length > 0 && date.length > 0
      ? await db
          .select()
          .from(tolls)
          .where(and(inArray(tolls.dispositivo, codici), gte(tolls.dataUscita, date[0]), lte(tolls.dataUscita, date[date.length - 1])))
      : [];
  const presenti = new Set(
    esistenti.map((t) =>
      chiavePassaggio({
        dispositivo: t.dispositivo,
        dataUscita: t.dataUscita,
        oraUscita: t.oraUscita,
        stazioneUscita: t.stazioneUscita,
        servizio: t.servizio,
        importo: t.importo,
      })
    )
  );

  // Targa abituale di ogni dispositivo: la più frequente nel file; se nel file non c'è mai,
  // quella più frequente nei pedaggi già registrati (solo quelli con la targa vera)
  const abituali = new Map<string, GruppoDispositivo["abituale"]>();
  const storico =
    codici.length > 0
      ? await db
          .select({ dispositivo: tolls.dispositivo, vehicleId: tolls.vehicleId, n: count() })
          .from(tolls)
          .where(and(inArray(tolls.dispositivo, codici), eq(tolls.targaDalDispositivo, false)))
          .groupBy(tolls.dispositivo, tolls.vehicleId)
      : [];
  for (const codice of codici) {
    const nelFile = new Map<string, number>();
    for (const p of file.passaggi) {
      if (p.dispositivo === codice && p.targa) nelFile.set(p.targa, (nelFile.get(p.targa) ?? 0) + 1);
    }
    const targa = piuFrequente(nelFile);
    if (targa) {
      abituali.set(codice, { targa, vehicleId: mezzoPerTarga.get(targa)?.id ?? null, fonte: "file" });
      continue;
    }
    const nelloStorico = new Map<string, number>();
    for (const s of storico) {
      if (s.dispositivo === codice && mezzoPerId.has(s.vehicleId)) nelloStorico.set(String(s.vehicleId), s.n);
    }
    const id = piuFrequente(nelloStorico);
    const mezzo = id ? mezzoPerId.get(Number(id)) : undefined;
    abituali.set(codice, mezzo ? { targa: mezzo.targa, vehicleId: mezzo.id, fonte: "archivio" } : null);
  }

  const precedenti = await db
    .select()
    .from(importazioniPedaggi)
    .where(eq(importazioniPedaggi.fatturaNumero, file.fattura.numero))
    .orderBy(desc(importazioniPedaggi.id));

  return { ok: true, a: { file, mezzi, mezzoPerTarga, presenti, abituali, precedenti } };
}

const giaPresente = (a: Analisi, p: PassaggioTelepass) => a.presenti.has(chiavePassaggio(p));

/** Primo passo: legge il file e prepara l'anteprima (non salva niente) */
export async function analizzaJsonPedaggi(contenuto: string): Promise<AnteprimaPedaggi> {
  const r = await analizza(contenuto);
  if (!r.ok) return r;
  const { a } = r;

  const conTarga = new Map<string, GruppoTarga>();
  const senzaTarga = new Map<string, GruppoDispositivo>();
  let presentiTot = 0;
  for (const p of a.file.passaggi) {
    const presente = giaPresente(a, p);
    if (presente) presentiTot++;
    let g: GruppoTarga | GruppoDispositivo;
    if (p.targa) {
      let gt = conTarga.get(p.targa);
      if (!gt) {
        const m = a.mezzoPerTarga.get(p.targa);
        gt = {
          targa: p.targa,
          vehicleId: m?.id ?? null,
          mezzo: m ? `${m.marca} ${m.modello}` : null,
          passaggi: 0,
          totale: 0,
          giaPresenti: 0,
          nuovi: 0,
          totaleNuovi: 0,
        };
        conTarga.set(p.targa, gt);
      }
      g = gt;
    } else {
      let gd = senzaTarga.get(p.dispositivo);
      if (!gd) {
        gd = {
          dispositivo: p.dispositivo,
          passaggi: 0,
          totale: 0,
          giaPresenti: 0,
          nuovi: 0,
          totaleNuovi: 0,
          abituale: a.abituali.get(p.dispositivo) ?? null,
        };
        senzaTarga.set(p.dispositivo, gd);
      }
      g = gd;
    }
    g.passaggi++;
    g.totale = centesimi(g.totale + p.importo);
    if (presente) g.giaPresenti++;
    else {
      g.nuovi++;
      g.totaleNuovi = centesimi(g.totaleNuovi + p.importo);
    }
  }

  return {
    ok: true,
    fattura: a.file.fattura,
    giaImportata: a.precedenti.length
      ? {
          il: a.precedenti[0].createdAt ?? "",
          volte: a.precedenti.length,
          pedaggi: a.precedenti.reduce((n, x) => n + x.passaggi, 0),
          fileNome: a.precedenti[0].fileNome,
        }
      : null,
    dispositivi: a.file.dispositivi,
    passaggi: a.file.passaggi.length,
    totale: a.file.totale,
    avvisi: a.file.avvisi,
    conTarga: [...conTarga.values()].sort((x, y) => (x.targa < y.targa ? -1 : 1)),
    senzaTarga: [...senzaTarga.values()].sort((x, y) => y.passaggi - x.passaggi),
    giaPresenti: presentiTot,
    mezzi: a.mezzi.sort((x, y) => (normalizzaTarga(x.targa) < normalizzaTarga(y.targa) ? -1 : 1)),
  };
}

/**
 * Secondo passo: importa i pedaggi.
 * - `targheNuove`: per ogni targa del file non in anagrafica, «aggiungi» (nuovo mezzo) o «scarta» (obbligatorio);
 * - `assegnazioni`: per ogni dispositivo con passaggi senza targa, il mezzo scelto (null = non importare);
 * - fattura già importata: serve `confermaFatturaGiaImportata` e si aggiungono solo i passaggi mancanti.
 * I passaggi già presenti nel programma non vengono mai importati di nuovo.
 * Mezzi nuovi, importazione e pedaggi si salvano tutti insieme: se qualcosa va storto non si salva niente.
 */
export async function importaJsonPedaggi(
  contenuto: string,
  nomeFile: string,
  scelta: SceltaImportazione
): Promise<EsitoImportazione> {
  const r = await analizza(contenuto);
  if (!r.ok) return r;
  const { a } = r;
  const assegnazioni = scelta?.assegnazioni ?? {};
  const decisioni = scelta?.targheNuove ?? {};
  const numero = a.file.fattura.numero;

  if (a.precedenti.length > 0 && scelta?.confermaFatturaGiaImportata !== true) {
    return {
      ok: false,
      errori: [`La fattura n. ${numero} è già stata importata: conferma per aggiungere solo i passaggi che mancano.`],
    };
  }

  // Targhe del file non in anagrafica (con passaggi nuovi): per ognuna serve una decisione
  const targheNuove = new Set<string>();
  for (const p of a.file.passaggi) {
    if (p.targa && !a.mezzoPerTarga.has(p.targa) && !giaPresente(a, p)) targheNuove.add(p.targa);
  }
  const senzaDecisione = [...targheNuove].filter((t) => !["aggiungi", "scarta"].includes(decisioni[t]?.azione)).sort();
  if (senzaDecisione.length > 0) {
    return {
      ok: false,
      errori: [
        `Decidi cosa fare con ${senzaDecisione.length === 1 ? "la targa" : "le targhe"} ${senzaDecisione.join(", ")}: aggiungere in anagrafica o scartare i pedaggi.`,
      ],
    };
  }
  const daAggiungere = [...targheNuove].filter((t) => decisioni[t].azione === "aggiungi").sort();
  const aggiunte = new Set(daAggiungere);

  for (const [disp, x] of Object.entries(assegnazioni)) {
    if (x !== null && typeof x === "object" && !aggiunte.has(normalizzaTarga(String(x.targaNuova ?? "")))) {
      return {
        ok: false,
        errori: [`La targa scelta per il dispositivo ${disp.split("/")[0]} non è tra quelle da aggiungere in anagrafica.`],
      };
    }
  }

  const idValidi = new Set(a.mezzi.map((m) => m.id));
  // id del mezzo aggiunto in questa stessa importazione
  const idDellaTarga = (targa: string) => sql`(SELECT id FROM vehicles WHERE targa = ${targa})`;

  type Riga = Omit<typeof tolls.$inferInsert, "vehicleId"> & { vehicleId: number | SQL };
  const righe: Riga[] = [];
  let presenti = 0;
  let scartati = 0;
  for (const p of a.file.passaggi) {
    if (giaPresente(a, p)) {
      presenti++;
      continue;
    }
    let vehicleId: number | SQL;
    if (p.targa) {
      const m = a.mezzoPerTarga.get(p.targa);
      if (m) vehicleId = m.id;
      else if (aggiunte.has(p.targa)) vehicleId = idDellaTarga(p.targa);
      else {
        scartati++;
        continue;
      }
    } else {
      const x = assegnazioni[p.dispositivo];
      if (typeof x === "number" && idValidi.has(x)) vehicleId = x;
      else if (x !== null && typeof x === "object") vehicleId = idDellaTarga(normalizzaTarga(String(x.targaNuova)));
      else {
        scartati++;
        continue;
      }
    }
    righe.push({
      vehicleId,
      dispositivo: p.dispositivo,
      idPrenotazione: p.idPrenotazione,
      dataEntrata: p.dataEntrata,
      oraEntrata: p.oraEntrata,
      stazioneEntrata: p.stazioneEntrata,
      dataUscita: p.dataUscita,
      oraUscita: p.oraUscita,
      stazioneUscita: p.stazioneUscita,
      classe: p.classe,
      servizio: p.servizio,
      importo: p.importo.toFixed(2),
      targaDalDispositivo: !p.targa,
    });
  }

  if (righe.length === 0) {
    return {
      ok: false,
      errori: [
        presenti === a.file.passaggi.length
          ? "Tutti i passaggi di questo file sono già nel programma: non c'è niente da importare."
          : "Non c'è nessun pedaggio da importare con le scelte fatte.",
      ],
    };
  }

  const totale = centesimi(righe.reduce((s, x) => s + Number(x.importo), 0));
  const nuoviMezzi = daAggiungere.map((targa) => {
    const d = decisioni[targa] as Extract<DecisioneTarga, { azione: "aggiungi" }>;
    const categoria = pulisci(d.categoria, 20);
    return db.insert(vehicles).values({
      targa,
      marca: pulisci(d.marca, 60) || "Da completare",
      modello: pulisci(d.modello, 80) || "(aggiunto da Telepass)",
      categoria: CATEGORIE.has(categoria) ? categoria : "furgone",
      hasTelepass: 1,
      stato: "attivo",
      note: `Aggiunto dall'importazione dei pedaggi Telepass (fattura n. ${numero}): completare i dati.`,
    });
  });
  // I pedaggi puntano all'importazione appena registrata (l'ultima della tabella)
  const questaImportazione = sql`(SELECT max(id) FROM importazioni_pedaggi)`;
  const inserimenti = [];
  for (let i = 0; i < righe.length; i += 200) {
    inserimenti.push(
      db.insert(tolls).values(righe.slice(i, i + 200).map((x) => ({ ...x, importazioneId: questaImportazione })))
    );
  }
  await db.batch([
    db.insert(importazioniPedaggi).values({
      fatturaNumero: numero,
      fatturaData: a.file.fattura.data,
      periodoDal: a.file.fattura.periodoDal,
      periodoAl: a.file.fattura.periodoAl,
      fileNome: nomeFile.split(/[\\/]/).pop()?.slice(0, 200) || null,
      passaggi: righe.length,
      totale: totale.toFixed(2),
    }),
    ...nuoviMezzi,
    ...inserimenti,
  ]);

  const mesi = [...new Set(righe.map((x) => x.dataUscita.slice(0, 7)))];
  revalidatePath("/", "layout");
  return {
    ok: true,
    importati: righe.length,
    totale,
    giaPresenti: presenti,
    scartati,
    targheAggiunte: daAggiungere,
    mese: mesi.length === 1 ? mesi[0] : "tutti",
  };
}

/**
 * Annulla un'importazione: elimina tutti i pedaggi caricati con quell'importazione
 * (i mezzi aggiunti in anagrafica restano). I pedaggi inseriti a mano non vengono toccati.
 */
export async function annullaImportazionePedaggi(
  id: number
): Promise<{ ok: true; eliminati: number } | { ok: false; errore: string }> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, errore: "Importazione non valida." };
  const [imp] = await db.select().from(importazioniPedaggi).where(eq(importazioniPedaggi.id, id)).limit(1);
  if (!imp) return { ok: false, errore: "Questa importazione non c'è più." };
  const [{ n }] = await db.select({ n: count() }).from(tolls).where(eq(tolls.importazioneId, id));
  await db.batch([
    db.delete(tolls).where(eq(tolls.importazioneId, id)),
    db.delete(importazioniPedaggi).where(eq(importazioniPedaggi.id, id)),
  ]);
  revalidatePath("/", "layout");
  return { ok: true, eliminati: n };
}
