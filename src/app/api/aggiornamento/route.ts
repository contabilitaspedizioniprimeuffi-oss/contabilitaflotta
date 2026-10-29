import { NextResponse } from "next/server";
import { controllaAggiornamenti, richiediAggiornamento } from "@/lib/aggiornamento";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Stato della sincronizzazione con GitHub (?forza=1 per ricontrollare subito)
export async function GET(req: Request) {
  const forza = new URL(req.url).searchParams.get("forza") === "1";
  const stato = await controllaAggiornamenti(forza);
  return NextResponse.json(stato, { headers: { "Cache-Control": "no-store" } });
}

// Installa l'ultima versione pubblicata su GitHub
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const esito = richiediAggiornamento(Boolean(body?.forza));
  return NextResponse.json(esito, { status: esito.ok ? 200 : 409 });
}
