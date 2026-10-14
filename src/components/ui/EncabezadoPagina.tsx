import type { ReactNode } from "react";

/**
 * Encabezado de seccion con el estilo de las pantallas del portal
 * ("PROYECCION DE STOCK"): titulo en mayusculas azul marino, descripcion y,
 * a la derecha, la etiqueta de quien la usa y las acciones.
 */
export function EncabezadoPagina({
  titulo,
  descripcion,
  etiqueta,
  acciones,
  children,
}: {
  titulo: string;
  descripcion: ReactNode;
  /** "SOLO GERENCIA", "EQUIPO COMERCIAL"... */
  etiqueta?: string;
  acciones?: ReactNode;
  /** Algo debajo de la descripcion (submenu, avisos). */
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-black tracking-tight text-[#1b2b5e] uppercase sm:text-3xl">{titulo}</h1>
          <div className="mt-1.5 text-sm text-slate-700">{descripcion}</div>
        </div>
        <div className="flex flex-col items-end gap-3">
          {etiqueta ? (
            <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold tracking-wide text-emerald-800">
              {etiqueta}
            </span>
          ) : null}
          {acciones ? <div className="flex flex-wrap items-center justify-end gap-2">{acciones}</div> : null}
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
