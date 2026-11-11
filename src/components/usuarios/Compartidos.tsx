import type { ReactNode } from "react";
import { RELACIONES } from "@/types/seguimiento";
import type { Relacion } from "@/types/seguimiento";

export const campoUsuario = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
export const tablaUsuario = "w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:bg-slate-50 [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-medium [&_th]:text-slate-500 [&_td]:px-4 [&_td]:py-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100";

export function PanelUsuario({ titulo, detalle, acciones, children }: { titulo: string; detalle?: string; acciones?: ReactNode; children: ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div><h2 className="font-semibold text-slate-900">{titulo}</h2>{detalle ? <p className="mt-1 text-xs text-slate-500">{detalle}</p> : null}</div>
      {acciones}
    </div>
    {children}
  </section>;
}
export function MetricaUsuario({ etiqueta, valor, detalle, alerta = false }: { etiqueta: string; valor: ReactNode; detalle: string; alerta?: boolean }) {
  return <div className={`min-w-0 rounded-2xl border bg-white p-5 shadow-sm ${alerta ? "border-red-200" : "border-slate-200"}`}>
    <p className="text-xs font-medium text-slate-500">{etiqueta}</p>
    <p className={`mt-2 break-words text-2xl font-semibold tracking-tight tabular-nums ${alerta ? "text-red-700" : "text-[#1b2b5e]"}`}>{valor}</p>
    <p className="mt-1 text-xs text-slate-500">{detalle}</p>
  </div>;
}
export function BadgeUsuario({ children, tono = "neutro" }: { children: ReactNode; tono?: "verde" | "rojo" | "azul" | "ambar" | "neutro" }) {
  const estilos = { verde: "bg-emerald-50 text-emerald-800", rojo: "bg-red-50 text-red-700", azul: "bg-blue-50 text-blue-800", ambar: "bg-amber-50 text-amber-800", neutro: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${estilos[tono]}`}>{children}</span>;
}
export function RelacionUsuario({ relacion }: { relacion: Relacion | null }) {
  return <BadgeUsuario tono={relacion === "BUENA" ? "verde" : relacion === "EN_RIESGO" ? "rojo" : relacion === "REGULAR" ? "ambar" : "neutro"}>
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{relacion ? RELACIONES[relacion] : "Sin evaluar"}
  </BadgeUsuario>;
}
export function VacioUsuario({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-500">{children}</p>;
}
export function AvisoUsuarios({ simulacion = false }: { simulacion?: boolean }) {
  if (simulacion) return <p role="status" className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
    <strong>Simulación activa.</strong> Pedidos, cotizaciones, facturas, cobranzas e historial preparados con los clientes y productos existentes.
    Podés probar las gestiones; al volver a los datos guardados se descartan los cambios de esta simulación.
  </p>;
  return <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
    <strong>Datos comerciales de ejemplo.</strong> La conexión al ERP o base de datos se definirá para producción.
    Las observaciones, estados de cotizaciones y gestiones de cobranza que cargues aquí se guardan para esta demostración.
  </p>;
}
