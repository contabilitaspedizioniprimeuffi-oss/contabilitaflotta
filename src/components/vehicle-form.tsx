"use client";

import { Building2, Loader2, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode, type FormEvent } from "react";
import type { Vehicle } from "@/db/schema";

// ─── tipi ────────────────────────────────────────────────────────────────────

type TipoAcq = "acquisto" | "noleggio" | "leasing" | "riscatto";

// ─── piccoli componenti interni ───────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="col-span-full mt-2 flex items-center gap-3 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-ink-950">
      {children}
      <span className="h-px flex-1 bg-line" />
    </h2>
  );
}

// ─── componente principale ────────────────────────────────────────────────────

export default function VehicleForm({
  initial,
  cancelHref,
}: {
  initial?: Vehicle;
  cancelHref: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoAcq>(
    (initial?.tipoAcquisizione as TipoAcq) || "acquisto"
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const fd = new FormData(e.currentTarget);
      // Assicuriamoci che il tipo sia sempre nel form
      fd.set("tipoAcquisizione", tipo);

      const url = initial
        ? `/api/vehicles?id=${initial.id}`
        : "/api/vehicles";

      const method = initial ? "PATCH" : "POST";

      const res = await fetch(url, { method, body: fd });
      const data = await res.json() as { ok: boolean; id?: number; error?: string };

      if (!data.ok) {
        setError(data.error ?? "Errore sconosciuto durante il salvataggio.");
        return;
      }

      // Redirect alla scheda del mezzo
      router.push(`/mezzi/${data.id}`);
      router.refresh();

    } catch (err) {
      setError("Errore di rete. Riprova.");
      console.error(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mx-auto max-w-3xl p-6 sm:p-8">

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SectionTitle>Identificazione</SectionTitle>

        {/* Targa */}
        <Field label="Targa *">
          <input
            className="input font-mono font-bold uppercase tracking-widest"
            name="targa"
            defaultValue={initial?.targa}
            placeholder="AB123CD"
            required
          />
        </Field>

        {/* Categoria */}
        <Field label="Categoria">
          <select className="input" name="categoria" defaultValue={initial?.categoria ?? "auto"}>
            <option value="auto">Auto</option>
            <option value="furgone">Furgone</option>
            <option value="camion">Camion</option>
            <option value="altro">Altro</option>
          </select>
        </Field>

        {/* Marca */}
        <Field label="Marca *">
          <input
            className="input"
            name="marca"
            defaultValue={initial?.marca}
            placeholder="Fiat"
            required
          />
        </Field>

        {/* Modello */}
        <Field label="Modello *">
          <input
            className="input"
            name="modello"
            defaultValue={initial?.modello}
            placeholder="Ducato 35"
            required
          />
        </Field>

        {/* Anno */}
        <Field label="Anno immatricolazione">
          <input
            className="input font-mono"
            type="number"
            name="annoImmatricolazione"
            min={1980}
            max={2040}
            defaultValue={initial?.annoImmatricolazione ?? undefined}
            placeholder="es. 2022"
          />
        </Field>

        {/* Alimentazione */}
        <Field label="Alimentazione">
          <select className="input" name="carburante" defaultValue={initial?.carburante ?? "diesel"}>
            <option value="diesel">Diesel</option>
            <option value="benzina">Benzina</option>
            <option value="gpl">GPL</option>
            <option value="metano">Metano</option>
            <option value="ibrido">Ibrido</option>
            <option value="elettrico">Elettrico</option>
          </select>
        </Field>

        {/* Checkbox Telepass + Sostitutivo */}
        <div className="col-span-full flex flex-wrap gap-6 rounded-2xl bg-paper p-4">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="hasTelepass"
              defaultChecked={!!initial?.hasTelepass}
              className="h-5 w-5 accent-volt-500"
            />
            <span className="text-sm font-bold uppercase tracking-wide">Dotato di Telepass</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="isReplacement"
              defaultChecked={!!initial?.isReplacement}
              className="h-5 w-5 accent-danger"
            />
            <span className="text-sm font-bold uppercase tracking-wide text-danger">
              Mezzo sostitutivo
            </span>
          </label>
        </div>

        {/* ── Tipo acquisizione ── */}
        <SectionTitle>Acquisizione</SectionTitle>

        <div className="col-span-full grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { id: "acquisto", label: "Acquisto", icon: ShoppingBag },
              { id: "noleggio", label: "Noleggio", icon: Building2 },
              { id: "leasing", label: "Leasing", icon: Building2 },
              { id: "riscatto", label: "Riscatto", icon: ShoppingBag },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 px-2 py-3 text-[11px] font-bold uppercase transition-all ${
                tipo === t.id
                  ? "border-ink-950 bg-ink-950 text-volt-500"
                  : "border-line bg-paper text-mute hover:border-ink-950/30"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Campi condizionali acquisizione */}
        {(tipo === "acquisto" || tipo === "riscatto") && (
          <>
            <Field label={tipo === "acquisto" ? "Data acquisto" : "Data riscatto"}>
              <input
                className="input"
                type="date"
                name="dataAcquisto"
                defaultValue={initial?.dataAcquisto ?? undefined}
              />
            </Field>
            {tipo === "acquisto" ? (
              <Field label="Prezzo acquisto (€)">
                <input
                  className="input font-mono"
                  type="number"
                  name="prezzoAcquisto"
                  step="0.01"
                  min={0}
                  defaultValue={initial?.prezzoAcquisto ?? undefined}
                  placeholder="es. 26.450"
                />
              </Field>
            ) : (
              <Field label="Prezzo riscatto (€)">
                <input
                  className="input font-mono"
                  type="number"
                  name="prezzoRiscatto"
                  step="0.01"
                  min={0}
                  defaultValue={initial?.prezzoRiscatto ?? undefined}
                />
              </Field>
            )}
          </>
        )}

        {(tipo === "noleggio" || tipo === "leasing") && (
          <>
            <Field label="Società">
              <input
                className="input"
                name="societaNoleggio"
                defaultValue={initial?.societaNoleggio ?? undefined}
                placeholder="Arval, Leasys..."
              />
            </Field>
            <Field label="N. Contratto">
              <input
                className="input font-mono"
                name="numeroContratto"
                defaultValue={initial?.numeroContratto ?? undefined}
              />
            </Field>
            <Field label="Canone mensile (€)">
              <input
                className="input font-mono"
                type="number"
                name="canoneMensile"
                step="0.01"
                min={0}
                defaultValue={initial?.canoneMensile ?? undefined}
              />
            </Field>
            <Field label="Inizio contratto">
              <input
                className="input"
                type="date"
                name="dataInizioNoleggio"
                defaultValue={initial?.dataInizioNoleggio ?? undefined}
              />
            </Field>
            <Field label="Fine contratto">
              <input
                className="input"
                type="date"
                name="dataFineNoleggio"
                defaultValue={initial?.dataFineNoleggio ?? undefined}
              />
            </Field>
            <Field label="Km massimi da contratto">
              <input
                className="input font-mono"
                type="text"
                inputMode="numeric"
                name="kmMassimiContratto"
                placeholder="Es. 120.000"
                defaultValue={
                  initial?.kmMassimiContratto
                    ? new Intl.NumberFormat("it-IT").format(initial.kmMassimiContratto)
                    : undefined
                }
              />
              <p className="mt-1 text-[11px] text-mute">Limite di km previsto dal contratto (contachilometri).</p>
            </Field>
          </>
        )}

        {/* ── Stato e utilizzo ── */}
        <SectionTitle>Stato e utilizzo</SectionTitle>

        <Field label="Stato">
          <select className="input" name="stato" defaultValue={initial?.stato ?? "attivo"}>
            <option value="attivo">Attivo</option>
            <option value="in_manutenzione">In manutenzione</option>
            <option value="fermo">Fermo</option>
            <option value="venduto">Venduto</option>
          </select>
        </Field>

        <Field label="Chilometri attuali">
          <input
            className="input font-mono"
            type="number"
            name="kmAttuali"
            min={0}
            defaultValue={initial?.kmAttuali ?? 0}
          />
        </Field>

        <Field label="Autista abituale">
          <input
            className="input"
            name="conducente"
            defaultValue={initial?.conducente ?? undefined}
            placeholder="Nome e Cognome"
          />
        </Field>

        <div className="col-span-full">
          <Field label="Note interne">
            <textarea
              className="input min-h-24 resize-y py-3"
              name="note"
              defaultValue={initial?.note ?? undefined}
              placeholder="Annotazioni libere..."
            />
          </Field>
        </div>
      </div>

      {/* Errore */}
      {error ? (
        <div className="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          ⚠️ {error}
        </div>
      ) : null}

      {/* Bottoni */}
      <div className="mt-8 flex items-center justify-end gap-3 border-t border-line pt-5">
        <a href={cancelHref} className="btn-ghost">
          Annulla
        </a>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvataggio…
            </>
          ) : (
            initial ? "Salva modifiche" : "Registra mezzo"
          )}
        </button>
      </div>
    </form>
  );
}
