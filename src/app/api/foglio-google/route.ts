import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  idFoglio,
  indirizzoFoglio,
  indirizzoValido,
  infoCopiaLocale,
  linkFoglio,
  mascheraIndirizzo,
  normalizzaIndirizzo,
  salvaIndirizzoFoglio,
  scaricaFoglio,
} from "@/lib/foglio-google";

export const dynamic = "force-dynamic";

const SEGNAPOSTO_ID = "INSERISCI_QUI_L_ID_DEL_FOGLIO";

/** Codice dell'antenna, con l'ID del Foglio (dal file .env del PC) gia' inserito */
function codiceScript(): string | null {
  try {
    const codice = fs.readFileSync(path.resolve(process.cwd(), "strumenti", "foglio-google.gs"), "utf-8");
    const id = idFoglio();
    return id ? codice.replace(SEGNAPOSTO_ID, id) : codice;
  } catch {
    return null;
  }
}

/** Stato del collegamento (con ?codice=1 anche il codice da incollare nel Foglio) */
export async function GET(req: Request) {
  const url = indirizzoFoglio();
  const conCodice = new URL(req.url).searchParams.get("codice") === "1";
  return NextResponse.json({
    collegato: !!url,
    indirizzo: url ? mascheraIndirizzo(url) : null,
    copia: infoCopiaLocale(),
    linkFoglio: linkFoglio(),
    ...(conCodice ? { codice: codiceScript(), codiceSenzaId: !idFoglio() } : {}),
  });
}

/** Prova l'indirizzo e, se funziona, lo salva in .env.local */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { indirizzo?: unknown };
  const url = normalizzaIndirizzo(String(body.indirizzo ?? ""));
  if (!indirizzoValido(url)) {
    return NextResponse.json(
      {
        ok: false,
        errore:
          "Indirizzo non valido: deve essere quello dell'app web, che inizia con https://script.google.com/ e finisce con /exec.",
      },
      { status: 400 },
    );
  }
  const r = await scaricaFoglio(url, 90_000);
  if (!r.ok) {
    return NextResponse.json({ ok: false, errore: `Collegamento non riuscito: ${r.errore}.` }, { status: 422 });
  }
  try {
    salvaIndirizzoFoglio(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, errore: `Impossibile salvare l'indirizzo: ${msg}` }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    schede: r.schede,
    messaggio: `Foglio Google collegato: lette ${r.schede} schede. Ora «Sincronizza» usa sempre i dati aggiornati.`,
  });
}

/** Scollega il Foglio (toglie l'indirizzo da .env.local) */
export async function DELETE() {
  try {
    salvaIndirizzoFoglio(null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, errore: msg }, { status: 500 });
  }
}
