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

export async function ensureSchema() {
  await client.executeMultiple(DDL_SCHEMA);
}

export const db = drizzle(client, { schema });
