"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icono } from "@/components/ui/Icono";
import { Selector } from "@/components/ui/Selector";
import { ORDENES, ORDEN_CONSULTA_POR_DEFECTO, VISTAS } from "@/lib/seguimiento/presentacion";
import type { OrdenConsulta, Vista } from "@/lib/seguimiento/presentacion";

type Filtros = {
  busqueda: string;
  hito: string;
  encargado: string;
  grupoVendedor: string;
};

export type FiltrosSeguimientoProps = {
  vista: Vista;
  orden: OrdenConsulta;
  /** true cuando la tabla agrupa por chat (cliente + grupo de WhatsApp). */
  agrupado: boolean;
  filtros: Filtros;
  conteos: Record<Vista, number>;
  /** Valores que aparecen en la planilla, para cada desplegable. */
  opciones: { hito: string[]; encargado: string[]; grupoVendedor: string[] };
};

type Parametro =
  "vista" | "orden" | "q" | "hito" | "encargado" | "vendedor" | "agrupar";

/** "" es la opcion "todos"; el resto se usa tal cual como valor y etiqueta. */
function conTodos(etiqueta: string, valores: string[]): Record<string, string> {
  return Object.fromEntries([
    ["", etiqueta],
    ...valores.map((valor) => [valor, valor]),
  ]);
}

export function FiltrosSeguimiento({
  vista,
  orden,
  agrupado,
  filtros,
  conteos,
  opciones,
}: FiltrosSeguimientoProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [texto, setTexto] = useState(filtros.busqueda);
  const [busquedaPrevia, setBusquedaPrevia] = useState(filtros.busqueda);

  // Mismo patron que el filtro de solicitudes: si la busqueda cambia desde
  // afuera (back del browser), se sincroniza durante el render.
  if (filtros.busqueda !== busquedaPrevia) {
    setBusquedaPrevia(filtros.busqueda);
    setTexto(filtros.busqueda);
  }

  function navegar(cambios: Partial<Record<Parametro, string | null>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      const limpio = valor?.trim();
      if (limpio) params.set(clave, limpio);
      else params.delete(clave);
    }
    params.delete("pagina");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  useEffect(() => {
    if (texto === filtros.busqueda) return;
    const timer = setTimeout(() => navegar({ q: texto }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1"
          role="tablist"
        >
          {(Object.keys(VISTAS) as Vista[]).map((valor) => {
            const activa = vista === valor;
            return (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() =>
                  navegar({ vista: valor === "pendientes" ? null : valor })
                }
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm transition-colors ${
                  activa
                    ? "bg-white font-medium text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {VISTAS[valor]}
                <span className="text-xs text-slate-400 tabular-nums">{conteos[valor]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={agrupado}
            onClick={() => navegar({ agrupar: agrupado ? null : "chat" })}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              agrupado
                ? "border-slate-900 bg-slate-900 font-medium text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icono nombre="chat" className="size-3.5" />
            Agrupar por cliente / WhatsApp
          </button>
          <button
            type="button"
            onClick={() => {
              setTexto("");
              router.push(pathname);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Icono nombre="restablecer" className="size-3.5" />
            Restablecer filtros
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
        <label className="relative flex items-center">
          <Icono
            nombre="buscar"
            className="pointer-events-none absolute left-3 size-4 text-slate-400"
          />
          <input
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Buscar cliente, consulta, grupo de WhatsApp…"
            aria-label="Buscar consultas"
            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </label>
        <Selector
          icono="alerta"
          etiqueta="Hito a responder"
          valor={filtros.hito}
          opciones={conTodos("Todos los hitos", opciones.hito)}
          onCambiar={(valor) => navegar({ hito: valor })}
        />
        <Selector
          icono="usuario"
          etiqueta="Encargado"
          valor={filtros.encargado}
          opciones={conTodos("Todos los encargados", opciones.encargado)}
          onCambiar={(valor) => navegar({ encargado: valor })}
        />
        <Selector
          icono="lista"
          etiqueta="Grupo vendedor"
          valor={filtros.grupoVendedor}
          opciones={conTodos("Todos los grupos", opciones.grupoVendedor)}
          onCambiar={(valor) => navegar({ vendedor: valor })}
        />
        <Selector
          icono="orden"
          etiqueta="Orden"
          valor={orden}
          opciones={ORDENES}
          onCambiar={(valor) =>
            navegar({ orden: valor === ORDEN_CONSULTA_POR_DEFECTO ? null : valor })
          }
        />
      </div>
    </section>
  );
}
