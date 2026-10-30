"use client";

import {
  CalendarClock,
  CheckCircle2,
  Fuel,
  Loader2,
  Pencil,
  Plus,
  Siren,
  Trash2,
  User,
  Wrench,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Deadline, DriverLog, Fine, Maintenance, Refuel } from "@/db/schema";
import {
  addDeadline,
  addDriverLog,
  addFine,
  addFineFromSelect,
  addMaintenance,
  addRefuel,
  deleteDriverLog,
  deleteFine,
  toggleFinePaid,
  updateDeadline,
  updateFine,
  updateMaintenance,
  updateRefuel,
  type FormResult,
} from "@/lib/actions";
import { currentMonthKey, fmtNum } from "@/lib/format";

// ---------------------------------------------------------------------------
// Guscio modale
// ---------------------------------------------------------------------------

function ModalShell({
  title,
  icon: Icon,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  icon: any;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink-950/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`relative w-full animate-rise overflow-hidden rounded-[24px] border border-line bg-card shadow-2xl ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-line px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-950 text-volt-500">
            <Icon className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <h3 className="font-display text-base font-extrabold uppercase tracking-tight">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full hover:bg-ink-950/5 text-mute transition-colors hover:text-ink-950"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function SubmitRow({
  pending,
  onClose,
  cta,
}: {
  pending: boolean;
  onClose: () => void;
  cta: string;
}) {
  return (
    <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
      <button type="button" onClick={onClose} className="btn-ghost" disabled={pending}>
        Annulla
      </button>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Salvataggio…" : cta}
      </button>
    </div>
  );
}

function ErrorBox({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger">
      {msg}
    </p>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// RIFORNIMENTO (aggiungi / modifica)
// ---------------------------------------------------------------------------

function RefuelForm({
  vehicleId,
  initial,
  onClose,
}: {
  vehicleId: number;
  initial?: Refuel;
  onClose: () => void;
}) {
  const action: (p: FormResult, fd: FormData) => Promise<FormResult> = initial
    ? updateRefuel.bind(null, initial.id)
    : addRefuel.bind(null, vehicleId);
  const [state, formAction, pending] = useActionState(action, { ok: false } as FormResult);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Data">
          <input className="input" type="date" name="data" defaultValue={initial?.data ?? todayIso()} required />
        </Field>
        <Field label="Chilometri attuali">
          <input className="input font-mono" type="number" name="km" min={0} step={1} defaultValue={initial?.km ?? undefined} placeholder="es. 88.450" required />
        </Field>
        <Field label="Litri">
          <input className="input font-mono" type="number" name="litri" min={0.1} step="0.01" defaultValue={initial?.litri ?? undefined} placeholder="es. 52,4" required />
        </Field>
        <Field label="Importo totale (€)">
          <input className="input font-mono" type="number" name="costo" min={0} step="0.01" defaultValue={initial?.costo ?? undefined} placeholder="es. 90,10" required />
        </Field>
      </div>
      <ErrorBox msg={state.error} />
      <SubmitRow pending={pending} onClose={onClose} cta={initial ? "Salva modifiche" : "Salva rifornimento"} />
    </form>
  );
}

export function AddRefuelDialog({ vehicleId }: { vehicleId: number }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary">
        <Plus className="h-4 w-4" strokeWidth={2.6} /> Rifornimento
      </button>
      {open ? (
        <ModalShell title="Nuovo rifornimento" icon={Fuel} onClose={close}>
          <RefuelForm vehicleId={vehicleId} onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

export function EditRefuelButton({ initial }: { initial: Refuel }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink-950/5 hover:text-ink-950" title="Modifica">
        <Pencil className="h-4 w-4" />
      </button>
      {open ? (
        <ModalShell title="Modifica rifornimento" icon={Fuel} onClose={close}>
          <RefuelForm vehicleId={initial.vehicleId} initial={initial} onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// MANUTENZIONE (aggiungi / modifica)
// ---------------------------------------------------------------------------

function MaintenanceForm({
  vehicleId,
  initial,
  onClose,
}: {
  vehicleId: number;
  initial?: Maintenance;
  onClose: () => void;
}) {
  const action: (p: FormResult, fd: FormData) => Promise<FormResult> = initial
    ? updateMaintenance.bind(null, initial.id)
    : addMaintenance.bind(null, vehicleId);
  const [state, formAction, pending] = useActionState(action, { ok: false } as FormResult);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Data">
          <input className="input" type="date" name="data" defaultValue={initial?.data ?? todayIso()} required />
        </Field>
        <Field label="Tipo intervento">
          <select className="input" name="tipo" defaultValue={initial?.tipo ?? "tagliando"}>
            <option value="tagliando">Tagliando</option>
            <option value="gomme">Gomme</option>
            <option value="freni">Freni</option>
            <option value="riparazione">Riparazione</option>
            <option value="revisione">Revisione</option>
            <option value="altro">Altro</option>
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Descrizione (Titolo)">
            <input className="input" type="text" name="descrizione" defaultValue={initial?.descrizione ?? undefined} placeholder="es. Tagliando annuale" />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Dettaglio Lavori (Cosa è stato aggiustato)">
            <textarea className="input min-h-20 py-2" name="dettaglioLavori" defaultValue={initial?.dettaglioLavori ?? undefined} placeholder="es. Sostituzione pastiglie, cambio olio, filtro aria..." />
          </Field>
        </div>
        <Field label="Km all'intervento">
          <input className="input font-mono" type="number" name="km" min={0} step={1} defaultValue={initial?.km ?? undefined} />
        </Field>
        <Field label="Costo (€)">
          <input className="input font-mono" type="number" name="costo" min={0} step="0.01" defaultValue={initial?.costo ?? undefined} />
        </Field>
        <div className="col-span-2">
          <Field label="Officina">
            <input className="input" type="text" name="officina" defaultValue={initial?.officina ?? undefined} placeholder="es. Officina Rossi" />
          </Field>
        </div>
        <Field label="Prossimo intervento a km">
          <input className="input font-mono" type="number" name="prossimoKm" min={0} step={1} defaultValue={initial?.prossimoKm ?? undefined} placeholder="opzionale" />
        </Field>
        <Field label="Prossimo intervento il">
          <input className="input" type="date" name="prossimaData" defaultValue={initial?.prossimaData ?? undefined} />
        </Field>
      </div>
      <ErrorBox msg={state.error} />
      <SubmitRow pending={pending} onClose={onClose} cta={initial ? "Salva modifiche" : "Salva manutenzione"} />
    </form>
  );
}

export function AddMaintenanceDialog({ vehicleId }: { vehicleId: number }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-dark">
        <Plus className="h-4 w-4" strokeWidth={2.6} /> Manutenzione
      </button>
      {open ? (
        <ModalShell title="Nuova manutenzione" icon={Wrench} onClose={close}>
          <MaintenanceForm vehicleId={vehicleId} onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

export function EditMaintenanceButton({ initial }: { initial: Maintenance }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink-950/5 hover:text-ink-950" title="Modifica">
        <Pencil className="h-4 w-4" />
      </button>
      {open ? (
        <ModalShell title="Modifica manutenzione" icon={Wrench} onClose={close}>
          <MaintenanceForm vehicleId={initial.vehicleId} initial={initial} onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// SCADENZA (aggiungi / modifica)
// ---------------------------------------------------------------------------

function DeadlineForm({
  vehicleId,
  initial,
  onClose,
}: {
  vehicleId: number;
  initial?: Deadline;
  onClose: () => void;
}) {
  const action: (p: FormResult, fd: FormData) => Promise<FormResult> = initial
    ? updateDeadline.bind(null, initial.id)
    : addDeadline.bind(null, vehicleId);
  const [state, formAction, pending] = useActionState(action, { ok: false } as FormResult);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo scadenza">
          <select className="input" name="tipo" defaultValue={initial?.tipo ?? "assicurazione"}>
            <option value="assicurazione">Assicurazione</option>
            <option value="revisione">Revisione</option>
            <option value="bollo">Bollo</option>
            <option value="noleggio">Fine noleggio</option>
            <option value="altro">Altro</option>
          </select>
        </Field>
        <Field label="Scade il">
          <input className="input" type="date" name="scadenza" defaultValue={initial?.scadenza ?? undefined} required />
        </Field>
        <Field label="Costo previsto (€)">
          <input className="input font-mono" type="number" name="costo" min={0} step="0.01" defaultValue={initial?.costo ?? undefined} />
        </Field>
        <Field label="Nota">
          <input className="input" type="text" name="note" defaultValue={initial?.note ?? undefined} placeholder="opzionale" />
        </Field>
      </div>
      <ErrorBox msg={state.error} />
      <SubmitRow pending={pending} onClose={onClose} cta={initial ? "Salva modifiche" : "Salva scadenza"} />
    </form>
  );
}

export function AddDeadlineDialog({ vehicleId }: { vehicleId: number }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost h-11!">
        <CalendarClock className="h-4 w-4" strokeWidth={2.4} /> Scadenza
      </button>
      {open ? (
        <ModalShell title="Nuova scadenza" icon={CalendarClock} onClose={close}>
          <DeadlineForm vehicleId={vehicleId} onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

export function EditDeadlineButton({ initial }: { initial: Deadline }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink-950/5 hover:text-ink-950" title="Modifica">
        <Pencil className="h-4 w-4" />
      </button>
      {open ? (
        <ModalShell title="Modifica scadenza" icon={CalendarClock} onClose={close}>
          <DeadlineForm vehicleId={initial.vehicleId} initial={initial} onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// MULTA (aggiungi / modifica)
// ---------------------------------------------------------------------------

function FineForm({
  vehicleId,
  vehicles,
  initial,
  onClose,
}: {
  vehicleId?: number;
  vehicles?: { id: number; targa: string; marca: string; modello: string }[];
  initial?: Fine;
  onClose: () => void;
}) {
  const action: (p: FormResult, fd: FormData) => Promise<FormResult> = initial
    ? updateFine.bind(null, initial.id)
    : vehicleId
      ? addFine.bind(null, vehicleId)
      : addFineFromSelect;
  const [state, formAction, pending] = useActionState(action, { ok: false } as FormResult);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-2 gap-4">
        {vehicles ? (
          <div className="col-span-2">
            <Field label="Mezzo *">
              <select className="input" name="vehicleId" required defaultValue="">
                <option value="" disabled>
                  Seleziona mezzo…
                </option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.targa} — {v.marca} {v.modello}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}

        <Field label="Data infrazione *">
          <input className="input" type="date" name="data" defaultValue={initial?.data ?? todayIso()} required />
        </Field>
        <Field label="Importo (€) *">
          <input className="input font-mono" type="number" name="importo" min={0} step="0.01" defaultValue={initial?.importo ?? undefined} placeholder="es. 173" required />
        </Field>
        <div className="col-span-2">
          <Field label="Motivo *">
            <input className="input" type="text" name="motivo" defaultValue={initial?.motivo ?? undefined} placeholder="es. Eccesso di velocità" required />
          </Field>
        </div>
        <Field label="Luogo (Dove è stata presa) *">
          <input className="input" type="text" name="luogo" defaultValue={initial?.luogo ?? undefined} placeholder="es. SS36 km 42, Milano" required />
        </Field>
        <Field label="N. verbale">
          <input className="input font-mono" type="text" name="numeroVerbale" defaultValue={initial?.numeroVerbale ?? undefined} placeholder="es. V/2026/48211" />
        </Field>
        <Field label="Tipo Pagamento">
          <select className="input" name="tipoPagamento" defaultValue={initial?.tipoPagamento ?? "bonifico"}>
            <option value="bonifico">Bonifico</option>
            <option value="carta">Carta</option>
            <option value="contanti">Contanti</option>
            <option value="altro">Altro</option>
          </select>
        </Field>
        <Field label="Conducente">
          <input className="input" type="text" name="conducente" defaultValue={initial?.conducente ?? undefined} placeholder="Chi guidava" />
        </Field>
        <Field label="Punti decurtati">
          <input className="input font-mono" type="number" name="punti" min={0} max={15} step={1} defaultValue={initial?.punti ?? undefined} />
        </Field>
        <Field label="Stato">
          <select className="input" name="stato" defaultValue={initial?.stato ?? "da_pagare"}>
            <option value="da_pagare">Da pagare</option>
            <option value="pagata">Pagata</option>
            <option value="contestata">Contestata</option>
          </select>
        </Field>
        <Field label="Data pagamento">
          <input className="input" type="date" name="dataPagamento" defaultValue={initial?.dataPagamento ?? undefined} />
        </Field>
        <div className="col-span-2">
          <Field label="Note">
            <input className="input" type="text" name="note" defaultValue={initial?.note ?? undefined} placeholder="Annotazioni extra..." />
          </Field>
        </div>
      </div>
      <ErrorBox msg={state.error} />
      <SubmitRow pending={pending} onClose={onClose} cta={initial ? "Salva modifiche" : "Registra multa"} />
    </form>
  );
}

export function AddFineDialog({
  vehicleId,
  vehicles,
}: {
  vehicleId?: number;
  vehicles?: { id: number; targa: string; marca: string; modello: string }[];
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost h-11!">
        <Siren className="h-4 w-4" strokeWidth={2.2} /> Multa
      </button>
      {open ? (
        <ModalShell title="Registra multa" icon={Siren} onClose={close} wide>
          <FineForm vehicleId={vehicleId} vehicles={vehicles} onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

export function EditFineButton({ initial }: { initial: Fine }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink-950/5 hover:text-ink-950" title="Modifica">
        <Pencil className="h-4 w-4" />
      </button>
      {open ? (
        <ModalShell title="Modifica multa" icon={Siren} onClose={close} wide>
          <FineForm initial={initial} onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

/** Segna la multa come pagata / riaprila */
export function FinePaidToggle({ fineId, pagata }: { fineId: number; pagata: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    await toggleFinePaid(fineId);
    router.refresh();
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={pagata ? "Riapri (segna da pagare)" : "Segna come pagata oggi"}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
        pagata
          ? "bg-volt-500 text-ink-950 hover:bg-volt-400"
          : "text-mute hover:bg-volt-500/30 hover:text-[#5c7209]"
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
    </button>
  );
}

export function DeleteFineButton({ id }: { id: number }) {
  return (
    <DeleteButton
      action={deleteFine.bind(null, id)}
      label="Elimina multa"
      confirmText="Eliminare questa multa dal registro?"
    />
  );
}

// ---------------------------------------------------------------------------
// DIARIO AUTISTI
// ---------------------------------------------------------------------------

function DriverLogForm({
  vehicleId,
  kmInizioSuggeriti,
  onClose,
}: {
  vehicleId: number;
  kmInizioSuggeriti: number | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(addDriverLog.bind(null, vehicleId), {
    ok: false,
  } as FormResult);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Mese *">
          <input className="input" type="month" name="mese" defaultValue={currentMonthKey()} required />
        </Field>
        <Field label="Autista *">
          <input className="input" type="text" name="conducente" placeholder="Nome autista" required />
        </Field>
        <Field label="Km inizio mese">
          <input
            className="input font-mono"
            type="text"
            inputMode="numeric"
            name="kmInizio"
            placeholder="Es. 85.200"
            defaultValue={kmInizioSuggeriti !== null ? fmtNum(kmInizioSuggeriti) : undefined}
          />
        </Field>
        <Field label="Km fine mese">
          <input className="input font-mono" type="text" inputMode="numeric" name="kmFine" placeholder="Es. 87.950" />
        </Field>
        <div className="col-span-2">
          <Field label="Note">
            <input
              className="input"
              type="text"
              name="note"
              placeholder="Esempio: cambio autista a metà mese, mezzo in officina..."
            />
          </Field>
          <p className="mt-2 text-[11px] text-mute">
            I km di inizio mese sono proposti dalla fine del mese precedente. Se l&apos;autista è già
            registrato per quel mese, i dati vengono aggiornati.
          </p>
        </div>
      </div>
      <ErrorBox msg={state.error} />
      <SubmitRow pending={pending} onClose={onClose} cta="Registra mese" />
    </form>
  );
}

export function AddDriverLogDialog({
  vehicleId,
  kmInizioSuggeriti = null,
}: {
  vehicleId: number;
  kmInizioSuggeriti?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost h-11!">
        <User className="h-4 w-4" strokeWidth={2.4} /> Diario Autista
      </button>
      {open ? (
        <ModalShell title="Autista del mese" icon={User} onClose={close}>
          <DriverLogForm vehicleId={vehicleId} kmInizioSuggeriti={kmInizioSuggeriti} onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

export function DeleteDriverLogButton({ id }: { id: number }) {
  return (
    <DeleteButton
      action={deleteDriverLog.bind(null, id)}
      label="Elimina log"
      confirmText="Eliminare questo log autista?"
    />
  );
}

// ---------------------------------------------------------------------------
// Bottone elimina con conferma
// ---------------------------------------------------------------------------

export function DeleteButton({
  action,
  label = "Elimina",
  confirmText = "Eliminare questo elemento? L'operazione non è reversibile.",
  iconOnly = true,
}: {
  action: () => Promise<void>;
  label?: string;
  confirmText?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    await action();
    router.refresh();
  }

  if (iconOnly) {
    return (
      <button
        onClick={onClick}
        disabled={busy}
        className="btn-icon-danger"
        title={label}
        aria-label={label}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="btn-ghost border-danger/30! text-danger! hover:bg-danger/10!"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {label}
    </button>
  );
}
