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
`;

// Colonne aggiunte dopo la prima versione: nei database già esistenti (quello del PC
// con i dati veri) vengono aggiunte all'avvio, senza toccare i dati presenti.
const COLONNE_AGGIUNTE: { tabella: string; colonna: string; tipo: string }[] = [
  { tabella: "vehicles", colonna: "km_massimi_contratto", tipo: "INTEGER" },
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
];

async function preparaDatabase() {
  await client.executeMultiple(DDL_SCHEMA);

  for (const c of COLONNE_AGGIUNTE) {
    const info = await client.execute(`PRAGMA table_info(${c.tabella})`);
    if (!info.rows.some((r) => r.name === c.colonna)) {
      await client.execute(`ALTER TABLE ${c.tabella} ADD COLUMN ${c.colonna} ${c.tipo}`);
    }
  }

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
