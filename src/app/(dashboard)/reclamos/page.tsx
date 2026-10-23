import { PanelReclamos } from "@/components/reclamos/PanelReclamos";
import { InformeReclamos } from "@/components/reclamos/informe/InformeReclamos";
import { ProximoEnvio } from "@/components/resumen/ProximoEnvio";
import { BotonTelegram } from "@/components/ui/BotonTelegram";
import { CopiarLink } from "@/components/ui/CopiarLink";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { getPanel, getReclamos, reclamosEnPostgres } from "@/lib/db/reclamos";
import { telegramConfigurado } from "@/lib/notificaciones/telegram";
import { META_RESOLUCION_DIAS, calcularInforme, esPeriodoInforme } from "@/lib/reclamos/informe";
import { informeDesdeVistas } from "@/lib/reclamos/informe-db";
import { HORARIOS_RECLAMOS, proximoEnvio } from "@/lib/seguimiento/cierre-del-dia";
import { ESTADOS_RECLAMO, type EstadoReclamo } from "@/types/reclamo";

export const metadata = { title: "Reclamos · CRM De Pascale" };
export const dynamic = "force-dynamic";

function esFiltro(valor: unknown): valor is EstadoReclamo | "TODOS" {
  return typeof valor === "string" && (valor === "TODOS" || Object.hasOwn(ESTADOS_RECLAMO, valor));
}

export default async function ReclamosPage({ searchParams }: PageProps<"/reclamos">) {
  const params = await searchParams;
  const ahora = new Date();
  const periodo = esPeriodoInforme(params.periodo) ? params.periodo : "90";
  const meta = Number(process.env.RECLAMOS_META_DIAS) || META_RESOLUCION_DIAS;
  // Con Postgres el informe sale de las vistas; sin base se calcula en memoria.
  const [{ reclamos, error }, informe, proximo] = await Promise.all([
    getPanel(ahora),
    reclamosEnPostgres()
      ? informeDesdeVistas(ahora, periodo, meta)
      : getReclamos().then((todos) => calcularInforme(todos, ahora, periodo, meta)),
    proximoEnvio(HORARIOS_RECLAMOS, ahora).catch(() => null),
  ]);
  const telegramListo = telegramConfigurado("reclamos");
  const pendientes = reclamos.filter((reclamo) => reclamo.estado === "SIN_DEFINIR").length;
  // Si no hay nada esperando a la gerencia se abre directo en "Todos".
  const estadoInicial = esFiltro(params.estado) ? params.estado : pendientes > 0 ? "SIN_DEFINIR" : "TODOS";

  const parametros: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(params)) {
    if (typeof valor === "string" && clave !== "periodo" && clave !== "informe") parametros[clave] = valor;
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Reclamos"
        etiqueta="SOLO GERENCIA"
        descripcion="Reclamos que los clientes cargan con el formulario FOR-03. En cada uno indicá cómo sigue el vendedor y completá la gestión para el informe."
        acciones={
          <>
            <ProximoEnvio proximo={proximo?.toISOString() ?? null} ahora={ahora.getTime()} telegramListo={telegramListo} />
            <BotonTelegram tipo="reclamos" listo={telegramListo} />
            <CopiarLink ruta="/formularios/reclamo" etiqueta="Link del formulario para el cliente" />
          </>
        }
      />

      <InformeReclamos informe={informe} abierto={params.informe === "1"} parametros={parametros} />

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          No se pudo leer la planilla de clientes (clasificación y estado de cuenta): {error}
        </p>
      ) : null}

      <PanelReclamos reclamos={reclamos} estadoInicial={estadoInicial} />
    </div>
  );
}
