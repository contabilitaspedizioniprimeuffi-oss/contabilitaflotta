import "dotenv/config";
import { db, ensureSchema } from "./index";
import { deadlines, driverLogs, fines, maintenances, refuels, vehicles } from "./schema";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
const DAY = 24 * 60 * 60 * 1000;

function d(offsetDays: number): string {
  const dt = new Date(Date.now() + offsetDays * DAY);
  return dt.toISOString().slice(0, 10);
}

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const eur = (n: number) => n.toFixed(2);

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function main() {
  await ensureSchema(); // crea le tabelle se il database e' nuovo
  console.log("Pulizia tabelle...");
  await db.delete(fines);
  await db.delete(refuels);
  await db.delete(maintenances);
  await db.delete(deadlines);
  await db.delete(driverLogs);
  await db.delete(vehicles);

  const fleet = [
    {
      targa: "FT482KL",
      marca: "Fiat",
      modello: "Ducato 35 2.2 MJet",
      categoria: "furgone",
      anno: 2022,
      acq: "noleggio" as const,
      noleggio: {
        societa: "Arval",
        inizio: d(-700),
        fine: d(395),
        canone: 459,
        kmMassimi: 58000, // al ritmo attuale rischia di superarli
      },
      carburante: "diesel",
      stato: "attivo",
      conducente: "Marco Bianchi",
      kmStart: 24000,
      kmPerLiter: 9.6,
      prezzoLitro: 1.72,
      note: "Furgone principale consegne — allestimento scaffalatura.",
      assicurazioneIn: 18,
      revisioneIn: 200,
    },
    {
      targa: "GH930MC",
      marca: "Volkswagen",
      modello: "Golf 1.5 TSI Life",
      categoria: "auto",
      anno: 2021,
      acq: "acquisto" as const,
      acquisto: { data: d(-1240), prezzo: 26450 },
      carburante: "benzina",
      stato: "attivo",
      conducente: "Laura Ferrari",
      kmStart: 31000,
      kmPerLiter: 14.8,
      prezzoLitro: 1.82,
      note: "Auto commerciale area nord.",
      assicurazioneIn: 95,
      revisioneIn: -6, // SCADUTA
    },
    {
      targa: "EK215DP",
      marca: "Toyota",
      modello: "Corolla 1.8 Hybrid",
      categoria: "auto",
      anno: 2023,
      acq: "noleggio" as const,
      noleggio: {
        societa: "Leasys",
        inizio: d(-320),
        fine: d(740),
        canone: 389,
        kmMassimi: 90000, // ampiamente nel limite
      },
      carburante: "ibrido",
      stato: "attivo",
      conducente: "Giulia Romano",
      kmStart: 8500,
      kmPerLiter: 21.5,
      prezzoLitro: 1.78,
      assicurazioneIn: 230,
      revisioneIn: 700,
    },
    {
      targa: "DT704NS",
      marca: "Mercedes-Benz",
      modello: "Sprinter 314 CDI",
      categoria: "furgone",
      anno: 2019,
      acq: "acquisto" as const,
      acquisto: { data: d(-2320), prezzo: 38900 },
      carburante: "diesel",
      stato: "attivo",
      conducente: "Alessandro Greco",
      kmStart: 158000,
      kmPerLiter: 8.4,
      prezzoLitro: 1.72,
      note: "Motore sostituito a 140.000 km — tenere monitorato.",
      assicurazioneIn: 26,
      revisioneIn: 44,
    },
    {
      targa: "GA558TV",
      marca: "Iveco",
      modello: "Daily 35S14",
      categoria: "furgone",
      anno: 2018,
      acq: "acquisto" as const,
      acquisto: { data: d(-2690), prezzo: 33200 },
      carburante: "diesel",
      stato: "in_manutenzione",
      conducente: "Roberto Esposito",
      kmStart: 171000,
      kmPerLiter: 7.6,
      prezzoLitro: 1.72,
      note: "In officina: frizione + volano. Rientro stimato fine settimana.",
      assicurazioneIn: 160,
      revisioneIn: 12, // URGENTE
    },
    {
      targa: "GL147ZN",
      marca: "Dacia",
      modello: "Duster 1.0 ECO-G",
      categoria: "auto",
      anno: 2022,
      acq: "acquisto" as const,
      acquisto: { data: d(-900), prezzo: 18750 },
      carburante: "gpl",
      stato: "attivo",
      conducente: "Sara Colombo",
      kmStart: 19500,
      kmPerLiter: 11.2,
      prezzoLitro: 0.74,
      assicurazioneIn: 310,
      revisioneIn: 540,
    },
    {
      targa: "GM863XA",
      marca: "Tesla",
      modello: "Model 3 RWD",
      categoria: "auto",
      anno: 2023,
      acq: "acquisto" as const,
      acquisto: { data: d(-540), prezzo: 42990 },
      carburante: "elettrico",
      stato: "attivo",
      conducente: "Direzione",
      kmStart: 14000,
      kmPerLiter: 0, // elettrico: nessun rifornimento carburante
      prezzoLitro: 0,
      note: "Ricarica presso colonnina sede. Consumo elettrico gestito a parte.",
      assicurazioneIn: 365,
      revisioneIn: 1100,
    },
    {
      targa: "FB296QH",
      marca: "Ford",
      modello: "Transit Custom 300",
      categoria: "furgone",
      anno: 2021,
      acq: "noleggio" as const,
      noleggio: {
        societa: "Arval",
        inizio: d(-800),
        fine: d(290),
        canone: 495,
        kmMassimi: 72000, // limite già superato
      },
      carburante: "diesel",
      stato: "attivo",
      conducente: "Paolo Marchetti",
      kmStart: 61000,
      kmPerLiter: 10.1,
      prezzoLitro: 1.72,
      assicurazioneIn: 76,
      revisioneIn: 340,
    },
    {
      targa: "EC672RB",
      marca: "Fiat",
      modello: "Panda 1.2 Easy",
      categoria: "auto",
      anno: 2016,
      acq: "acquisto" as const,
      acquisto: { data: d(-3300), prezzo: 11400 },
      carburante: "benzina",
      stato: "venduto",
      conducente: null,
      kmStart: 96000,
      kmPerLiter: 15.4,
      prezzoLitro: 1.8,
      note: "Venduta a febbraio. Pratica chiusa.",
      assicurazioneIn: -120,
      revisioneIn: -100,
      stopRefuels: true,
    },
    {
      targa: "GZ410WM",
      marca: "Renault",
      modello: "Kangoo 1.5 Blue dCi",
      categoria: "furgone",
      anno: 2020,
      acq: "noleggio" as const,
      noleggio: {
        societa: "Ayvens",
        inizio: d(-1420),
        fine: d(38), // FINE NOLEGGIO VICINA
        canone: 349,
        kmMassimi: 120000,
      },
      carburante: "diesel",
      stato: "attivo",
      conducente: "Francesco Riva",
      kmStart: 88000,
      kmPerLiter: 13.2,
      prezzoLitro: 1.72,
      note: "In scadenza di noleggio — valutare rinnovo o sostituzione.",
      assicurazioneIn: 200,
      revisioneIn: 150,
    },
  ];

  console.log("Inserimento mezzi...");
  const ids: number[] = [];

  for (const v of fleet) {
    const [row] = await db
      .insert(vehicles)
      .values({
        targa: v.targa,
        marca: v.marca,
        modello: v.modello,
        categoria: v.categoria,
        annoImmatricolazione: v.anno,
        tipoAcquisizione: v.acq,
        dataAcquisto: "acquisto" in v && v.acquisto ? v.acquisto.data : null,
        prezzoAcquisto:
          "acquisto" in v && v.acquisto ? eur(v.acquisto.prezzo) : null,
        societaNoleggio: v.noleggio?.societa ?? null,
        dataInizioNoleggio: v.noleggio?.inizio ?? null,
        dataFineNoleggio: v.noleggio?.fine ?? null,
        canoneMensile: v.noleggio ? eur(v.noleggio.canone) : null,
        kmMassimiContratto: v.noleggio?.kmMassimi ?? null,
        carburante: v.carburante,
        stato: v.stato,
        conducente: v.conducente,
        note: v.note ?? null,
        kmAttuali: v.kmStart, // aggiornato dopo i rifornimenti
      })
      .returning({ id: vehicles.id });
    ids.push(row.id);
  }

  // -------------------------------------------------------------------------
  // Rifornimenti: serie storica realistica negli ultimi ~7 mesi
  // -------------------------------------------------------------------------
  console.log("Inserimento rifornimenti...");
  const { sql } = await import("drizzle-orm");
  const kmFinali: number[] = fleet.map((v) => v.kmStart);

  for (let i = 0; i < fleet.length; i++) {
    const v = fleet[i];
    if (v.kmPerLiter === 0) continue; // elettrico

    let km = v.kmStart;
    let dayOffset = v.stopRefuels ? -290 : -205;
    const endOffset = v.stopRefuels ? -40 : -3;

    while (dayOffset < endOffset) {
      const stepKm = Math.round(rnd(750, 1350));
      km += stepKm;
      dayOffset += Math.round(rnd(12, 22));

      const litri = (stepKm / v.kmPerLiter) * rnd(0.94, 1.06);
      const prezzo = v.prezzoLitro * rnd(0.97, 1.05);

      await db.insert(refuels).values({
        vehicleId: ids[i],
        data: d(dayOffset),
        litri: litri.toFixed(2),
        costo: (litri * prezzo).toFixed(2),
        km,
      });
    }

    // aggiorna km attuali del mezzo
    kmFinali[i] = km + Math.round(rnd(80, 420));
    await db
      .update(vehicles)
      .set({ kmAttuali: kmFinali[i] })
      .where(sql`${vehicles.id} = ${ids[i]}`);
  }

  // -------------------------------------------------------------------------
  // Manutenzioni
  // -------------------------------------------------------------------------
  console.log("Inserimento manutenzioni...");
  const officine = [
    "Officina Rossi",
    "AutoService Milano",
    "Bosch Car Service",
    "Centro Gomme Verdi",
  ];

  type M = {
    vIdx: number;
    data: string;
    tipo: string;
    desc: string;
    km: number;
    costo: number;
    prossimoKm?: number | null;
    prossimaData?: string | null;
  };

  const man: M[] = [
    // Ducato (tagliando recente con prossima scadenza km)
    { vIdx: 0, data: d(-35), tipo: "tagliando", desc: "Tagliando 90.000 km: olio, filtri, controllo freni", km: 88000, costo: 342, prossimoKm: 115000, prossimaData: d(330) },
    { vIdx: 0, data: d(-240), tipo: "gomme", desc: "Treno gomme estive 215/70 R15C", km: 72000, costo: 615 },
    { vIdx: 0, data: d(-370), tipo: "tagliando", desc: "Tagliando 60.000 km", km: 60000, costo: 310 },
    // Golf — revisione scaduta!
    { vIdx: 1, data: d(-90), tipo: "freni", desc: "Pastiglie anteriori + dischi", km: 58000, costo: 280 },
    { vIdx: 1, data: d(-300), tipo: "tagliando", desc: "Tagliando 50.000 km", km: 50000, costo: 265, prossimoKm: 65000 },
    // Corolla
    { vIdx: 2, data: d(-60), tipo: "tagliando", desc: "Tagliando 30.000 km (ibrido)", km: 30000, costo: 248, prossimoKm: 45000, prossimaData: d(300) },
    // Sprinter
    { vIdx: 3, data: d(-15), tipo: "riparazione", desc: "Sostituzione cinghia servizi + tenditore", km: 209000, costo: 480 },
    { vIdx: 3, data: d(-150), tipo: "tagliando", desc: "Tagliando 200.000 km", km: 200000, costo: 395, prossimoKm: 220000 },
    { vIdx: 3, data: d(-320), tipo: "gomme", desc: "4 gomme + convergenza", km: 190000, costo: 690 },
    // Daily — in officina ora
    { vIdx: 4, data: d(-2), tipo: "riparazione", desc: "Kit frizione + volano bimassa (in corso)", km: 175900, costo: 1180 },
    { vIdx: 4, data: d(-200), tipo: "riparazione", desc: "Radiatore e tubazioni raffreddamento", km: 168000, costo: 540 },
    { vIdx: 4, data: d(-410), tipo: "revisione", desc: "Revisione ministeriale", km: 164000, costo: 79 },
    // Duster
    { vIdx: 5, data: d(-100), tipo: "tagliando", desc: "Tagliando 40.000 km + impianto GPL", km: 41000, costo: 295, prossimoKm: 55000 },
    // Tesla
    { vIdx: 6, data: d(-120), tipo: "altro", desc: "Rotazione pneumatici + check batteria", km: 31000, costo: 60 },
    // Transit
    { vIdx: 7, data: d(-45), tipo: "tagliando", desc: "Tagliando 95.000 km", km: 95000, costo: 330, prossimoKm: 115000 },
    { vIdx: 7, data: d(-280), tipo: "freni", desc: "Dischi e pastiglie anteriori", km: 84000, costo: 310 },
    // Panda (vecchia, venduta)
    { vIdx: 8, data: d(-400), tipo: "tagliando", desc: "Tagliando annuale", km: 132000, costo: 210 },
    // Kangoo
    { vIdx: 9, data: d(-70), tipo: "tagliando", desc: "Tagliando 115.000 km", km: 115000, costo: 285, prossimoKm: 135000 },
    { vIdx: 9, data: d(-350), tipo: "gomme", desc: "Gomme invernali", km: 102000, costo: 420 },
  ];

  for (const m of man) {
    await db.insert(maintenances).values({
      vehicleId: ids[m.vIdx],
      data: m.data,
      tipo: m.tipo,
      descrizione: m.desc,
      km: m.km,
      costo: eur(m.costo),
      officina: pick(officine),
      prossimoKm: m.prossimoKm ?? null,
      prossimaData: m.prossimaData ?? null,
    });
  }

  // -------------------------------------------------------------------------
  // Scadenze
  // -------------------------------------------------------------------------
  console.log("Inserimento scadenze...");
  for (let i = 0; i < fleet.length; i++) {
    const v = fleet[i];
    if (v.stato === "venduto") continue;

    await db.insert(deadlines).values({
      vehicleId: ids[i],
      tipo: "assicurazione",
      scadenza: d(v.assicurazioneIn),
      costo: eur(rnd(750, 1350)),
      note: v.assicurazioneIn < 30 ? "Rinnovo in scadenza — richiedere preventivo" : null,
    });

    await db.insert(deadlines).values({
      vehicleId: ids[i],
      tipo: "revisione",
      scadenza: d(v.revisioneIn),
      costo: eur(79),
      note: v.revisioneIn < 0 ? "REVISIONE SCADUTA — prenotare subito" : null,
    });

    if (v.acq === "acquisto") {
      await db.insert(deadlines).values({
        vehicleId: ids[i],
        tipo: "bollo",
        scadenza: d(rnd(60, 200)),
        costo: eur(rnd(160, 330)),
      });
    }

    if (v.acq === "noleggio" && v.noleggio) {
      await db.insert(deadlines).values({
        vehicleId: ids[i],
        tipo: "noleggio",
        scadenza: v.noleggio.fine,
        note:
          v.noleggio.fine < d(90)
            ? "Fine contratto vicina: decidere rinnovo/sostituzione"
            : "Fine contratto di noleggio",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Diario autisti mensile (ultimi 3 mesi) per i furgoni a noleggio
  // -------------------------------------------------------------------------
  console.log("Inserimento diario autisti...");
  const oggi = new Date();
  for (const i of [0, 7, 9]) {
    const v = fleet[i];
    let fine = kmFinali[i];
    for (let k = 0; k < 3; k++) {
      const mese = new Date(oggi.getFullYear(), oggi.getMonth() - k, 1);
      const percorsi = Math.round(rnd(1500, 2300));
      await db.insert(driverLogs).values({
        vehicleId: ids[i],
        data: `${mese.getFullYear()}-${String(mese.getMonth() + 1).padStart(2, "0")}-01`,
        conducente: v.conducente ?? "Autista",
        kmInizio: fine - percorsi,
        kmFine: fine,
        note: k === 0 ? "Mese in corso" : null,
      });
      fine -= percorsi;
    }
  }

  const count = await db.select().from(vehicles);
  console.log(`Seed completato: ${count.length} mezzi inseriti.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore nel seed:", err);
  process.exit(1);
});
