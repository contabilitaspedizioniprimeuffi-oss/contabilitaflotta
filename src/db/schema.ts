import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// MEZZI (automezzi aziendali)
// ---------------------------------------------------------------------------
export const vehicles = sqliteTable("vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  targa: text("targa").notNull().unique(),
  marca: text("marca").notNull(),
  modello: text("modello").notNull(),
  categoria: text("categoria").notNull().default("auto"), // auto | furgone | camion | altro
  annoImmatricolazione: integer("anno_immatricolazione"),
  tipoAcquisizione: text("tipo_acquisizione").notNull().default("acquisto"),
  numeroContratto: text("numero_contratto"),
  isReplacement: integer("is_replacement").notNull().default(0),
  hasTelepass: integer("has_telepass").notNull().default(0),

  // Dati acquisto/riscatto
  dataAcquisto: text("data_acquisto"),
  prezzoAcquisto: text("prezzo_acquisto"),
  prezzoRiscatto: text("prezzo_riscatto"),

  // Dati noleggio/leasing
  societaNoleggio: text("societa_noleggio"),
  dataInizioNoleggio: text("data_inizio_noleggio"),
  dataFineNoleggio: text("data_fine_noleggio"),
  canoneMensile: text("canone_mensile"),
  // Noleggio/leasing: km massimi da rispettare secondo il contratto (letti sul contachilometri)
  kmMassimiContratto: integer("km_massimi_contratto"),

  // Dati tecnici
  carburante: text("carburante").notNull().default("diesel"),
  kmAttuali: integer("km_attuali").notNull().default(0),
  stato: text("stato").notNull().default("attivo"),
  conducente: text("conducente"),
  note: text("note"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// DIARIO CONDUCENTI
// ---------------------------------------------------------------------------
export const driverLogs = sqliteTable("driver_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  conducente: text("conducente").notNull(),
  kmInizio: integer("km_inizio"),
  kmFine: integer("km_fine"),
  note: text("note"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// MANUTENZIONI
// ---------------------------------------------------------------------------
export const maintenances = sqliteTable("maintenances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  tipo: text("tipo").notNull().default("altro"),
  descrizione: text("descrizione"),
  dettaglioLavori: text("dettaglio_lavori"),
  km: integer("km"),
  costo: text("costo"),
  officina: text("officina"),
  prossimoKm: integer("prossimo_km"),
  prossimaData: text("prossima_data"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// RIFORNIMENTI
// ---------------------------------------------------------------------------
export const refuels = sqliteTable("refuels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  litri: text("litri").notNull(),
  costo: text("costo").notNull(),
  km: integer("km").notNull(),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// SCADENZE
// ---------------------------------------------------------------------------
export const deadlines = sqliteTable("deadlines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().default("altro"),
  scadenza: text("scadenza").notNull(),
  costo: text("costo"),
  note: text("note"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// MULTE
// ---------------------------------------------------------------------------
export const fines = sqliteTable("fines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  motivo: text("motivo").notNull(),
  luogo: text("luogo"),
  numeroVerbale: text("numero_verbale"),
  importo: text("importo").notNull(),
  punti: integer("punti"),
  conducente: text("conducente"),
  stato: text("stato").notNull().default("da_pagare"),
  tipoPagamento: text("tipo_pagamento"),
  dataPagamento: text("data_pagamento"),
  note: text("note"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// PEDAGGI (autostrade): stessi campi del «Dettaglio Elenco Viaggi Pedaggio» Telepass
// ---------------------------------------------------------------------------
export const tolls = sqliteTable("tolls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vehicleId: integer("vehicle_id") // TARGA
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  dispositivo: text("dispositivo"), // DISPOSITIVO CODICE OBU/PAN
  idPrenotazione: text("id_prenotazione"), // ID PRENOTAZIONE
  dataEntrata: text("data_entrata"), // DATA ENTR. (AAAA-MM-GG)
  oraEntrata: text("ora_entrata"), // ORA ENTR (HH:MM:SS)
  stazioneEntrata: text("stazione_entrata"), // STAZIONE ENTRATA
  dataUscita: text("data_uscita").notNull(), // DATA USC.: è la data del pedaggio
  oraUscita: text("ora_uscita"), // ORA USC.
  stazioneUscita: text("stazione_uscita"), // STAZIONE USCITA
  classe: text("classe"), // CLASSE
  servizio: text("servizio"), // SRV (PED, SA3, ...)
  importo: text("importo").notNull(), // IMPORTO, IVA inclusa come nel PDF (negativo per gli sconti)
  // Nel file Telepass mancava la targa: il mezzo è quello che di solito usa il dispositivo (asterisco)
  targaDalDispositivo: integer("targa_dal_dispositivo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// RELAZIONI
// ---------------------------------------------------------------------------
export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  maintenances: many(maintenances),
  refuels: many(refuels),
  deadlines: many(deadlines),
  fines: many(fines),
  tolls: many(tolls),
  driverLogs: many(driverLogs),
}));

export const driverLogsRelations = relations(driverLogs, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [driverLogs.vehicleId],
    references: [vehicles.id],
  }),
}));

export const maintenancesRelations = relations(maintenances, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [maintenances.vehicleId],
    references: [vehicles.id],
  }),
}));

export const refuelsRelations = relations(refuels, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [refuels.vehicleId],
    references: [vehicles.id],
  }),
}));

export const deadlinesRelations = relations(deadlines, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [deadlines.vehicleId],
    references: [vehicles.id],
  }),
}));

export const finesRelations = relations(fines, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [fines.vehicleId],
    references: [vehicles.id],
  }),
}));

export const tollsRelations = relations(tolls, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [tolls.vehicleId],
    references: [vehicles.id],
  }),
}));

export type Vehicle = typeof vehicles.$inferSelect;
export type Maintenance = typeof maintenances.$inferSelect;
export type Refuel = typeof refuels.$inferSelect;
export type Deadline = typeof deadlines.$inferSelect;
export type Fine = typeof fines.$inferSelect;
export type DriverLog = typeof driverLogs.$inferSelect;
export type Toll = typeof tolls.$inferSelect;
