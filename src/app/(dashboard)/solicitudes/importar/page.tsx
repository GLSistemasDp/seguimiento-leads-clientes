import { ImportDropzone } from "@/components/import/ImportDropzone";
import { EncabezadoAltas } from "@/components/solicitudes/EncabezadoAltas";

export const metadata = { title: "Importar Excel · Solicitudes de alta" };

export default function ImportarPage() {
  return (
    <div className="flex flex-col gap-5">
      <EncabezadoAltas
        descripcion="Subí el Excel con los formularios de alta. Las solicitudes se identifican por mail: si una ya existe se actualizan sus datos, sin pisar la decisión que ya se haya tomado. Cada solicitud nueva recibe su puntaje de aptitud."
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <ImportDropzone />
      </div>
    </div>
  );
}
