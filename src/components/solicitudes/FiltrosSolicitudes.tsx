"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icono } from "@/components/ui/Icono";
import { Selector } from "@/components/ui/Selector";
import { ORDENES } from "@/lib/solicitudes/presentacion";
import type { Orden, Rango } from "@/lib/solicitudes/presentacion";
import { ESTADOS } from "@/types/solicitud";
import type { Estado } from "@/types/solicitud";

const ETIQUETAS: Record<Estado, string> = {
  PENDIENTE: "Pendientes",
  APROBADO: "Aprobadas",
  RECHAZADO: "Descartadas",
};

export type FiltrosSolicitudesProps = {
  estado?: Estado;
  busqueda: string;
  rango: Rango;
  orden: Orden;
  /** Etiquetas con las fechas ya calculadas en el servidor, para no desfasar la hidratacion. */
  etiquetasRango: Record<Rango, string>;
  /** Conteo por estado, para mostrarlo al lado de cada pestana. */
  conteos: Record<Estado | "TODAS", number>;
};

type Cambios = Partial<Record<"estado" | "q" | "rango" | "orden", string | null>>;

export function FiltrosSolicitudes({
  estado,
  busqueda,
  rango,
  orden,
  etiquetasRango,
  conteos,
}: FiltrosSolicitudesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [texto, setTexto] = useState(busqueda);
  const [busquedaPrevia, setBusquedaPrevia] = useState(busqueda);

  // Si el filtro cambia desde afuera (navegacion, back del browser), sincroniza
  // el input durante el render en vez de con un efecto: asi React descarta el
  // render a medias en lugar de encadenar uno nuevo.
  if (busqueda !== busquedaPrevia) {
    setBusquedaPrevia(busqueda);
    setTexto(busqueda);
  }

  function navegar(cambios: Cambios) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      const limpio = valor?.trim();
      if (limpio) params.set(clave, limpio);
      else params.delete(clave);
    }
    // Cualquier cambio de filtro vuelve a la primera pagina.
    params.delete("pagina");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  // El buscador espera 300ms sin tipeo antes de navegar, para no disparar
  // una consulta por tecla.
  useEffect(() => {
    if (texto === busqueda) return;
    const timer = setTimeout(() => navegar({ q: texto }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const pestanas: { valor: Estado | null; etiqueta: string; cantidad: number }[] = [
    { valor: null, etiqueta: "Todas", cantidad: conteos.TODAS },
    ...ESTADOS.map((valor) => ({ valor, etiqueta: ETIQUETAS[valor], cantidad: conteos[valor] })),
  ];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
          {pestanas.map((pestana) => {
            const activa = (estado ?? null) === pestana.valor;
            return (
              <button
                key={pestana.valor ?? "TODAS"}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => navegar({ estado: pestana.valor })}
                className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                  activa
                    ? "bg-white font-semibold text-blue-800 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {pestana.etiqueta} ({pestana.cantidad})
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setTexto("");
            router.push(pathname);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
        >
          <Icono nombre="restablecer" className="size-3.5" />
          Restablecer filtros
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <label className="relative flex items-center">
          <Icono nombre="buscar" className="pointer-events-none absolute left-3 size-4 text-slate-500" />
          <input
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Buscar por razon social, mail, CUIT, rubro…"
            aria-label="Buscar solicitudes"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <Selector
          icono="calendario"
          etiqueta="Rango de fechas"
          valor={rango}
          opciones={etiquetasRango}
          onCambiar={(valor) => navegar({ rango: valor })}
        />
        <Selector
          icono="orden"
          etiqueta="Orden"
          valor={orden}
          opciones={ORDENES}
          onCambiar={(valor) => navegar({ orden: valor })}
        />
      </div>
    </section>
  );
}
