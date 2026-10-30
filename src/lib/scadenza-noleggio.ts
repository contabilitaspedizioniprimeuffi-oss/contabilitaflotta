// La data di fine contratto vive in due posti:
//  - nella scheda del mezzo (vehicles.data_fine_noleggio), modificata da "Modifica anagrafica";
//  - nell'elenco Scadenze (tipo "noleggio"), che è quello letto dalla Panoramica e dalla pagina Scadenze.
// Queste funzioni li tengono allineati. La scadenza "principale" di un mezzo è la prima di tipo
// "noleggio": le altre eventualmente inserite a mano non vengono toccate.

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deadlines, vehicles } from "@/db/schema";

export const NOTA_FINE_NOLEGGIO = "Fine contratto di noleggio";

export function haContratto(tipoAcquisizione: string | null | undefined): boolean {
  return tipoAcquisizione === "noleggio" || tipoAcquisizione === "leasing";
}

async function scadenzaPrincipale(vehicleId: number) {
  const [row] = await db
    .select()
    .from(deadlines)
    .where(and(eq(deadlines.vehicleId, vehicleId), eq(deadlines.tipo, "noleggio")))
    .orderBy(asc(deadlines.id))
    .limit(1);
  return row ?? null;
}

/**
 * Riporta la data di fine contratto del mezzo nell'elenco Scadenze.
 * dataFine = null cancella la scadenza principale (contratto tolto o data cancellata).
 */
export async function allineaScadenzaNoleggio(
  vehicleId: number,
  dataFine: string | null,
  nota: string = NOTA_FINE_NOLEGGIO
): Promise<void> {
  const principale = await scadenzaPrincipale(vehicleId);
  if (!dataFine) {
    if (principale) await db.delete(deadlines).where(eq(deadlines.id, principale.id));
    return;
  }
  if (!principale) {
    await db.insert(deadlines).values({ vehicleId, tipo: "noleggio", scadenza: dataFine, note: nota });
  } else if (principale.scadenza !== dataFine) {
    await db.update(deadlines).set({ scadenza: dataFine }).where(eq(deadlines.id, principale.id));
  }
}

/**
 * Dopo il salvataggio della scheda del mezzo: aggiorna l'elenco Scadenze.
 * Se la data è stata cancellata (prima c'era) si toglie anche la scadenza;
 * se non c'era mai stata, le scadenze inserite a mano restano come sono.
 */
export async function dopoSalvataggioMezzo(
  vehicleId: number,
  nuovaDataFine: string | null,
  vecchiaDataFine: string | null
): Promise<void> {
  if (nuovaDataFine) await allineaScadenzaNoleggio(vehicleId, nuovaDataFine);
  else if (vecchiaDataFine) await allineaScadenzaNoleggio(vehicleId, null);
}

/**
 * Dopo una modifica nell'elenco Scadenze: se è la scadenza principale di fine noleggio,
 * riporta la data anche nella scheda del mezzo (solo mezzi a noleggio o leasing).
 */
export async function riportaSulMezzo(deadlineId: number, vehicleId: number): Promise<void> {
  const principale = await scadenzaPrincipale(vehicleId);
  if (!principale || principale.id !== deadlineId) return;
  const [v] = await db
    .select({ tipo: vehicles.tipoAcquisizione, fine: vehicles.dataFineNoleggio })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
    .limit(1);
  if (!v || !haContratto(v.tipo) || v.fine === principale.scadenza) return;
  await db.update(vehicles).set({ dataFineNoleggio: principale.scadenza }).where(eq(vehicles.id, vehicleId));
}
