import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  idFoglioAutisti,
  indirizzoFoglioAutisti,
  indirizzoValido,
  infoCopiaLocaleAutisti,
  linkFoglioAutisti,
  mascheraIndirizzo,
  normalizzaIndirizzo,
  salvaIndirizzoFoglioAutisti,
  scaricaFoglioAutisti,
} from "@/lib/foglio-autisti";

export const dynamic = "force-dynamic";

const SEGNAPOSTO_ID = "INSERISCI_QUI_L_ID_DEL_FOGLIO_AUTISTI";

/** Codice della seconda antenna, con l'ID del Foglio (GOOGLE_SHEET_ID_AUTISTI in .env) già inserito se c'è */
function codiceScript(): string | null {
  try {
    const codice = fs.readFileSync(path.resolve(process.cwd(), "strumenti", "foglio-google-autisti.gs"), "utf-8");
    const id = idFoglioAutisti();
    return id ? codice.replace(SEGNAPOSTO_ID, id) : codice;
  } catch {
    return null;
  }
}

/** Stato del collegamento al registro autisti (con ?codice=1 anche il codice dell'antenna) */
export async function GET(req: Request) {
  const url = indirizzoFoglioAutisti();
  const conCodice = new URL(req.url).searchParams.get("codice") === "1";
  return NextResponse.json({
    collegato: !!url,
    indirizzo: url ? mascheraIndirizzo(url) : null,
    copia: infoCopiaLocaleAutisti(),
    linkFoglio: linkFoglioAutisti(),
    ...(conCodice ? { codice: codiceScript(), codiceSenzaId: !idFoglioAutisti() } : {}),
  });
}

/** Prova l'indirizzo dell'antenna e, se funziona, lo salva in .env.local */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { indirizzo?: unknown };
  const url = normalizzaIndirizzo(String(body.indirizzo ?? ""));
  if (!indirizzoValido(url)) {
    return NextResponse.json(
      { ok: false, errore: "Indirizzo non valido: deve essere quello dell'app web, che inizia con https://script.google.com/ e finisce con /exec." },
      { status: 400 },
    );
  }
  const r = await scaricaFoglioAutisti(url, 90_000);
  if (!r.ok) return NextResponse.json({ ok: false, errore: `Collegamento non riuscito: ${r.errore}.` }, { status: 422 });
  try {
    salvaIndirizzoFoglioAutisti(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, errore: `Impossibile salvare l'indirizzo: ${msg}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, righe: r.righe, messaggio: `Registro autisti collegato: lette ${r.righe} righe.` });
}

/** Scollega il registro autisti (toglie l'indirizzo da .env.local) */
export async function DELETE() {
  try {
    salvaIndirizzoFoglioAutisti(null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, errore: msg }, { status: 500 });
  }
}
