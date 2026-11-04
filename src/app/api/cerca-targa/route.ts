import { NextResponse } from "next/server";
import { listVehicles } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Elenco leggero dei mezzi per la lente «Cerca targa» */
export async function GET() {
  const mezzi = await listVehicles();
  return NextResponse.json(
    mezzi.map((m) => ({
      id: m.id,
      targa: m.targa,
      marca: m.marca,
      modello: m.modello,
      conducente: m.conducente,
      stato: m.stato,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
