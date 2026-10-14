import Link from "next/link";
import { BarraLateral, NavPrincipal } from "@/app/(dashboard)/NavPrincipal";
import type { Pendientes } from "@/app/(dashboard)/NavPrincipal";
import { getPanel } from "@/lib/db/reclamos";
import { backendActivo } from "@/lib/db/repositorio";
import { getAll as getConsultas, backendSeguimiento } from "@/lib/db/seguimiento";
import { getAll as getSolicitudes } from "@/lib/db/solicitudes";
import { formatearFecha } from "@/lib/utils/dates";

const MOTORES = {
  demo: "Demo en memoria",
  sheets: "Google Sheets",
  postgres: "Postgres",
} as const;

/** Lo pendiente de cada seccion. Si una fuente falla, su globito no aparece y la pagina sigue. */
async function contarPendientes(): Promise<Pendientes> {
  const [consultas, solicitudes, reclamos] = await Promise.allSettled([
    getConsultas(),
    getSolicitudes({ estado: "PENDIENTE" }),
    getPanel(),
  ]);
  return {
    seguimiento:
      consultas.status === "fulfilled" ? consultas.value.filter((consulta) => !consulta.respondida).length : undefined,
    solicitudes: solicitudes.status === "fulfilled" ? solicitudes.value.length : undefined,
    reclamos:
      reclamos.status === "fulfilled"
        ? reclamos.value.reclamos.filter((reclamo) => reclamo.estado === "SIN_DEFINIR").length
        : undefined,
  };
}

/**
 * Marco del CRM con la misma estructura que el portal de De Pascale (barra
 * lateral de iconos, saludo y fecha arriba, contenido sobre fondo gris), para
 * que integrarlo sea sumar el grupo "CRM" a la barra del portal.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const pendientes = await contarPendientes();
  const motor = MOTORES[backendActivo()];
  const motorSeguimiento = MOTORES[backendSeguimiento()];
  const usuario = process.env.PORTAL_USUARIO || "EQUIPO COMERCIAL";

  return (
    <div className="flex min-h-screen bg-[#e9eaee]">
      <aside className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center gap-6 border-r border-slate-200 bg-white py-4 md:flex">
        <Link href="/resumen" className="flex flex-col items-center leading-none" aria-label="Inicio del CRM">
          <span className="text-2xl font-black tracking-tighter text-[#1b2b5e]">DP</span>
          <span className="text-[8px] font-semibold text-[#1b2b5e]">De Pascale</span>
          <span className="text-[6px] text-slate-500">Protección Industrial</span>
        </Link>
        <BarraLateral pendientes={pendientes} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/resumen" className="text-xl font-black tracking-tighter text-[#1b2b5e] md:hidden">
                DP
              </Link>
              <p className="text-sm leading-tight text-slate-800">
                Bienvenido, <span className="font-medium">{usuario}</span>
              </p>
            </div>
            <NavPrincipal pendientes={pendientes} />
            <div className="hidden text-sm leading-tight text-slate-800 sm:block">
              <p>FECHA</p>
              <p className="tabular-nums">{formatearFecha(new Date())}</p>
            </div>
          </div>
        </header>

        <main className="w-full flex-1 px-4 py-6 sm:px-6">{children}</main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-xs text-slate-500">
            <p className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-600" />
              Altas y reclamos: {motor} · Seguimiento: {motorSeguimiento}
            </p>
            <p>CRM De Pascale · Demo para gerencia</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
