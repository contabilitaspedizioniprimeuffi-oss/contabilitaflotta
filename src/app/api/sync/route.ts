import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncFromSheetData } from "@/lib/sync-engine";
import { clearAllData } from "@/db/clear";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let customText: string | undefined;
    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      if (body.text) customText = body.text;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (file && typeof file === "object" && "text" in file) {
        customText = await (file as Blob).text();
      }
    }

    const result = await syncFromSheetData(customText);

    revalidatePath("/");
    revalidatePath("/mezzi");
    revalidatePath("/rifornimenti");
    revalidatePath("/scadenze");
    revalidatePath("/manutenzioni");

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearAllData();

    revalidatePath("/");
    revalidatePath("/mezzi");
    revalidatePath("/rifornimenti");
    revalidatePath("/scadenze");

    return NextResponse.json({ success: true, message: "Dati eliminati con successo." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
