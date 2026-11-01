import { Icono } from "@/components/ui/Icono";

const ESTILO =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

/** Ficha del alta para guardar: PDF para el legajo, JSON para analisis y el maestro de clientes. */
export function DescargasAlta({ id }: { id: string }) {
  return (
    <>
      <a href={`/api/solicitudes/${id}/pdf`} download className={ESTILO} title="Ficha del alta en PDF, para el legajo">
        <Icono nombre="descargar" className="size-4" />
        PDF
      </a>
      <a
        href={`/api/solicitudes/${id}/json`}
        download
        className={ESTILO}
        title="Datos del alta en JSON, para análisis y para cargar en el maestro de clientes"
      >
        <Icono nombre="descargar" className="size-4" />
        JSON
      </a>
    </>
  );
}
