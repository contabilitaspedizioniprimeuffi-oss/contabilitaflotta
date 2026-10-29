import { notFound } from "next/navigation";
import VehicleForm from "@/components/vehicle-form";
import { PageHeader } from "@/components/ui";
import { getVehicle } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ModificaMezzoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const vid = Number(id);
  if (!Number.isFinite(vid)) notFound();

  const vehicle = await getVehicle(vid);
  if (!vehicle) notFound();

  return (
    <div>
      <PageHeader
        eyebrow={`Targa ${vehicle.targa}`}
        title="Modifica mezzo"
        sub="Aggiorna anagrafica, acquisizione e stato del veicolo."
      />
      <VehicleForm initial={vehicle} cancelHref={`/mezzi/${vid}`} />
    </div>
  );
}
