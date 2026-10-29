import { db, ensureSchema } from "./index";
import { deadlines, driverLogs, fines, maintenances, refuels, vehicles } from "./schema";

export async function clearAllData() {
  await ensureSchema();
  console.log("Cancellazione dati placeholder in corso...");
  await db.delete(fines);
  await db.delete(refuels);
  await db.delete(maintenances);
  await db.delete(deadlines);
  await db.delete(driverLogs);
  await db.delete(vehicles);
  console.log("Tutti i dati placeholder sono stati eliminati con successo.");
}

if (require.main === module) {
  clearAllData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Errore cancellazione:", err);
      process.exit(1);
    });
}
