"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icono } from "@/components/ui/Icono";
import { Selector } from "@/components/ui/Selector";
import { ORDENES } from "@/lib/seguimiento/presentacion";
import { ICONO_RELACION, RELACIONES, type Relacion } from "@/types/seguimiento";
import type { OrdenConsulta } from "@/lib/seguimiento/presentacion";

type Filtros = {
  busqueda: string;
  hito: string;
  /** Relacion vigente (BUENA, REGULAR, EN_RIESGO) o "" para todas. */
  relacion: string;
  grupoVendedor: string;
};

export type FiltrosSeguimientoProps = {
  orden: OrdenConsulta;
  /** Orden que se usa sin elegir ninguno (depende de la tarjeta activa). */
  ordenPorDefecto: OrdenConsulta;
  /** true cuando la tabla agrupa por chat (cliente + grupo de WhatsApp). */
  agrupado: boolean;
  filtros: Filtros;
  pendientes: number;
  /** Valores que aparecen en la planilla, para cada desplegable. */
  opciones: { hito: string[]; grupoVendedor: string[] };
};

type Parametro =
  "orden" | "q" | "hito" | "relacion" | "vendedor" | "agrupar";

/** Las rojas primero, como en la tarjeta "Clientes a cuidar". */
const OPCIONES_RELACION: Record<string, string> = Object.fromEntries([
  ["", "Todas las relaciones"],
  ...(["EN_RIESGO", "REGULAR", "BUENA"] as Relacion[]).map((clave) => [clave, `${ICONO_RELACION[clave]} ${RELACIONES[clave]}`]),
]);

/** "" es la opcion "todos"; el resto se usa tal cual como valor y etiqueta. */
function conTodos(etiqueta: string, valores: string[]): Record<string, string> {
  return Object.fromEntries([
    ["", etiqueta],
    ...valores.map((valor) => [valor, valor]),
  ]);
}

export function FiltrosSeguimiento({
  orden,
  ordenPorDefecto,
  agrupado,
  filtros,
  pendientes,
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
    params.delete("vista");
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
        <div>
          <p className="text-sm font-semibold text-slate-900">Consultas pendientes <span className="ml-1 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800 tabular-nums">{pendientes}</span></p>
          <p className="mt-1 text-xs text-slate-500">Las realizadas se consultan en el historial de cada cliente.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={agrupado}
            // Agrupado es lo de entrada: apagarlo deja "agrupar=no" en la URL.
            onClick={() => navegar({ agrupar: agrupado ? "no" : null })}
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
          icono="escudo"
          etiqueta="Relación"
          valor={filtros.relacion}
          opciones={OPCIONES_RELACION}
          onCambiar={(valor) => navegar({ relacion: valor })}
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
            navegar({ orden: valor === ordenPorDefecto ? null : valor })
          }
        />
      </div>
    </section>
  );
}
