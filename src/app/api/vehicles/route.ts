import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vehicles } from "@/db/schema";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function num(fd: FormData, key: string): string | null {
  const s = str(fd, key);
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

function int(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function buildValues(fd: FormData) {
  const targa = str(fd, "targa")?.toUpperCase().replace(/\s+/g, "");
  const marca = str(fd, "marca");
  const modello = str(fd, "modello");

  if (!targa) throw new Error("La targa è obbligatoria.");
  if (!marca) throw new Error("La marca è obbligatoria.");
  if (!modello) throw new Error("Il modello è obbligatorio.");

  const tipoAcquisizione = str(fd, "tipoAcquisizione") || "acquisto";
  const hasTelepass = fd.get("hasTelepass") === "on" ? 1 : 0;
  const isReplacement = fd.get("isReplacement") === "on" ? 1 : 0;
  const isNoleggioOrLeasing = tipoAcquisizione === "noleggio" || tipoAcquisizione === "leasing";
  const isAcquistoOrRiscatto = tipoAcquisizione === "acquisto" || tipoAcquisizione === "riscatto";

  return {
    targa,
    marca,
    modello,
    categoria: str(fd, "categoria") ?? "auto",
    annoImmatricolazione: int(fd, "annoImmatricolazione"),
    tipoAcquisizione,
    numeroContratto: str(fd, "numeroContratto"),
    hasTelepass,
    isReplacement,
    carburante: str(fd, "carburante") ?? "diesel",
    kmAttuali: int(fd, "kmAttuali") ?? 0,
    stato: str(fd, "stato") ?? "attivo",
    conducente: str(fd, "conducente"),
    note: str(fd, "note"),
    dataAcquisto: isAcquistoOrRiscatto ? str(fd, "dataAcquisto") : null,
    prezzoAcquisto: tipoAcquisizione === "acquisto" ? num(fd, "prezzoAcquisto") : null,
    prezzoRiscatto: tipoAcquisizione === "riscatto" ? num(fd, "prezzoRiscatto") : null,
    societaNoleggio: isNoleggioOrLeasing ? str(fd, "societaNoleggio") : null,
    dataInizioNoleggio: isNoleggioOrLeasing ? str(fd, "dataInizioNoleggio") : null,
    dataFineNoleggio: isNoleggioOrLeasing ? str(fd, "dataFineNoleggio") : null,
    canoneMensile: isNoleggioOrLeasing ? num(fd, "canoneMensile") : null,
  };
}

// POST /api/vehicles  → crea nuovo veicolo
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const values = buildValues(fd);

    const [row] = await db.insert(vehicles).values(values).returning({ id: vehicles.id });

    revalidatePath("/");
    revalidatePath("/mezzi");

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isDupe = msg.includes("unique") || msg.includes("duplicate");
    return NextResponse.json(
      { ok: false, error: isDupe ? "Targa già presente in flotta." : msg },
      { status: 400 }
    );
  }
}

// PATCH /api/vehicles?id=X  → aggiorna veicolo esistente
export async function PATCH(req: NextRequest) {
  try {
    const idParam = req.nextUrl.searchParams.get("id");
    const vehicleId = idParam ? parseInt(idParam, 10) : NaN;
    if (!Number.isFinite(vehicleId)) {
      return NextResponse.json({ ok: false, error: "ID non valido." }, { status: 400 });
    }

    const fd = await req.formData();
    const values = buildValues(fd);

    await db.update(vehicles).set(values).where(eq(vehicles.id, vehicleId));

    revalidatePath("/");
    revalidatePath("/mezzi");
    revalidatePath(`/mezzi/${vehicleId}`);

    return NextResponse.json({ ok: true, id: vehicleId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isDupe = msg.includes("unique") || msg.includes("duplicate");
    return NextResponse.json(
      { ok: false, error: isDupe ? "Targa già presente in flotta." : msg },
      { status: 400 }
    );
  }
}
