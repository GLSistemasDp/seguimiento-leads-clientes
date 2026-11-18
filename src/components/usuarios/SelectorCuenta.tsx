"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icono } from "@/components/ui/Icono";
import { dineroUsuario } from "@/lib/usuarios/analisis";
import type { ResumenUsuario } from "@/lib/usuarios/analisis";
import { coincideBusqueda } from "@/lib/usuarios/cartera";
import type { FichaUsuario } from "@/types/usuarios";

/**
 * Menu desplegable para elegir un cliente, pensado para listas largas: se
 * escribe para filtrar (nombre, codigo, CUIT o contacto) y se elige con el
 * mouse o con las flechas y Enter. Cada opcion muestra el saldo y las alertas.
 */
export function SelectorCuenta({
  fichas,
  resumenes,
  seleccion,
  onSeleccionar,
}: {
  fichas: readonly FichaUsuario[];
  resumenes: ReadonlyMap<string, ResumenUsuario>;
  seleccion: string | null;
  onSeleccionar: (codigo: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [activa, setActiva] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();
  const elegida = fichas.find((ficha) => ficha.codigo === seleccion) ?? null;
  const opciones = fichas.filter((ficha) => coincideBusqueda(ficha, busqueda));

  // Cierra al hacer click afuera.
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  // La opcion activa siempre a la vista al moverse con el teclado.
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-indice="${activa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activa]);

  function abrir() {
    setBusqueda("");
    setActiva(Math.max(0, fichas.findIndex((ficha) => ficha.codigo === seleccion)));
    setAbierto(true);
  }

  function elegir(codigo: string) {
    onSeleccionar(codigo);
    setAbierto(false);
  }

  function alTeclear(evento: React.KeyboardEvent) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setActiva((actual) => Math.min(opciones.length - 1, actual + 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setActiva((actual) => Math.max(0, actual - 1));
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      const opcion = opciones[activa];
      if (opcion) elegir(opcion.codigo);
    } else if (evento.key === "Escape") {
      setAbierto(false);
    }
  }

  return (
    <div ref={contenedor} className="relative w-full sm:w-96">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Icono nombre="usuario" className="size-4 text-slate-400" />
        <span className={`min-w-0 flex-1 truncate ${elegida ? "font-medium text-slate-900" : "text-slate-500"}`}>
          {elegida ? elegida.nombre : `Elegir un cliente (${fichas.length})`}
        </span>
        <Icono nombre="abajo" className={`size-4 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto ? (
        <div className="absolute right-0 left-0 z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <label className="relative flex items-center border-b border-slate-100">
            <Icono nombre="buscar" className="pointer-events-none absolute left-3 size-4 text-slate-400" />
            <input
              autoFocus
              value={busqueda}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
                setActiva(0);
              }}
              onKeyDown={alTeclear}
              role="combobox"
              aria-expanded
              aria-controls={idLista}
              aria-activedescendant={opciones[activa] ? `${idLista}-${opciones[activa].codigo}` : undefined}
              aria-label="Buscar cliente"
              placeholder="Buscar por nombre, código, CUIT o contacto"
              className="w-full py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
          <ul ref={lista} id={idLista} role="listbox" aria-label="Clientes" className="max-h-80 overflow-y-auto py-1">
            {opciones.length === 0 ? <li className="px-3 py-6 text-center text-sm text-slate-500">Ningún cliente coincide.</li> : null}
            {opciones.map((ficha, indice) => {
              const resumen = resumenes.get(ficha.codigo)!;
              return (
                <li
                  key={ficha.codigo}
                  id={`${idLista}-${ficha.codigo}`}
                  role="option"
                  aria-selected={ficha.codigo === seleccion}
                  data-indice={indice}
                  onMouseEnter={() => setActiva(indice)}
                  onMouseDown={(evento) => {
                    evento.preventDefault();
                    elegir(ficha.codigo);
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${indice === activa ? "bg-blue-50" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-900">{ficha.nombre}</span>
                      {ficha.codigo === seleccion ? <Icono nombre="check" className="size-3.5 text-blue-700" /> : null}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{ficha.actividad || "Actividad sin informar"}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className={`text-xs font-medium tabular-nums ${resumen.saldo > 0 ? "text-slate-900" : "text-emerald-700"}`}>
                      {resumen.saldo > 0 ? dineroUsuario(resumen.saldo, ficha.moneda) : "Al día"}
                    </span>
                    <span className="flex gap-1">
                      {resumen.facturasVencidas > 0 ? <span className="rounded bg-red-600 px-1 text-[10px] font-semibold text-white">Vencida</span> : null}
                      {resumen.requiereSeguimiento ? <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">Seguimiento</span> : null}
                      {resumen.pedidosPendientes > 0 ? <span className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-700">{resumen.pedidosPendientes} ped.</span> : null}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
