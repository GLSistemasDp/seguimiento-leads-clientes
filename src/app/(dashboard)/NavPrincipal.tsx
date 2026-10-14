"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono } from "@/components/ui/Icono";
import type { NombreIcono } from "@/components/ui/Icono";

/** Cantidad pendiente de cada seccion, para el globito del menu. */
export type Pendientes = Partial<Record<"seguimiento" | "solicitudes" | "reclamos", number>>;

type Item = {
  href: string;
  etiqueta: string;
  corta: string;
  icono: NombreIcono;
  clave?: keyof Pendientes;
  /** Rutas que tambien cuentan como esta seccion. */
  incluye?: string[];
};

export const NAVEGACION: readonly Item[] = [
  { href: "/resumen", etiqueta: "Resumen", corta: "Resumen", icono: "casa" },
  { href: "/seguimiento", etiqueta: "Seguimiento de clientes", corta: "Seguimiento", icono: "chat", clave: "seguimiento" },
  {
    href: "/solicitudes",
    etiqueta: "Solicitudes de alta",
    corta: "Altas",
    icono: "documento",
    clave: "solicitudes",
    incluye: ["/generador"],
  },
  { href: "/reclamos", etiqueta: "Reclamos", corta: "Reclamos", icono: "alerta", clave: "reclamos" },
];

function activa(pathname: string, item: Item): boolean {
  return [item.href, ...(item.incluye ?? [])].some((ruta) => pathname.startsWith(ruta));
}

function Globito({ cantidad, className = "" }: { cantidad: number | undefined; className?: string }) {
  if (!cantidad) return null;
  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums ${className}`}
    >
      {cantidad > 99 ? "99+" : cantidad}
    </span>
  );
}

/** Menu principal, en el encabezado. */
export function NavPrincipal({ pendientes }: { pendientes: Pendientes }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu principal" className="flex flex-wrap items-center gap-1">
      {NAVEGACION.map((item) => {
        const actual = activa(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={actual ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              actual ? "bg-blue-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icono nombre={item.icono} className="size-4" />
            <span className="hidden lg:inline">{item.etiqueta}</span>
            <span className="lg:hidden">{item.corta}</span>
            {item.clave ? <Globito cantidad={pendientes[item.clave]} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Barra lateral al estilo del portal: el CRM entra como un grupo mas, igual
 * que el de "VENDEDOR", con un icono por seccion.
 */
export function BarraLateral({ pendientes }: { pendientes: Pendientes }) {
  const pathname = usePathname();

  return (
    <div className="mx-1.5 flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-400 px-1 pt-1.5 pb-2">
      <span className="text-[10px] font-bold tracking-wide text-slate-800">CRM</span>
      {NAVEGACION.map((item) => {
        const actual = activa(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.etiqueta}
            aria-label={item.etiqueta}
            className={`relative flex size-10 items-center justify-center rounded-full transition-colors ${
              actual ? "bg-[#1b2b5e] text-white" : "bg-slate-100 text-[#1b2b5e] hover:bg-blue-50"
            }`}
          >
            <Icono nombre={item.icono} className="size-[18px]" />
            {item.clave ? (
              <Globito cantidad={pendientes[item.clave]} className="absolute -top-1 -right-1.5 min-w-4 px-1 text-[10px] leading-4" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
