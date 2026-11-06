"use server";

// «Carica JSON» nella sezione Pedaggi: anteprima del file e importazione di tutti i pedaggi.
// Il file viene ricontrollato da capo anche al momento dell'importazione.

import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { importazioniPedaggi, tolls, vehicles } from "@/db/schema";
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

export type AnteprimaPedaggi =
  | { ok: false; errori: string[] }
  | {
      ok: true;
      fattura: FatturaTelepass;
      dispositivi: number;
      passaggi: number;
      totale: number;
      avvisi: string[];
      conTarga: GruppoTarga[];
      senzaTarga: GruppoDispositivo[];
      giaPresenti: number;
      mezzi: MezzoImport[];
    };

export type EsitoImportazione =
  | { ok: false; errori: string[] }
  | {
      ok: true;
      importati: number;
      totale: number;
      giaPresenti: number;
      nonInAnagrafica: number;
      scartati: number;
      mese: string; // "2026-11" oppure "tutti"
    };

type Analisi = {
  file: FileTelepass;
  mezzi: MezzoImport[];
  mezzoPerTarga: Map<string, MezzoImport>;
  presenti: Set<string>;
  abituali: Map<string, GruppoDispositivo["abituale"]>;
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

  return { ok: true, a: { file, mezzi, mezzoPerTarga, presenti, abituali } };
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
 * `assegnazioni`: per ogni dispositivo con passaggi senza targa, il mezzo scelto (null = scarta).
 * Non si importano: i passaggi già presenti, quelli con targa non in anagrafica, quelli scartati.
 */
export async function importaJsonPedaggi(
  contenuto: string,
  nomeFile: string,
  assegnazioni: Record<string, number | null>
): Promise<EsitoImportazione> {
  const r = await analizza(contenuto);
  if (!r.ok) return r;
  const { a } = r;
  const idValidi = new Set(a.mezzi.map((m) => m.id));

  const righe: (typeof tolls.$inferInsert)[] = [];
  let presenti = 0;
  let nonInAnagrafica = 0;
  let scartati = 0;
  for (const p of a.file.passaggi) {
    if (giaPresente(a, p)) {
      presenti++;
      continue;
    }
    let vehicleId: number | undefined;
    if (p.targa) {
      vehicleId = a.mezzoPerTarga.get(p.targa)?.id;
      if (vehicleId === undefined) {
        nonInAnagrafica++;
        continue;
      }
    } else {
      const scelto = assegnazioni[p.dispositivo];
      if (typeof scelto !== "number" || !idValidi.has(scelto)) {
        scartati++;
        continue;
      }
      vehicleId = scelto;
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
  // Tutto insieme: se qualcosa va storto non viene salvato niente.
  // I pedaggi puntano all'importazione appena registrata (l'ultima della tabella).
  const questaImportazione = sql`(SELECT max(id) FROM importazioni_pedaggi)`;
  const inserimenti = [];
  for (let i = 0; i < righe.length; i += 200) {
    inserimenti.push(
      db.insert(tolls).values(righe.slice(i, i + 200).map((x) => ({ ...x, importazioneId: questaImportazione })))
    );
  }
  await db.batch([
    db.insert(importazioniPedaggi).values({
      fatturaNumero: a.file.fattura.numero,
      fatturaData: a.file.fattura.data,
      periodoDal: a.file.fattura.periodoDal,
      periodoAl: a.file.fattura.periodoAl,
      fileNome: nomeFile.split(/[\\/]/).pop()?.slice(0, 200) || null,
      passaggi: righe.length,
      totale: totale.toFixed(2),
    }),
    ...inserimenti,
  ]);

  const mesi = [...new Set(righe.map((x) => x.dataUscita.slice(0, 7)))];
  revalidatePath("/", "layout");
  return {
    ok: true,
    importati: righe.length,
    totale,
    giaPresenti: presenti,
    nonInAnagrafica,
    scartati,
    mese: mesi.length === 1 ? mesi[0] : "tutti",
  };
}
