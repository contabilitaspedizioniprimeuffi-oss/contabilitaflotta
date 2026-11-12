import test from "node:test";
import assert from "node:assert/strict";
import {
  MARCA_REGISTRO,
  estraiScheda,
  leggiUscitaAutisti,
  pianoImportazione,
  statoMezzo,
  tipoManutenzione,
} from "../src/lib/registro-autisti";

// Dati finti: targhe e nomi inventati, come li produce la scheda USCITA_AUTISTI del registro
const INTESTAZIONE = "TIPO\tDATA\tTARGA\tAUTISTA_1\tAUTISTA_2\tSTATO\tCAUSALE\tTARGA_SOSTITUTIVA\tNOTE\tORIGINE";
const TESTO = [
  "--- RIEPILOGO ---",
  "roba\tdi\taltre\tschede",
  "--- USCITA_AUTISTI ---",
  INTESTAZIONE,
  "STATO\t2026-10-01\tAA111AA\t\t\tIN SERVIZIO\t\t\tda storico\tSTATI MEZZI",
  "PRESENZA\t2026-10-01\tAA111AA\tMARIO ROSSI\tLUCA BIANCHI\t\t\t\tpomeriggio\tPAGINA",
  "PRESENZA\t2026-10-02\tAA111AA\tMARIO ROSSI\t\t\t\t\t\tPAGINA",
  "STATO\t2026-10-06\tAA111AA\t\t\tMANUTENZIONE\tFRENI\tSS000SS\tofficina X\tSTATI MEZZI",
  "PRESENZA\t2026-10-07\tAA111AA\tLUCA BIANCHI\t\tMANUTENZIONE\tFRENI\tSS000SS\tsu sostitutiva SS000SS\tPAGINA",
  "STATO\t2026-10-09\tAA111AA\t\t\tIN SERVIZIO\t\t\t\tSTATI MEZZI",
  "STATO\t2026-11-10\tAA111AA\t\t\tFERMO\t\t\t\tSTATI MEZZI",
  "STATO\t2026-12-24\tAA111AA\t\t\tVENDUTO\t\t\tfuturo: non conta oggi\tSTATI MEZZI",
  "PRESENZA\t2026-10-02\tAA000AA\tCORRIERE GENERICO\t\tIN SERVIZIO\t\t\ttarga generica: non indicata\tNOLEGGI",
  "PRESENZA\t2026-10-03\tBB222BB\tANNA VERDI\t\t\t\t\t\tNOLEGGI",
  "PRESENZA\t02/10/2026\tAA111AA\tMARIO ROSSI\t\t\t\t\tdata nel formato sbagliato\tPAGINA",
  "BOH\t2026-10-02\tAA111AA\tMARIO ROSSI\t\t\t\t\ttipo sconosciuto\tPAGINA",
  "PRESENZA\t2026-10-02\tNONTARGA\tMARIO ROSSI\t\t\t\t\ttarga sbagliata\tPAGINA",
  "",
  "--- ALTRA ---",
  "PRESENZA\t2026-10-02\tCC333CC\tNON DEVE ENTRARE\t\t\t\t\t\tPAGINA",
].join("\n");

test("estraiScheda: solo la scheda USCITA_AUTISTI, null se manca", () => {
  const s = estraiScheda(TESTO);
  assert.ok(s);
  assert.equal(s![0], INTESTAZIONE);
  assert.ok(!s!.some((r) => r.includes("NON DEVE ENTRARE")));
  assert.equal(estraiScheda("--- RIEPILOGO ---\na\tb\n"), null);
});

