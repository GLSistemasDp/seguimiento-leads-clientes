import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailForm } from "@/components/generador/EmailForm";
import { EstadoBadge } from "@/components/solicitudes/EstadoBadge";
import { get as getPlantilla } from "@/lib/db/plantillas";
import { getById } from "@/lib/db/solicitudes";

export const dynamic = "force-dynamic";

export default async function GeneradorPage({ params }: PageProps<"/generador/[id]">) {
  const { id } = await params;
  const solicitud = await getById(id);

  if (!solicitud) {
    notFound();
  }

  if (solicitud.estado === "PENDIENTE") {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href={`/solicitudes/${solicitud.id}`}
          className="text-sm text-slate-500 underline-offset-2 hover:underline"
        >
          ← Volver a la solicitud
        </Link>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-base font-semibold text-amber-900">Falta decidir esta solicitud</h1>
          <p className="mt-1 text-sm text-amber-800">
            El mail se arma con la plantilla de aprobacion o la de rechazo, asi que primero
            marcala como aprobada o rechazada desde el detalle.
          </p>
        </div>
      </div>
    );
  }

  const plantilla = await getPlantilla(
    solicitud.estado === "APROBADO" ? "aprobado" : "rechazado",
  );

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/solicitudes/${solicitud.id}`}
        className="text-sm text-slate-500 underline-offset-2 hover:underline"
      >
        ← Volver a la solicitud
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">
              Mail para {solicitud.nombre}
            </h1>
            <EstadoBadge estado={solicitud.estado} />
          </div>
          <p className="text-sm text-slate-500">
            Plantilla &quot;{plantilla.tipo}&quot; ·{" "}
            <Link href="/solicitudes/plantillas" className="underline underline-offset-2">
              editar plantillas
            </Link>
          </p>
        </div>
      </div>

      <EmailForm
        estado={solicitud.estado}
        plantilla={plantilla}
        nombreInicial={solicitud.nombre}
        emailInicial={solicitud.email}
      />
    </div>
  );
}
