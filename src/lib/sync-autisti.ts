import { db, ensureSchema } from "@/db";
import { driverLogs, maintenances, vehicles } from "@/db/schema";
import { formattaDataOra } from "@/lib/foglio-google";
import {
  indirizzoFoglioAutisti,
  infoCopiaLocaleAutisti,
  leggiCopiaLocaleAutisti,
  salvaCopiaLocaleAutisti,
  scaricaFoglioAutisti,
} from "@/lib/foglio-autisti";
import { MARCA_REGISTRO, leggiUscitaAutisti, pianoImportazione } from "@/lib/registro-autisti";
import { and, eq, inArray, like } from "drizzle-orm";

export interface SyncAutistiResult {
  success: boolean;
  message: string;
  mezzi: number;
  mezziCreati: number;
  presenze: number;
  manutenzioni: number;
  statiAggiornati: number;
  sostitutive: number;
  /** righe della scheda scartate (data o targa non valide) + targhe della pagina NOLEGGI sconosciute al programma */
  saltate: number;
  source: string;
  online: boolean;
  avviso?: string;
}

function oggiIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Registro autisti → database: diario conducenti (driver_logs), manutenzioni, stato del mezzo e segno «sostitutivo».
 * Le righe scritte dal registro portano il prefisso MARCA_REGISTRO: a ogni sincronizzazione vengono sostituite,
 * quelle scritte a mano nel programma non si toccano.
 */
export async function syncRegistroAutisti(rawText?: string): Promise<SyncAutistiResult> {
  await ensureSchema();
  let source = "File caricato";
  let online = false;
  let avviso: string | undefined;
  let text = rawText;

  if (!text) {
    const url = indirizzoFoglioAutisti();
    if (url) {
      const r = await scaricaFoglioAutisti(url);
      if (r.ok) {
        text = r.testo;
        source = "Foglio Google del registro autisti (online)";
        online = true;
        try {
          salvaCopiaLocaleAutisti(r.testo);
        } catch {
          // la copia è solo una riserva
        }
      } else {
        avviso = `Registro autisti non raggiungibile: ${r.errore}.`;
      }
    }
  }
  if (!text) {
    const copia = leggiCopiaLocaleAutisti();
    if (copia) {
      text = copia;
      const info = infoCopiaLocaleAutisti();
      source = info.aggiornataIl ? `copia del registro salvata nel PC (del ${formattaDataOra(info.aggiornataIl)})` : "copia del registro salvata nel PC";
      if (!avviso && !indirizzoFoglioAutisti()) avviso = "Il registro autisti non è collegato: sono stati usati i dati della copia salvata nel PC.";
    } else if (avviso) {
      throw new Error(`${avviso} Nel PC non c'è ancora una copia del registro.`);
    } else {
      throw new Error("Il registro autisti non è collegato e nel PC non c'è una copia dei dati. Collegalo con «Registro autisti › Collega».");
    }
  }

  const { righe, scartate } = leggiUscitaAutisti(text);
  const piano = pianoImportazione(righe, oggiIso());

  let mezzi = 0;
  let mezziCreati = 0;
  let presenze = 0;
  let totManutenzioni = 0;
  let statiAggiornati = 0;
  let saltate = scartate;
  const sostitutive = new Set<string>();

  for (const p of piano.values()) {
    const esistente = await db.select({ id: vehicles.id, stato: vehicles.stato }).from(vehicles).where(eq(vehicles.targa, p.targa)).limit(1);
    let vehicleId: number;
    if (esistente[0]) {
      vehicleId = esistente[0].id;
    } else if (p.haPagina) {
      const inserito = await db
        .insert(vehicles)
        .values({
          targa: p.targa,
          marca: "Flotta Prime",
          modello: "Furgone Consegne",
          categoria: "furgone",
          tipoAcquisizione: "noleggio",
          carburante: "diesel",
          kmAttuali: 0,
          stato: "attivo",
          note: `${MARCA_REGISTRO} mezzo creato dal registro autisti: completare l'anagrafica`,
        })
        .returning({ id: vehicles.id });
      vehicleId = inserito[0].id;
      mezziCreati++;
    } else {
      // targa vista solo nella pagina NOLEGGI e sconosciuta al programma (es. targa generica): non si inventa un mezzo
      saltate += p.diario.length;
      continue;
    }
    mezzi++;

    // Diario conducenti: via le righe del registro, poi quelle nuove
    await db.delete(driverLogs).where(and(eq(driverLogs.vehicleId, vehicleId), like(driverLogs.note, `${MARCA_REGISTRO}%`)));
    for (const v of p.diario) {
      await db.insert(driverLogs).values({ vehicleId, data: v.data, conducente: v.conducente, note: v.note });
    }
    presenze += p.diario.length;

    // Manutenzioni del registro (senza costo: il costo lo scrive chi fa la contabilità)
    await db.delete(maintenances).where(and(eq(maintenances.vehicleId, vehicleId), like(maintenances.descrizione, `${MARCA_REGISTRO}%`)));
    for (const m of p.manutenzioni) {
      const periodo = m.fineAl ? `dal ${m.data} al ${m.fineAl}` : `dal ${m.data} (in corso)`;
      await db.insert(maintenances).values({
        vehicleId,
        data: m.data,
        tipo: m.tipo,
        descrizione: m.descrizione,
        dettaglioLavori: [periodo, m.dettaglioLavori].filter(Boolean).join(" · "),
      });
    }
    totManutenzioni += p.manutenzioni.length;

    if (p.stato && p.stato !== esistente[0]?.stato) {
      await db.update(vehicles).set({ stato: p.stato }).where(eq(vehicles.id, vehicleId));
      statiAggiornati++;
    }
    p.sostitutive.forEach((t) => sostitutive.add(t));
  }

  // Sostitutivi: solo segno sul mezzo, se esiste nel programma
  if (sostitutive.size) {
    await db.update(vehicles).set({ isReplacement: 1 }).where(inArray(vehicles.targa, [...sostitutive]));
  }

  return {
    success: true,
    message: `Registro autisti sincronizzato: ${mezzi} furgoni, ${presenze} presenze, ${totManutenzioni} manutenzioni, ${statiAggiornati} stati aggiornati${mezziCreati ? `, ${mezziCreati} mezzi nuovi da completare` : ""}${saltate ? ` (${saltate} righe saltate)` : ""}.`,
    mezzi,
    mezziCreati,
    presenze,
    manutenzioni: totManutenzioni,
    statiAggiornati,
    sostitutive: sostitutive.size,
    saltate,
    source,
    online,
    avviso,
  };
}
