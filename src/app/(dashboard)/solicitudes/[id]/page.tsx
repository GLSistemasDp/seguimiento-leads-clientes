import Link from "next/link";
import { notFound } from "next/navigation";
import { AccionesEstado } from "@/components/solicitudes/AccionesEstado";
import { EstadoBadge } from "@/components/solicitudes/EstadoBadge";
import { PanelEvaluacion } from "@/components/solicitudes/Evaluacion";
import { Icono } from "@/components/ui/Icono";
import { getById } from "@/lib/db/solicitudes";
import { evaluacionVigente, getEvaluaciones } from "@/lib/solicitudes/evaluacion-ia";
import { formatearFechaHora } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="border-b border-slate-100 py-2.5 last:border-0 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-500">{etiqueta}</dt>
      <dd className="text-sm break-words text-slate-900 sm:col-span-2">{valor || "—"}</dd>
    </div>
  );
}

export default async function SolicitudDetallePage({
  params,
}: PageProps<"/solicitudes/[id]">) {
  const { id } = await params;
  const [solicitud, guardadas] = await Promise.all([getById(id), getEvaluaciones()]);

  if (!solicitud) {
    notFound();
  }

  const camposExtra = Object.entries(solicitud.datos);
  const evaluacion = evaluacionVigente(solicitud, guardadas);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/solicitudes" className="text-sm text-blue-700 hover:underline">
        ← Volver a solicitudes de alta
      </Link>

      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-[#1b2b5e] uppercase">{solicitud.nombre}</h1>
            <EstadoBadge estado={solicitud.estado} />
          </div>
          <p className="font-mono text-sm text-slate-500">{solicitud.email}</p>
        </div>
        <Link
          href={`/generador/${solicitud.id}`}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Icono nombre="mail" />
          Comunicar resultado por mail
        </Link>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-5">
          <PanelEvaluacion solicitudId={solicitud.id} evaluacion={evaluacion} />

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <AccionesEstado id={solicitud.id} nombre={solicitud.nombre} estado={solicitud.estado} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Seguimiento</h2>
            <dl>
              <Dato etiqueta="Importada" valor={formatearFechaHora(solicitud.fechaImportacion)} />
              <Dato etiqueta="Decidida" valor={formatearFechaHora(solicitud.fechaDecision)} />
              <Dato etiqueta="Decidida por" valor={solicitud.usuarioDecisor ?? ""} />
            </dl>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Datos del formulario ({camposExtra.length})</h2>
          {camposExtra.length === 0 ? (
            <p className="text-sm text-slate-500">El archivo importado no traía más columnas que nombre y mail.</p>
          ) : (
            <dl>
              {camposExtra.map(([campo, valor]) => (
                <Dato key={campo} etiqueta={campo} valor={valor === null ? "" : String(valor)} />
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
