import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncRegistroAutisti } from "@/lib/sync-autisti";

export const dynamic = "force-dynamic";

/** Sincronizza il registro autisti (Foglio online, oppure testo/file inviato come in /api/sync) */
export async function POST(req: Request) {
  try {
    let testo: string | undefined;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      if (body.text) testo = body.text;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (file && typeof file === "object" && "text" in file) testo = await (file as Blob).text();
    }
    const result = await syncRegistroAutisti(testo);
    revalidatePath("/");
    revalidatePath("/mezzi");
    revalidatePath("/manutenzioni");
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
