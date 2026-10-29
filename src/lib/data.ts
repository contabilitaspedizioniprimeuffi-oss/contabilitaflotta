import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  deadlines,
  driverLogs,
  fines,
  maintenances,
  refuels,
  vehicles,
  type Deadline,
  type DriverLog,
  type Fine,
  type Maintenance,
  type Refuel,
  type Vehicle,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Query base
// ---------------------------------------------------------------------------

export async function listVehicles(): Promise<Vehicle[]> {
  return db.select().from(vehicles).orderBy(asc(vehicles.targa));
}

export async function listRefuels(): Promise<Refuel[]> {
  return db.select().from(refuels).orderBy(asc(refuels.vehicleId), asc(refuels.km));
}

export async function listMaintenances(): Promise<Maintenance[]> {
  return db.select().from(maintenances).orderBy(desc(maintenances.data));
}

export async function listDeadlines(): Promise<Deadline[]> {
  return db.select().from(deadlines).orderBy(asc(deadlines.scadenza));
}

export async function listFines(): Promise<Fine[]> {
  return db.select().from(fines).orderBy(desc(fines.data), desc(fines.id));
}

export async function getVehicle(id: number): Promise<Vehicle | null> {
  const rows = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getVehicleBundle(id: number) {
  const vehicle = await getVehicle(id);
  if (!vehicle) return null;

  const [mans, refs, dls, fns, logs] = await Promise.all([
    db
      .select()
      .from(maintenances)
      .where(eq(maintenances.vehicleId, id))
      .orderBy(desc(maintenances.data), desc(maintenances.id)),
    db
      .select()
      .from(refuels)
      .where(eq(refuels.vehicleId, id))
      .orderBy(asc(refuels.km)),
    db
      .select()
      .from(deadlines)
      .where(eq(deadlines.vehicleId, id))
      .orderBy(asc(deadlines.scadenza)),
    db
      .select()
      .from(fines)
      .where(eq(fines.vehicleId, id))
      .orderBy(desc(fines.data), desc(fines.id)),
    db
      .select()
      .from(driverLogs)
      .where(eq(driverLogs.vehicleId, id))
      .orderBy(desc(driverLogs.data), desc(driverLogs.id)),
  ]);

  return { vehicle, maintenances: mans, refuels: refs, deadlines: dls, fines: fns, driverLogs: logs };
}

export async function listRecentMaintenances(limit = 8) {
  return db
    .select({
      m: maintenances,
      targa: vehicles.targa,
      modello: vehicles.modello,
      marca: vehicles.marca,
    })
    .from(maintenances)
    .innerJoin(vehicles, eq(maintenances.vehicleId, vehicles.id))
    .orderBy(desc(maintenances.data), desc(maintenances.id))
    .limit(limit);
}

export async function listMaintenancesByType(tipo: string | null) {
  const base = db
    .select({
      m: maintenances,
      targa: vehicles.targa,
      modello: vehicles.modello,
      marca: vehicles.marca,
    })
    .from(maintenances)
    .innerJoin(vehicles, eq(maintenances.vehicleId, vehicles.id))
    .orderBy(desc(maintenances.data), desc(maintenances.id));
  if (tipo) return base.where(eq(maintenances.tipo, tipo));
  return base;
}

export async function listRefuelsJoin(vehicleId: number | null) {
  const base = db
    .select({
      r: refuels,
      targa: vehicles.targa,
      modello: vehicles.modello,
      marca: vehicles.marca,
    })
    .from(refuels)
    .innerJoin(vehicles, eq(refuels.vehicleId, vehicles.id))
    .orderBy(desc(refuels.data), desc(refuels.id));
  if (vehicleId) return base.where(eq(refuels.vehicleId, vehicleId));
  return base;
}

export async function listDeadlinesJoin() {
  return db
    .select({
      d: deadlines,
      targa: vehicles.targa,
      modello: vehicles.modello,
      marca: vehicles.marca,
      stato: vehicles.stato,
    })
    .from(deadlines)
    .innerJoin(vehicles, eq(deadlines.vehicleId, vehicles.id))
    .orderBy(asc(deadlines.scadenza));
}

export async function listRefuelsSince(isoDate: string): Promise<Refuel[]> {
  return db.select().from(refuels).where(gte(refuels.data, isoDate));
}

export async function listFinesJoin(stato: string | null, vehicleId: number | null) {
  const base = db
    .select({
      f: fines,
      targa: vehicles.targa,
      modello: vehicles.modello,
      marca: vehicles.marca,
      statoVeicolo: vehicles.stato,
    })
    .from(fines)
    .innerJoin(vehicles, eq(fines.vehicleId, vehicles.id))
    .orderBy(desc(fines.data), desc(fines.id));

  const conds = [];
  if (stato) conds.push(eq(fines.stato, stato));
  if (vehicleId) conds.push(eq(fines.vehicleId, vehicleId));
  if (conds.length) return base.where(and(...conds));
  return base;
}

// ---------------------------------------------------------------------------
// Calcoli
// ---------------------------------------------------------------------------

export type ConsumptionStats = {
  /** media km per litro (null se non calcolabile) */
  kmPerLiter: number | null;
  /** costo medio carburante per km */
  eurPerKm: number | null;
  /** prezzo medio al litro */
  eurPerLiter: number | null;
  /** km percorsi coperti dai rifornimenti */
  distanzaCoperta: number;
  totaleSpeso: number;
  totaleLitri: number;
};

export function computeConsumption(list: Refuel[]): ConsumptionStats {
  const sorted = [...list]
    .filter((r) => r.km !== null)
    .sort((a, b) => a.km - b.km);

  let dist = 0;
  let cost = 0;
  let liters = 0;
  let weightedLiters = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const d = cur.km - prev.km;
    if (d <= 0) continue;
    const l = Number(cur.litri);
    dist += d;
    cost += Number(cur.costo);
    liters += l;
    weightedLiters += l;
  }

  return {
    kmPerLiter: weightedLiters > 0 ? dist / weightedLiters : null,
    eurPerKm: dist > 0 ? cost / dist : null,
    eurPerLiter: liters > 0 ? cost / liters : null,
    distanzaCoperta: dist,
    totaleSpeso: cost,
    totaleLitri: liters,
  };
}

/** Statistiche di consumo mappate per veicolo */
export function consumptionByVehicle(all: Refuel[]): Map<number, ConsumptionStats> {
  const map = new Map<number, Refuel[]>();
  for (const r of all) {
    const arr = map.get(r.vehicleId) ?? [];
    arr.push(r);
    map.set(r.vehicleId, arr);
  }
  const out = new Map<number, ConsumptionStats>();
  for (const [vid, list] of map) out.set(vid, computeConsumption(list));
  return out;
}

/** Ultimo tagliando con indicazione sul prossimo intervento */
export function nextServiceInfo(
  mans: Maintenance[],
  kmAttuali: number
): { kmRimanenti: number; prossimoKm: number; base: Maintenance } | null {
  const withNext = mans
    .filter((m) => m.prossimoKm !== null)
    .sort((a, b) => (b.prossimoKm ?? 0) - (a.prossimoKm ?? 0));
  const base = withNext[0];
  if (!base || base.prossimoKm === null) return null;
  return { kmRimanenti: base.prossimoKm - kmAttuali, prossimoKm: base.prossimoKm, base };
}
