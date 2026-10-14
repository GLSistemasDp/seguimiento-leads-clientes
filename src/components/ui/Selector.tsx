"use client";

import { Icono } from "@/components/ui/Icono";
import type { NombreIcono } from "@/components/ui/Icono";

/** Desplegable nativo con icono a la izquierda, usado por los filtros de los listados. */
export function Selector<Valor extends string>({
  icono,
  etiqueta,
  valor,
  opciones,
  onCambiar,
}: {
  icono: NombreIcono;
  etiqueta: string;
  valor: Valor;
  opciones: Record<Valor, string>;
  onCambiar: (valor: Valor) => void;
}) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{etiqueta}</span>
      <Icono nombre={icono} className="pointer-events-none absolute left-3 size-4 text-slate-600" />
      <select
        value={valor}
        onChange={(evento) => onCambiar(evento.target.value as Valor)}
        className="w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white py-2 pr-9 pl-9 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {(Object.keys(opciones) as Valor[]).map((clave) => (
          <option key={clave} value={clave}>
            {opciones[clave]}
          </option>
        ))}
      </select>
      <Icono nombre="abajo" className="pointer-events-none absolute right-3 size-4 text-slate-600" />
    </label>
  );
}
