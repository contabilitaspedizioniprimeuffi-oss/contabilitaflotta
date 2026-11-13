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
import type { BatchItem } from "drizzle-orm/batch";

type Manutenzione = typeof maintenances.$inferSelect;

/** Una manutenzione del registro che qualcuno ha completato nel programma (costo, officina, km, scadenze) */
const completataAMano = (m: Manutenzione) => !!(m.costo || m.officina || m.km || m.prossimoKm || m.prossimaData);
const RE_PERIODO = /^dal \d{4}-\d{2}-\d{2}(?: al \d{4}-\d{2}-\d{2}| \(in corso\))/;

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

    // Tutto quello che riguarda questo furgone si salva in un solo blocco: più veloce e mai a metà
    const operazioni: BatchItem<"sqlite">[] = [];

    // Diario conducenti: le righe del registro si rifanno da capo (nel programma non si modificano)
    operazioni.push(db.delete(driverLogs).where(and(eq(driverLogs.vehicleId, vehicleId), like(driverLogs.note, `${MARCA_REGISTRO}%`))));
    for (let i = 0; i < p.diario.length; i += 200) {
      operazioni.push(
        db.insert(driverLogs).values(p.diario.slice(i, i + 200).map((v) => ({ vehicleId, data: v.data, conducente: v.conducente, note: v.note })))
      );
    }
    presenze += p.diario.length;

    // Manutenzioni del registro (senza costo: il costo lo scrive chi fa la contabilità). Si aggiornano senza
    // cancellarle, così costo, officina, km e scadenze scritti nel programma restano. Una manutenzione che
    // non c'è più nel registro si toglie solo se nessuno l'ha completata a mano.
    const esistenti = await db
      .select()
      .from(maintenances)
      .where(and(eq(maintenances.vehicleId, vehicleId), like(maintenances.descrizione, `${MARCA_REGISTRO}%`)));
    const perChiave = new Map<string, Manutenzione[]>();
    for (const e of esistenti) {
      const k = `${e.data}|${e.descrizione}`;
      perChiave.set(k, [...(perChiave.get(k) ?? []), e]);
    }
    for (const m of p.manutenzioni) {
      const periodo = m.fineAl ? `dal ${m.data} al ${m.fineAl}` : `dal ${m.data} (in corso)`;
      const dettaglioLavori = [periodo, m.dettaglioLavori].filter(Boolean).join(" · ");
      const giaCe = perChiave.get(`${m.data}|${m.descrizione}`)?.shift();
      if (!giaCe) {
        operazioni.push(db.insert(maintenances).values({ vehicleId, data: m.data, tipo: m.tipo, descrizione: m.descrizione, dettaglioLavori }));
      } else if (completataAMano(giaCe)) {
        // completata a mano: si aggiorna solo il periodo «dal … al …», il resto lo ha scritto qualcuno
        const vecchio = giaCe.dettaglioLavori ?? "";
        const nuovo = RE_PERIODO.test(vecchio) ? vecchio.replace(RE_PERIODO, periodo) : [periodo, vecchio].filter(Boolean).join(" · ");
        if (nuovo !== vecchio) operazioni.push(db.update(maintenances).set({ dettaglioLavori: nuovo }).where(eq(maintenances.id, giaCe.id)));
      } else if (giaCe.tipo !== m.tipo || giaCe.dettaglioLavori !== dettaglioLavori) {
        operazioni.push(db.update(maintenances).set({ tipo: m.tipo, dettaglioLavori }).where(eq(maintenances.id, giaCe.id)));
      }
    }
    for (const resto of perChiave.values()) {
      for (const e of resto) if (!completataAMano(e)) operazioni.push(db.delete(maintenances).where(eq(maintenances.id, e.id)));
    }
    totManutenzioni += p.manutenzioni.length;

    if (p.stato && p.stato !== esistente[0]?.stato) {
      operazioni.push(db.update(vehicles).set({ stato: p.stato }).where(eq(vehicles.id, vehicleId)));
      statiAggiornati++;
    }
    const [prima, ...altre] = operazioni;
    await db.batch([prima, ...altre]);
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
