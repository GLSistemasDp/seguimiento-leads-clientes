import { PlantillasEditor } from "@/app/(dashboard)/solicitudes/plantillas/PlantillasEditor";
import { EncabezadoAltas } from "@/components/solicitudes/EncabezadoAltas";
import { getAll } from "@/lib/db/plantillas";

export const metadata = { title: "Plantillas de mail · Solicitudes de alta" };
export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const plantillas = await getAll();

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoAltas descripcion="El asunto, el cuerpo y las imágenes del mail que recibe cada solicitante cuando su alta se aprueba o se rechaza, sin tocar código." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <PlantillasEditor plantillas={plantillas} />
      </div>
    </div>
  );
}
