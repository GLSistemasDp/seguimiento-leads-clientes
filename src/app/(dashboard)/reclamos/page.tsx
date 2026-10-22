import { PanelReclamos } from "@/components/reclamos/PanelReclamos";
import { ProximoEnvio } from "@/components/resumen/ProximoEnvio";
import { BotonTelegram } from "@/components/ui/BotonTelegram";
import { CopiarLink } from "@/components/ui/CopiarLink";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Icono } from "@/components/ui/Icono";
import { getPanel } from "@/lib/db/reclamos";
import { telegramConfigurado } from "@/lib/notificaciones/telegram";
import { HORARIOS_RECLAMOS, proximoEnvio } from "@/lib/seguimiento/cierre-del-dia";
import { ESTADOS_RECLAMO, type EstadoReclamo } from "@/types/reclamo";

export const metadata = { title: "Reclamos · CRM De Pascale" };
export const dynamic = "force-dynamic";

function esFiltro(valor: unknown): valor is EstadoReclamo | "TODOS" {
  return typeof valor === "string" && (valor === "TODOS" || Object.hasOwn(ESTADOS_RECLAMO, valor));
}

export default async function ReclamosPage({ searchParams }: PageProps<"/reclamos">) {
  const { estado } = await searchParams;
  const ahora = new Date();
  const [{ reclamos, error }, proximo] = await Promise.all([
    getPanel(ahora),
    proximoEnvio(HORARIOS_RECLAMOS, ahora).catch(() => null),
  ]);
  const telegramListo = telegramConfigurado("reclamos");
  const pendientes = reclamos.filter((reclamo) => reclamo.estado === "SIN_DEFINIR").length;
  // Si no hay nada esperando a la gerencia se abre directo en "Todos".
  const estadoInicial = esFiltro(estado) ? estado : pendientes > 0 ? "SIN_DEFINIR" : "TODOS";

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Reclamos"
        etiqueta="SOLO GERENCIA"
        descripcion="Reclamos de los grupos de WhatsApp y formularios FOR-03 en un solo panel. En cada uno indicá cómo sigue el vendedor; la indicación aparece en el seguimiento del chat."
        acciones={
          <>
            <ProximoEnvio proximo={proximo?.toISOString() ?? null} ahora={ahora.getTime()} telegramListo={telegramListo} />
            <BotonTelegram tipo="reclamos" listo={telegramListo} />
            <CopiarLink ruta="/formularios/reclamo" etiqueta="Link del formulario para el cliente" />
            <a
              href="/formularios/reclamo"
              target="_blank"
              rel="noopener"
              title="Abre el formulario que completa el cliente"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800"
            >
              <Icono nombre="externo" />
              Nuevo reclamo
            </a>
          </>
        }
      />

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          No se pudieron leer los reclamos de WhatsApp: {error}
        </p>
      ) : null}

      <PanelReclamos reclamos={reclamos} estadoInicial={estadoInicial} />
    </div>
  );
}
