import VehicleForm from "@/components/vehicle-form";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function NuovoMezzoPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Parco veicoli"
        title="Nuovo mezzo"
        sub="Registra un automezzo in flotta: anagrafica, modalità di acquisizione e stato attuale."
      />
      <VehicleForm cancelHref="/mezzi" />
    </div>
  );
}
