import { PanelReclamos } from "@/components/reclamos/PanelReclamos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { formulariosDisponibles, getPanel } from "@/lib/db/reclamos";
import { ESTADOS_RECLAMO, type EstadoReclamo } from "@/types/reclamo";

export const metadata = { title: "Reclamos · CRM De Pascale" };
export const dynamic = "force-dynamic";

function esFiltro(valor: unknown): valor is EstadoReclamo | "TODOS" {
  return typeof valor === "string" && (valor === "TODOS" || Object.hasOwn(ESTADOS_RECLAMO, valor));
}

export default async function ReclamosPage({ searchParams }: PageProps<"/reclamos">) {
  const { estado } = await searchParams;
  const { reclamos, error } = await getPanel();
  const pendientes = reclamos.filter((reclamo) => reclamo.estado === "SIN_DEFINIR").length;
  // Si no hay nada esperando a la gerencia se abre directo en "Todos".
  const estadoInicial = esFiltro(estado) ? estado : pendientes > 0 ? "SIN_DEFINIR" : "TODOS";

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Reclamos"
        etiqueta="SOLO GERENCIA"
        descripcion={
          <>
            Los reclamos que el bot detecta en los grupos de WhatsApp y los formularios de reclamo, en un solo
            panel. En cada uno indicá cómo debe seguir el vendedor; la indicación aparece en el seguimiento del
            chat. Reemplaza el reenvío por Telegram.
          </>
        }
      />

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          No se pudieron leer los reclamos de WhatsApp: {error}
        </p>
      ) : null}
      {!formulariosDisponibles() ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
          Los formularios FOR-03 todavía no tienen fuente conectada: se muestran solo los reclamos de WhatsApp.
        </p>
      ) : null}

      <PanelReclamos reclamos={reclamos} estadoInicial={estadoInicial} />
    </div>
  );
}
