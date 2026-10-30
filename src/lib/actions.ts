"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { deadlines, driverLogs, fines, maintenances, refuels, vehicles } from "@/db/schema";
import { dopoSalvataggioMezzo, riportaSulMezzo } from "@/lib/scadenza-noleggio";

export type FormResult = { ok: boolean; error?: string; redirectTo?: string };

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function num(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function int(fd: FormData, key: string): number | null {
  const n = num(fd, key);
  return n === null ? null : Math.round(n);
}

/** Km scritti anche all'italiana: "120.000", "120 000 km" → 120000 */
function km(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (!s) return null;
  const n = parseInt(s.replace(/km/i, "").replace(/[.\s']/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function touch() {
  revalidatePath("/");
  revalidatePath("/mezzi");
  revalidatePath("/scadenze");
  revalidatePath("/manutenzioni");
  revalidatePath("/rifornimenti");
  revalidatePath("/multe");
}

// ---------------------------------------------------------------------------
// MEZZI
// ---------------------------------------------------------------------------

function readVehicleForm(fd: FormData) {
  const targa = str(fd, "targa")?.toUpperCase().replace(/\s+/g, "");
  const marca = str(fd, "marca");
  const modello = str(fd, "modello");
  if (!targa || !marca || !modello) {
    return { error: "Targa, marca e modello sono obbligatori." as const };
  }

  const tipoAcquisizione = str(fd, "tipoAcquisizione") || "acquisto";
  const hasTelepass = fd.get("hasTelepass") === "on" ? 1 : 0;
  const isReplacement = fd.get("isReplacement") === "on" ? 1 : 0;

  const base = {
    targa,
    marca,
    modello,
    categoria: str(fd, "categoria") ?? "auto",
    annoImmatricolazione: int(fd, "annoImmatricolazione"),
    tipoAcquisizione,
    numeroContratto: str(fd, "numeroContratto"),
    hasTelepass,
    isReplacement,
    carburante: str(fd, "carburante") ?? "diesel",
    kmAttuali: int(fd, "kmAttuali") ?? 0,
    stato: str(fd, "stato") ?? "attivo",
    conducente: str(fd, "conducente"),
    note: str(fd, "note"),
    // Dati economici
    dataAcquisto: (tipoAcquisizione === "acquisto" || tipoAcquisizione === "riscatto") ? str(fd, "dataAcquisto") : null,
    prezzoAcquisto: (tipoAcquisizione === "acquisto") ? num(fd, "prezzoAcquisto")?.toFixed(2) ?? null : null,
    prezzoRiscatto: (tipoAcquisizione === "riscatto") ? num(fd, "prezzoRiscatto")?.toFixed(2) ?? null : null,
    // Dati noleggio/leasing
    societaNoleggio: (tipoAcquisizione === "noleggio" || tipoAcquisizione === "leasing") ? str(fd, "societaNoleggio") : null,
    dataInizioNoleggio: (tipoAcquisizione === "noleggio" || tipoAcquisizione === "leasing") ? str(fd, "dataInizioNoleggio") : null,
    dataFineNoleggio: (tipoAcquisizione === "noleggio" || tipoAcquisizione === "leasing") ? str(fd, "dataFineNoleggio") : null,
    canoneMensile: (tipoAcquisizione === "noleggio" || tipoAcquisizione === "leasing") ? num(fd, "canoneMensile")?.toFixed(2) ?? null : null,
    kmMassimiContratto: (tipoAcquisizione === "noleggio" || tipoAcquisizione === "leasing") ? (km(fd, "kmMassimiContratto") || null) : null,
  };

  return { values: base };
}

export async function createVehicle(_prev: FormResult, fd: FormData): Promise<FormResult> {
  let values: ReturnType<typeof readVehicleForm>["values"];
  try {
    const parsed = readVehicleForm(fd);
    if (parsed.error || !parsed.values) return { ok: false, error: parsed.error ?? "Dati non validi." };
    values = parsed.values;
  } catch {
    return { ok: false, error: "Errore nella lettura dei dati del form." };
  }

  let id: number;
  try {
    const [row] = await db.insert(vehicles).values(values).returning({ id: vehicles.id });
    id = row.id;
    await dopoSalvataggioMezzo(id, values.dataFineNoleggio, null);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { ok: false, error: "Esiste già un mezzo con questa targa." };
    }
    console.error("createVehicle DB error:", e);
    return { ok: false, error: "Errore durante il salvataggio: " + msg.slice(0, 120) };
  }

  try { touch(); revalidatePath(`/mezzi/${id}`); } catch { /* ignore */ }
  return { ok: true, redirectTo: `/mezzi/${id}` };
}

export async function updateVehicle(
  vehicleId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  let values: ReturnType<typeof readVehicleForm>["values"];
  try {
    const parsed = readVehicleForm(fd);
    if (parsed.error || !parsed.values) return { ok: false, error: parsed.error ?? "Dati non validi." };
    values = parsed.values;
  } catch {
    return { ok: false, error: "Errore nella lettura dei dati del form." };
  }

  try {
    const [prima] = await db
      .select({ dataFineNoleggio: vehicles.dataFineNoleggio })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    await db.update(vehicles).set(values!).where(eq(vehicles.id, vehicleId));
    await dopoSalvataggioMezzo(vehicleId, values!.dataFineNoleggio, prima?.dataFineNoleggio ?? null);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { ok: false, error: "Esiste già un mezzo con questa targa." };
    }
    console.error("updateVehicle DB error:", e);
    return { ok: false, error: "Errore durante il salvataggio: " + msg.slice(0, 120) };
  }

  try { touch(); revalidatePath(`/mezzi/${vehicleId}`); } catch { /* ignore */ }
  return { ok: true, redirectTo: `/mezzi/${vehicleId}` };
}

export async function deleteVehicle(vehicleId: number) {
  await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
  touch();
  redirect("/mezzi");
}

// ---------------------------------------------------------------------------
// RIFORNIMENTI
// ---------------------------------------------------------------------------

function readRefuelForm(fd: FormData) {
  const data = str(fd, "data");
  const litri = num(fd, "litri");
  const costo = num(fd, "costo");
  const km = int(fd, "km");

  if (!data || litri === null || costo === null || km === null) {
    return { error: "Compila data, litri, importo e chilometri." as const };
  }
  if (litri <= 0) return { error: "I litri devono essere maggiori di zero." as const };

  return {
    values: {
      data,
      litri: litri.toFixed(2),
      costo: costo.toFixed(2),
      km,
    },
  };
}

async function bumpKmIfNeeded(vehicleId: number, km: number | null) {
  if (km === null) return;
  const [v] = await db
    .select({ km: vehicles.kmAttuali })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId));
  if (v && km > v.km) {
    await db.update(vehicles).set({ kmAttuali: km }).where(eq(vehicles.id, vehicleId));
  }
}

