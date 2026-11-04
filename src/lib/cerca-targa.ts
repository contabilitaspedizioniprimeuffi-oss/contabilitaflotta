// Ricerca dei mezzi per targa (lente nella barra laterale)

/** Targa in maiuscolo senza spazi, trattini o punti: "ft 482-kl" → "FT482KL" */
export function normalizzaTarga(testo: string): string {
  return testo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Mezzi la cui targa contiene il testo cercato (non importa maiuscole/spazi).
 * Prima le targhe che iniziano con il testo, poi le altre; a parità, in ordine alfabetico.
 */
export function cercaPerTarga<T extends { targa: string }>(mezzi: T[], testo: string): T[] {
  const cercato = normalizzaTarga(testo);
  if (!cercato) return [];
  return mezzi
    .map((mezzo) => {
      const chiave = normalizzaTarga(mezzo.targa);
      return { mezzo, chiave, posizione: chiave.indexOf(cercato) };
    })
    .filter((r) => r.posizione >= 0)
    .sort((a, b) => a.posizione - b.posizione || (a.chiave < b.chiave ? -1 : a.chiave > b.chiave ? 1 : 0))
    .map((r) => r.mezzo);
}
