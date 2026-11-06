import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as path from "path";
import * as schema from "./schema";

const dbFile = path.resolve(process.cwd(), "local_database.db");
export const client = createClient({ url: `file:${dbFile}` });

export const DDL_SCHEMA = `
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  targa TEXT NOT NULL UNIQUE,
  marca TEXT NOT NULL,
  modello TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'auto',
  anno_immatricolazione INTEGER,
  tipo_acquisizione TEXT NOT NULL DEFAULT 'acquisto',
  numero_contratto TEXT,
  is_replacement INTEGER NOT NULL DEFAULT 0,
  has_telepass INTEGER NOT NULL DEFAULT 0,
  data_acquisto TEXT,
  prezzo_acquisto TEXT,
  prezzo_riscatto TEXT,
  societa_noleggio TEXT,
  data_inizio_noleggio TEXT,
  data_fine_noleggio TEXT,
  canone_mensile TEXT,
  km_massimi_contratto INTEGER,
  carburante TEXT NOT NULL DEFAULT 'diesel',
  km_attuali INTEGER NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'attivo',
  conducente TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS driver_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  conducente TEXT NOT NULL,
  km_inizio INTEGER,
  km_fine INTEGER,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'altro',
  descrizione TEXT,
  dettaglio_lavori TEXT,
  km INTEGER,
  costo TEXT,
  officina TEXT,
  prossimo_km INTEGER,
  prossima_data TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refuels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  litri TEXT NOT NULL,
  costo TEXT NOT NULL,
  km INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'altro',
  scadenza TEXT NOT NULL,
  costo TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  motivo TEXT NOT NULL,
  luogo TEXT,
  numero_verbale TEXT,
  importo TEXT NOT NULL,
  punti INTEGER,
  conducente TEXT,
  stato TEXT NOT NULL DEFAULT 'da_pagare',
  tipo_pagamento TEXT,
  data_pagamento TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  dispositivo TEXT,
  id_prenotazione TEXT,
  data_entrata TEXT,
  ora_entrata TEXT,
  stazione_entrata TEXT,
  data_uscita TEXT NOT NULL,
  ora_uscita TEXT,
  stazione_uscita TEXT,
  classe TEXT,
  servizio TEXT,
  importo TEXT NOT NULL,
  iva TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

// Colonne rinominate dopo la prima versione (prima di aggiungere quelle nuove).
// Pedaggi: la prima versione aveva data / entrata / uscita.
const COLONNE_RINOMINATE: { tabella: string; da: string; a: string }[] = [
  { tabella: "tolls", da: "data", a: "data_uscita" },
  { tabella: "tolls", da: "entrata", a: "stazione_entrata" },
  { tabella: "tolls", da: "uscita", a: "stazione_uscita" },
];

// Indici creati dopo aver sistemato le colonne
const INDICI = [
  "CREATE INDEX IF NOT EXISTS idx_tolls_data ON tolls(data_uscita)",
  "CREATE INDEX IF NOT EXISTS idx_tolls_vehicle ON tolls(vehicle_id, data_uscita)",
];

// Colonne aggiunte dopo la prima versione: nei database già esistenti (quello del PC
// con i dati veri) vengono aggiunte all'avvio, senza toccare i dati presenti.
const COLONNE_AGGIUNTE: { tabella: string; colonna: string; tipo: string }[] = [
  { tabella: "vehicles", colonna: "km_massimi_contratto", tipo: "INTEGER" },
  // Pedaggi con gli stessi campi del dettaglio Telepass
  { tabella: "tolls", colonna: "dispositivo", tipo: "TEXT" },
  { tabella: "tolls", colonna: "id_prenotazione", tipo: "TEXT" },
  { tabella: "tolls", colonna: "data_entrata", tipo: "TEXT" },
  { tabella: "tolls", colonna: "ora_entrata", tipo: "TEXT" },
  { tabella: "tolls", colonna: "ora_uscita", tipo: "TEXT" },
  { tabella: "tolls", colonna: "classe", tipo: "TEXT" },
  { tabella: "tolls", colonna: "servizio", tipo: "TEXT" },
  { tabella: "tolls", colonna: "iva", tipo: "TEXT" },
];

// Sistemazioni dei dati da fare una volta sola (ricordate nella tabella "migrazioni").
// Ogni sistemazione è eseguita tutta insieme: se qualcosa va storto non cambia nulla.
const SISTEMAZIONI: { nome: string; istruzioni: string[] }[] = [
  {
    // La data di fine contratto scritta nella scheda del mezzo non veniva riportata
    // nell'elenco Scadenze (che è quello letto dalla Panoramica): si riallinea.
    nome: "2026-10-allinea-scadenze-noleggio",
    istruzioni: [
      `INSERT INTO deadlines (vehicle_id, tipo, scadenza, note)
       SELECT v.id, 'noleggio', v.data_fine_noleggio, 'Fine contratto di noleggio'
       FROM vehicles v
       WHERE v.tipo_acquisizione IN ('noleggio', 'leasing')
         AND COALESCE(v.data_fine_noleggio, '') <> ''
         AND NOT EXISTS (SELECT 1 FROM deadlines d WHERE d.vehicle_id = v.id AND d.tipo = 'noleggio')`,
      `UPDATE deadlines
       SET scadenza = (SELECT v.data_fine_noleggio FROM vehicles v WHERE v.id = deadlines.vehicle_id)
       WHERE id IN (
           SELECT MIN(d.id) FROM deadlines d JOIN vehicles v ON v.id = d.vehicle_id
           WHERE d.tipo = 'noleggio'
             AND v.tipo_acquisizione IN ('noleggio', 'leasing')
             AND COALESCE(v.data_fine_noleggio, '') <> ''
           GROUP BY d.vehicle_id
         )
         AND scadenza <> (SELECT v.data_fine_noleggio FROM vehicles v WHERE v.id = deadlines.vehicle_id)`,
    ],
  },
  {
    // Si riparte da ottobre 2026: spese di carburante e manutenzione precedenti tolte.
    // Prima vengono copiate (con la targa) nelle tabelle di archivio: non si vedono, ma non si perdono.
    // Restano, senza spesa, le manutenzioni con un promemoria ancora valido: soglia km non ancora
    // raggiunta o data non ancora passata, e nessun intervento dello stesso tipo più recente.
    nome: "2026-11-azzera-spese-prima-di-ottobre",
    istruzioni: [
      `CREATE TABLE IF NOT EXISTS archivio_rifornimenti AS
       SELECT r.*, v.targa AS targa, datetime('now') AS archiviato_il
       FROM refuels r LEFT JOIN vehicles v ON v.id = r.vehicle_id WHERE 0`,
      `CREATE TABLE IF NOT EXISTS archivio_manutenzioni AS
       SELECT m.*, v.targa AS targa, datetime('now') AS archiviato_il
       FROM maintenances m LEFT JOIN vehicles v ON v.id = m.vehicle_id WHERE 0`,
      `INSERT INTO archivio_rifornimenti
       SELECT r.*, v.targa, datetime('now')
       FROM refuels r LEFT JOIN vehicles v ON v.id = r.vehicle_id WHERE r.data < '2026-10-01'`,
      `INSERT INTO archivio_manutenzioni
       SELECT m.*, v.targa, datetime('now')
       FROM maintenances m LEFT JOIN vehicles v ON v.id = m.vehicle_id WHERE m.data < '2026-10-01'`,
      `DROP TABLE IF EXISTS temp.promemoria_da_tenere`,
      `CREATE TEMP TABLE promemoria_da_tenere AS
       SELECT m.id AS id
       FROM maintenances m JOIN vehicles v ON v.id = m.vehicle_id
       WHERE m.data < '2026-10-01'
         AND ((m.prossimo_km IS NOT NULL AND m.prossimo_km > v.km_attuali)
              OR (COALESCE(m.prossima_data, '') <> '' AND m.prossima_data >= date('now', 'localtime')))
         AND NOT EXISTS (
           SELECT 1 FROM maintenances m2
           WHERE m2.vehicle_id = m.vehicle_id AND m2.tipo = m.tipo
             AND (m2.data > m.data OR (m2.data = m.data AND m2.id > m.id)))`,
      `UPDATE maintenances SET costo = NULL WHERE id IN (SELECT id FROM promemoria_da_tenere)`,
      `DELETE FROM refuels WHERE data < '2026-10-01'`,
      `DELETE FROM maintenances
       WHERE data < '2026-10-01' AND id NOT IN (SELECT id FROM promemoria_da_tenere)`,
      `DROP TABLE temp.promemoria_da_tenere`,
    ],
  },
  {
    // Carburante a 2 € al litro (prima la spesa era stimata a 1,72 €/l): ricalcolata la spesa
    // dei rifornimenti di ottobre e novembre 2026. Litri e chilometri non cambiano.
    nome: "2026-11-carburante-2-euro-ottobre-novembre",
    istruzioni: [
      `UPDATE refuels
       SET costo = printf('%.2f', CAST(litri AS REAL) * 2.0)
       WHERE data >= '2026-10-01' AND data < '2026-12-01'`,
    ],
  },
  {
    // Pedaggi: da ora l'importo si salva IVA esclusa (con l'aliquota) e si mostra IVA inclusa.
    // Quelli scritti a mano nella prima versione erano IVA inclusa: si riportano senza IVA,
    // così l'importo mostrato resta identico.
    nome: "2026-11-pedaggi-importo-iva-esclusa",
    istruzioni: [
      `UPDATE tolls
       SET importo = printf('%.4f', CAST(importo AS REAL) / 1.22), iva = '22'
       WHERE iva IS NULL`,
    ],
  },
];

async function preparaDatabase() {
  await client.executeMultiple(DDL_SCHEMA);

  for (const r of COLONNE_RINOMINATE) {
    const info = await client.execute(`PRAGMA table_info(${r.tabella})`);
    const nomi = info.rows.map((x) => x.name);
    if (nomi.includes(r.da) && !nomi.includes(r.a)) {
      await client.execute(`ALTER TABLE ${r.tabella} RENAME COLUMN ${r.da} TO ${r.a}`);
    }
  }

  for (const c of COLONNE_AGGIUNTE) {
    const info = await client.execute(`PRAGMA table_info(${c.tabella})`);
    if (!info.rows.some((r) => r.name === c.colonna)) {
      await client.execute(`ALTER TABLE ${c.tabella} ADD COLUMN ${c.colonna} ${c.tipo}`);
    }
  }

  for (const indice of INDICI) await client.execute(indice);

  await client.execute(
    "CREATE TABLE IF NOT EXISTS migrazioni (nome TEXT PRIMARY KEY, eseguita_il TEXT DEFAULT (datetime('now')))"
  );
  for (const s of SISTEMAZIONI) {
    const fatta = await client.execute({ sql: "SELECT 1 FROM migrazioni WHERE nome = ?", args: [s.nome] });
    if (fatta.rows.length > 0) continue;
    await client.batch(
      [...s.istruzioni, { sql: "INSERT INTO migrazioni (nome) VALUES (?)", args: [s.nome] }],
      "write"
    );
  }
}

let preparazione: Promise<void> | null = null;

/** Crea le tabelle mancanti e aggiorna i database esistenti (una volta per avvio). */
export function ensureSchema(): Promise<void> {
  if (!preparazione) {
    preparazione = preparaDatabase().catch((e) => {
      preparazione = null; // al prossimo tentativo si riprova
      throw e;
    });
  }
  return preparazione;
}

export const db = drizzle(client, { schema });