export async function addRefuel(
  vehicleId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  const { values, error } = readRefuelForm(fd);
  if (error || !values) return { ok: false, error: error ?? "Dati non validi." };

  await db.insert(refuels).values({ vehicleId, ...values });
  await bumpKmIfNeeded(vehicleId, values.km);

  touch();
  revalidatePath(`/mezzi/${vehicleId}`);
  return { ok: true };
}

export async function updateRefuel(
  refuelId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  const { values, error } = readRefuelForm(fd);
  if (error || !values) return { ok: false, error: error ?? "Dati non validi." };

  const [row] = await db
    .update(refuels)
    .set(values)
    .where(eq(refuels.id, refuelId))
    .returning();
  if (!row) return { ok: false, error: "Rifornimento non trovato." };

  await bumpKmIfNeeded(row.vehicleId, values.km);

  touch();
  revalidatePath(`/mezzi/${row.vehicleId}`);
  return { ok: true };
}

export async function deleteRefuel(id: number) {
  const [row] = await db.delete(refuels).where(eq(refuels.id, id)).returning();
  if (row) {
    touch();
    revalidatePath(`/mezzi/${row.vehicleId}`);
  }
}

// ---------------------------------------------------------------------------
// MANUTENZIONI
// ---------------------------------------------------------------------------

function readMaintenanceForm(fd: FormData) {
  const data = str(fd, "data");
  if (!data) return { error: "La data è obbligatoria." as const };

  return {
    values: {
      data,
      tipo: str(fd, "tipo") ?? "altro",
      descrizione: str(fd, "descrizione"),
      dettaglioLavori: str(fd, "dettaglioLavori"),
      km: int(fd, "km"),
      costo: num(fd, "costo")?.toFixed(2) ?? null,
      officina: str(fd, "officina"),
      prossimoKm: int(fd, "prossimoKm"),
      prossimaData: str(fd, "prossimaData"),
    },
  };
}