test("leggiUscitaAutisti: colonne dall'intestazione, righe non valide scartate, targhe pulite", () => {
  const { righe, scartate } = leggiUscitaAutisti(TESTO);
  assert.equal(scartate, 3);
  assert.equal(righe.length, 10);
  assert.deepEqual(righe[3], {
    tipo: "STATO", data: "2026-10-06", targa: "AA111AA", autista1: "", autista2: "", stato: "MANUTENZIONE",
    causale: "FRENI", targaSostitutiva: "SS000SS", note: "officina X", origine: "STATI MEZZI",
  });
  // colonne in un altro ordine: si leggono lo stesso
  const altro = ["--- USCITA_AUTISTI ---", "TARGA\tDATA\tTIPO\tAUTISTA_2\tAUTISTA_1\tNOTE\tORIGINE\tSTATO\tCAUSALE\tTARGA_SOSTITUTIVA",
    "aa 111 aa\t2026-10-01\tpresenza\tB\tA\tn\tPAGINA\t\t\t"].join("\n");
  const r2 = leggiUscitaAutisti(altro).righe[0];
  assert.equal(r2.targa, "AA111AA"); assert.equal(r2.autista1, "A"); assert.equal(r2.autista2, "B"); assert.equal(r2.tipo, "PRESENZA");
  assert.throws(() => leggiUscitaAutisti("--- RIEPILOGO ---\nx"), /USCITA_AUTISTI/);
  assert.throws(() => leggiUscitaAutisti("--- USCITA_AUTISTI ---\nTIPO\tDATA\n"), /mancano le colonne/);
});

test("tipoManutenzione e statoMezzo: valori delle tendine del programma", () => {
  assert.equal(tipoManutenzione("FRENI"), "freni"); assert.equal(tipoManutenzione("gomme"), "gomme"); assert.equal(tipoManutenzione("TAGLIANDO"), "tagliando");
  assert.equal(tipoManutenzione("MOTORE"), "riparazione"); assert.equal(tipoManutenzione("BATTERIA"), "riparazione"); assert.equal(tipoManutenzione(""), "altro");
  assert.equal(statoMezzo("MANUTENZIONE"), "in_manutenzione"); assert.equal(statoMezzo("FERMO"), "fermo");
  assert.equal(statoMezzo("VENDUTO"), "venduto"); assert.equal(statoMezzo("ROTTAMATO"), "venduto");
  assert.equal(statoMezzo("IN SERVIZIO"), "attivo"); assert.equal(statoMezzo("NOLEGGIO"), "attivo"); assert.equal(statoMezzo(""), "attivo");
});

test("pianoImportazione: diario per autista, manutenzioni con periodo, stato corrente (future ignorate), sostitutive, NOLEGGI senza pagina", () => {
  const { righe } = leggiUscitaAutisti(TESTO);
  const piano = pianoImportazione(righe, "2026-11-12");
  const a = piano.get("AA111AA")!;
  assert.ok(a.haPagina);
  assert.deepEqual(a.diario.map((d) => [d.data, d.conducente]), [
    ["2026-10-01", "MARIO ROSSI"], ["2026-10-01", "LUCA BIANCHI"], ["2026-10-02", "MARIO ROSSI"], ["2026-10-07", "LUCA BIANCHI"],
  ]);
  assert.equal(a.diario[0].note, `${MARCA_REGISTRO} pomeriggio`);
  assert.equal(a.diario[2].note, MARCA_REGISTRO);
  assert.equal(a.diario[3].note, `${MARCA_REGISTRO} MANUTENZIONE · FRENI · sostitutiva SS000SS · su sostitutiva SS000SS`);
  assert.deepEqual(a.manutenzioni, [{
    data: "2026-10-06", tipo: "freni", descrizione: `${MARCA_REGISTRO} Manutenzione · FRENI`,
    dettaglioLavori: "sostitutiva SS000SS · officina X", fineAl: "2026-10-09",
  }]);
  assert.equal(a.stato, "fermo"); assert.equal(a.statoDal, "2026-11-10");   // VENDUTO del 24/12 è nel futuro
  assert.deepEqual(a.sostitutive, ["SS000SS"]);
  // pagina NOLEGGI: targa generica e targa sconosciuta non hanno una pagina
  const g = piano.get("AA000AA")!;
  assert.ok(!g.haPagina); assert.equal(g.diario.length, 1); assert.match(g.diario[0].note, /pagina NOLEGGI/);
  assert.ok(!piano.get("BB222BB")!.haPagina);
  // manutenzione ancora in corso: fineAl null, stato in_manutenzione
  const p2 = pianoImportazione(leggiUscitaAutisti(["--- USCITA_AUTISTI ---", INTESTAZIONE,
    "STATO\t2026-11-01\tCC333CC\t\t\tMANUTENZIONE\tGOMME\t\t\tSTATI MEZZI"].join("\n")).righe, "2026-11-12").get("CC333CC")!;
  assert.equal(p2.manutenzioni[0].fineAl, null); assert.equal(p2.manutenzioni[0].tipo, "gomme"); assert.equal(p2.stato, "in_manutenzione");
});
