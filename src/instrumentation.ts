// Eseguito una volta all'avvio del programma, prima di aprire le pagine:
// prepara il database (tabelle nuove, colonne aggiunte negli aggiornamenti).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSchema } = await import("@/db");
  try {
    await ensureSchema();
  } catch (e) {
    console.error("Preparazione del database non riuscita:", e);
  }
}