export async function addMaintenance(
  vehicleId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  const { values, error } = readMaintenanceForm(fd);
  if (error || !values) return { ok: false, error: error ?? "Dati non validi." };

  await db.insert(maintenances).values({ vehicleId, ...values });
  await bumpKmIfNeeded(vehicleId, values.km);

  touch();
  revalidatePath(`/mezzi/${vehicleId}`);
  return { ok: true };
}

export async function updateMaintenance(
  maintenanceId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  const { values, error } = readMaintenanceForm(fd);
  if (error || !values) return { ok: false, error: error ?? "Dati non validi." };

  const [row] = await db
    .update(maintenances)
    .set(values)
    .where(eq(maintenances.id, maintenanceId))
    .returning();
  if (!row) return { ok: false, error: "Intervento non trovato." };

  await bumpKmIfNeeded(row.vehicleId, values.km);

  touch();
  revalidatePath(`/mezzi/${row.vehicleId}`);
  return { ok: true };
}

export async function deleteMaintenance(id: number) {
  const [row] = await db.delete(maintenances).where(eq(maintenances.id, id)).returning();
  if (row) {
    touch();
    revalidatePath(`/mezzi/${row.vehicleId}`);
  }
}

// ---------------------------------------------------------------------------
// SCADENZE
// ---------------------------------------------------------------------------

function readDeadlineForm(fd: FormData) {
  const scadenza = str(fd, "scadenza");
  if (!scadenza) return { error: "La data di scadenza è obbligatoria." as const };

  return {
    values: {
      tipo: str(fd, "tipo") ?? "altro",
      scadenza,
      costo: num(fd, "costo")?.toFixed(2) ?? null,
      note: str(fd, "note"),
    },
  };
}

export async function addDeadline(
  vehicleId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  const { values, error } = readDeadlineForm(fd);
  if (error || !values) return { ok: false, error: error ?? "Dati non validi." };

  const [nuova] = await db.insert(deadlines).values({ vehicleId, ...values }).returning();
  if (nuova && nuova.tipo === "noleggio") await riportaSulMezzo(nuova.id, vehicleId);

  touch();
  revalidatePath(`/mezzi/${vehicleId}`);
  return { ok: true };
}

export async function updateDeadline(
  deadlineId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  const { values, error } = readDeadlineForm(fd);
  if (error || !values) return { ok: false, error: error ?? "Dati non validi." };

  const [row] = await db
    .update(deadlines)
    .set(values)
    .where(eq(deadlines.id, deadlineId))
    .returning();
  if (!row) return { ok: false, error: "Scadenza non trovata." };
  if (row.tipo === "noleggio") await riportaSulMezzo(row.id, row.vehicleId);

  touch();
  revalidatePath(`/mezzi/${row.vehicleId}`);
  return { ok: true };
}

export async function deleteDeadline(id: number) {
  const [row] = await db.delete(deadlines).where(eq(deadlines.id, id)).returning();
  if (row) {
    touch();
    revalidatePath(`/mezzi/${row.vehicleId}`);
  }
}

// ---------------------------------------------------------------------------
// MULTE
// ---------------------------------------------------------------------------

const FINE_STATI = new Set(["da_pagare", "pagata", "contestata"]);

function readFineForm(fd: FormData) {
  const data = str(fd, "data");
  const motivo = str(fd, "motivo");
  const importo = num(fd, "importo");
  if (!data || !motivo || importo === null) {
    return { error: "Data, motivo e importo sono obbligatori." as const };
  }
  const stato = str(fd, "stato");

  return {
    values: {
      data,
      motivo,
      luogo: str(fd, "luogo"),
      numeroVerbale: str(fd, "numeroVerbale"),
      importo: importo.toFixed(2),
      punti: int(fd, "punti"),
      conducente: str(fd, "conducente"),
      stato: stato && FINE_STATI.has(stato) ? stato : "da_pagare",
      tipoPagamento: str(fd, "tipoPagamento"),
      dataPagamento: str(fd, "dataPagamento"),
      note: str(fd, "note"),
    },
  };
}

