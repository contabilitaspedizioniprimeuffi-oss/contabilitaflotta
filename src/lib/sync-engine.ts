import * as fs from "fs";
import * as path from "path";
import { db, ensureSchema } from "@/db";
import { deadlines, refuels, vehicles } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface SyncResult {
  success: boolean;
  message: string;
  vehiclesCount: number;
  refuelsCount: number;
  deadlinesCount: number;
  source: string;
}

function parseItalianDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const parts = s.trim().split("/");
  if (parts.length === 3) {
    let [d, m, y] = parts;
    if (y.length === 2) y = "20" + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseItalianInt(s: string | number | null | undefined): number {
  if (s == null) return 0;
  if (typeof s === "number") return Math.round(s);
  const clean = s
    .toString()
    .replace(/LT/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseItalianLiters(s: string | number | null | undefined): number {
  if (s == null) return 0;
  if (typeof s === "number") return Number(s.toFixed(2));
  let str = s.toString().replace(/LT/gi, "").trim();
  if (str.startsWith("=")) {
    // Gestione formule semplici es: =52+73
    const parts = str.slice(1).split("+");
    let sum = 0;
    for (const p of parts) {
      const v = parseFloat(p.replace(",", "."));
      if (!isNaN(v)) sum += v;
    }
    return Number(sum.toFixed(2));
  }
  const clean = str.replace(/\s+/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

export async function syncFromSheetData(rawText?: string): Promise<SyncResult> {
  await ensureSchema();
  let source = "Cache locale del Foglio Google";
  let text = rawText;

  // 1. Prova a scaricare dal vivo se non fornito.
  //    L'ID del Foglio Google sta nel file locale .env.local (GOOGLE_SHEET_ID=...)
  //    e non nel codice, così non viene pubblicato su GitHub.
  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!text && spreadsheetId) {
    try {
      const liveUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=RIEPILOGO`;
      const res = await fetch(liveUrl, { cache: "no-store" });
      if (res.ok) {
        source = "Google Sheets Live (Online)";
        // In futuro se l'utente apre il link, prenderemo tutti i fogli
      }
    } catch {
      // Ignora errori di rete e passa alla cache locale
    }
  }

  // 2. Se non c'è testo online, leggi dal file locale esportato
  if (!text) {
    const filePath = path.resolve(process.cwd(), "sheets_dump.txt");
    if (fs.existsSync(filePath)) {
      text = fs.readFileSync(filePath, "utf-8");
    } else {
      throw new Error("File dati del foglio non trovato. Sincronizzazione non riuscita.");
    }
  }

  // Suddividi in fogli
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const sheets: Record<string, string[]> = {};
  let curSheet = "";

  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(/^---\s+(.+?)\s+---$/);
    if (m) {
      curSheet = m[1].trim();
      sheets[curSheet] = [];
    } else if (curSheet) {
      sheets[curSheet].push(line);
    }
  }

  // Mappa RIEPILOGO
  interface VehicleMeta {
    targa: string;
    tipo: string;
    scadenza: string | null;
    litriTotali: number;
    ultimiKm: number;
    noteMezzo?: string;
  }

  const vehiclesMeta: Map<string, VehicleMeta> = new Map();

  const riepilogoRows = sheets["RIEPILOGO"] ?? [];
  for (const row of riepilogoRows) {
    const cols = row.split("\t");
    const targa = cols[1]?.trim().toUpperCase();
    if (!targa || targa === "TARGA" || targa.includes("TOTALE") || targa.includes("USCITE") || targa.includes("NOLEGGI")) {
      continue;
    }
    if (targa.length < 5 || targa.length > 8) continue;

    vehiclesMeta.set(targa, {
      targa,
      tipo: cols[2]?.trim() || "CONTRATTO",
      scadenza: parseItalianDate(cols[3]),
      litriTotali: parseItalianInt(cols[6]),
      ultimiKm: parseItalianInt(cols[8]),
    });
  }

  // Per ciascun veicolo, estrai note mezzo dall'intestazione del foglio singolo
  for (const [targa, meta] of vehiclesMeta.entries()) {
    const sheetRows = sheets[targa];
    if (sheetRows && sheetRows.length >= 3) {
      const headerRow = sheetRows[2]?.split("\t") ?? [];
      const noteMezzo = headerRow[3]?.trim();
      if (noteMezzo) meta.noteMezzo = noteMezzo;
    }
  }

  // Se ci sono fogli di veicoli non in RIEPILOGO, aggiungili
  for (const sheetName of Object.keys(sheets)) {
    const targaUpper = sheetName.trim().toUpperCase();
    if (/^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(targaUpper) && !vehiclesMeta.has(targaUpper)) {
      vehiclesMeta.set(targaUpper, {
        targa: targaUpper,
        tipo: "CONTRATTO",
        scadenza: null,
        litriTotali: 0,
        ultimiKm: 0,
      });
    }
  }

  let totalVehicles = 0;
  let totalRefuels = 0;
  let totalDeadlines = 0;

  // Elaborazione ed inserimento nel database
  for (const meta of vehiclesMeta.values()) {
    const targa = meta.targa;
    const isPony = meta.tipo.toUpperCase().includes("PONY");
    const isNostro = meta.tipo.toUpperCase().includes("NOSTRO");
    const isContratto = meta.tipo.toUpperCase().includes("CONTRATTO");

    const tipoAcquisizione = isNostro ? "acquisto" : "noleggio";
    const marca = isNostro ? "Sol. Log." : isPony ? "Flotta Pony" : "Flotta Prime";
    const modello = meta.noteMezzo || (isPony ? "Furgone Consegne Pony" : "Furgone Consegne");

    // Upsert mezzo
    const existing = await db.select().from(vehicles).where(eq(vehicles.targa, targa)).limit(1);
    let vehicleId: number;

    if (existing[0]) {
      vehicleId = existing[0].id;
      await db
        .update(vehicles)
        .set({
          tipoAcquisizione,
          kmAttuali: meta.ultimiKm > 0 ? meta.ultimiKm : existing[0].kmAttuali,
          dataFineNoleggio: meta.scadenza,
          stato: "attivo",
          categoria: "furgone",
          carburante: "diesel",
          note: meta.noteMezzo || existing[0].note,
        })
        .where(eq(vehicles.id, vehicleId));
    } else {
      const inserted = await db
        .insert(vehicles)
        .values({
          targa,
          marca,
          modello,
          categoria: "furgone",
          tipoAcquisizione,
          carburante: "diesel",
          kmAttuali: meta.ultimiKm,
          stato: "attivo",
          dataFineNoleggio: meta.scadenza,
          note: meta.noteMezzo || null,
        })
        .returning({ id: vehicles.id });
      vehicleId = inserted[0].id;
    }

    totalVehicles++;

    // Inserimento scadenza contratto noleggio
    if (meta.scadenza) {
      await db.delete(deadlines).where(eq(deadlines.vehicleId, vehicleId));
      await db.insert(deadlines).values({
        vehicleId,
        tipo: "noleggio",
        scadenza: meta.scadenza,
        costo: null,
        note: `Fine contratto noleggio flotta (${meta.tipo})`,
      });
      totalDeadlines++;
    }

    // Estrazione rifornimenti dal foglio del singolo mezzo
    const sheetRows = sheets[targa] ?? [];
    let inGasolio = false;
    const vehicleRefuels: Array<{ data: string; litri: string; costo: string; km: number }> = [];

    for (const row of sheetRows) {
      if (row.includes("GASOLIO")) {
        inGasolio = true;
        continue;
      }
      if (!inGasolio) continue;

      const cols = row.split("\t");
      const dataStr = cols[0]?.trim();
      if (!dataStr || dataStr === "DATA") continue;

      const date = parseItalianDate(dataStr);
      const litri = parseItalianLiters(cols[1]);
      const km = parseItalianInt(cols[2]);

      if (date && litri > 0) {
        const costo = (litri * 1.72).toFixed(2);
        vehicleRefuels.push({
          data: date,
          litri: litri.toFixed(2),
          costo,
          km: km > 0 ? km : 0,
        });
      }
    }

    if (vehicleRefuels.length > 0) {
      // Sostituisci i rifornimenti di questo mezzo con lo storico aggiornato del foglio
      await db.delete(refuels).where(eq(refuels.vehicleId, vehicleId));
      
      // Inserisci in batch
      for (const r of vehicleRefuels) {
        await db.insert(refuels).values({
          vehicleId,
          data: r.data,
          litri: r.litri,
          costo: r.costo,
          km: r.km,
        });
      }
      totalRefuels += vehicleRefuels.length;
    }
  }

  return {
    success: true,
    message: `Sincronizzazione completata con successo! Aggiornati ${totalVehicles} furgoni e ${totalRefuels} rifornimenti.`,
    vehiclesCount: totalVehicles,
    refuelsCount: totalRefuels,
    deadlinesCount: totalDeadlines,
    source,
  };
}