export async function addFine(
  vehicleId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  const { values, error } = readFineForm(fd);
  if (error || !values) return { ok: false, error: error ?? "Dati non validi." };

  await db.insert(fines).values({ vehicleId, ...values });

  touch();
  revalidatePath(`/mezzi/${vehicleId}`);
  return { ok: true };
}

/** Variante con selezione del mezzo dal form (pagina Multe) */
export async function addFineFromSelect(
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  const vehicleId = int(fd, "vehicleId");
  if (!vehicleId) return { ok: false, error: "Seleziona il mezzo." };
  return addFine(vehicleId, { ok: false }, fd);
}

export async function updateFine(
  fineId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  const { values, error } = readFineForm(fd);
  if (error || !values) return { ok: false, error: error ?? "Dati non validi." };

  const [row] = await db.update(fines).set(values).where(eq(fines.id, fineId)).returning();
  if (!row) return { ok: false, error: "Multa non trovata." };

  touch();
  revalidatePath(`/mezzi/${row.vehicleId}`);
  return { ok: true };
}

/** Segna la multa come pagata (con data pagamento = oggi) o riaprila */
export async function toggleFinePaid(fineId: number) {
  const [f] = await db.select().from(fines).where(eq(fines.id, fineId)).limit(1);
  if (!f) return;
  const oggi = new Date().toISOString().slice(0, 10);
  await db
    .update(fines)
    .set(
      f.stato === "pagata"
        ? { stato: "da_pagare", dataPagamento: null }
        : { stato: "pagata", dataPagamento: oggi }
    )
    .where(eq(fines.id, fineId));

  touch();
  revalidatePath(`/mezzi/${f.vehicleId}`);
}

export async function deleteFine(id: number) {
  const [row] = await db.delete(fines).where(eq(fines.id, id)).returning();
  if (row) {
    touch();
    revalidatePath(`/mezzi/${row.vehicleId}`);
  }
}

// ---------------------------------------------------------------------------
// DIARIO AUTISTI
// ---------------------------------------------------------------------------

export async function addDriverLog(
  vehicleId: number,
  _prev: FormResult,
  fd: FormData
): Promise<FormResult> {
  // Diario mensile: il mese ("2026-10") si salva come primo giorno del mese ("2026-10-01").
  // Le vecchie registrazioni giornaliere restano valide e compaiono nel loro mese.
  const mese = str(fd, "mese");
  const data = mese && /^\d{4}-\d{2}$/.test(mese) ? `${mese}-01` : str(fd, "data");
  const conducente = str(fd, "conducente");
  const kmInizio = km(fd, "kmInizio");
  const kmFine = km(fd, "kmFine");
  const note = str(fd, "note");

  if (!data || !conducente) {
    return { ok: false, error: "Mese e autista sono obbligatori." };
  }
  if (kmInizio !== null && kmFine !== null && kmFine < kmInizio) {
    return { ok: false, error: "I km di fine mese non possono essere inferiori a quelli di inizio mese." };
  }

  // Stesso autista già registrato in quel mese: si aggiornano i dati invece di creare un doppione
  const stessoMese = await db
    .select()
    .from(driverLogs)
    .where(and(eq(driverLogs.vehicleId, vehicleId), eq(driverLogs.data, data)));
  const esistente = stessoMese.find(
    (l) => l.conducente.trim().toLowerCase() === conducente.toLowerCase()
  );

  if (esistente) {
    await db
      .update(driverLogs)
      .set({
        kmInizio: kmInizio ?? esistente.kmInizio,
        kmFine: kmFine ?? esistente.kmFine,
        note: note ?? esistente.note,
      })
      .where(eq(driverLogs.id, esistente.id));
  } else {
    await db.insert(driverLogs).values({ vehicleId, data, conducente, kmInizio, kmFine, note });
  }

  if (kmFine) await bumpKmIfNeeded(vehicleId, kmFine);

  touch();
  revalidatePath(`/mezzi/${vehicleId}`);
  return { ok: true };
}

export async function deleteDriverLog(id: number) {
  const [row] = await db.delete(driverLogs).where(eq(driverLogs.id, id)).returning();
  if (row) {
    touch();
    revalidatePath(`/mezzi/${row.vehicleId}`);
  }
}
