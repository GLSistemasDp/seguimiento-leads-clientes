"use client";

import { useState } from "react";
import type { Barra } from "@/lib/seguimiento/tablero";

/**
 * Graficos del tablero. Siempre las mismas dos series con el mismo color:
 * sin responder (naranja, pegada a la base porque es lo que importa) y
 * respondidas (azul). Paleta validada para daltonismo contra fondo blanco.
 */
const COLOR = { pendientes: "#eb6834", respondidas: "#2a78d6" } as const;
const GRILLA = "#e1e0d9";

const SERIES = [
  { clave: "pendientes", etiqueta: "Sin responder" },
  { clave: "respondidas", etiqueta: "Respondidas" },
] as const;

export function Leyenda() {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-slate-600">
      {SERIES.map((serie) => (
        <li key={serie.clave} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: COLOR[serie.clave] }} />
          {serie.etiqueta}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ barra }: { barra: Barra }) {
  const total = barra.pendientes + barra.respondidas;
  return (
    <div className="pointer-events-none min-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">{barra.etiqueta}</p>
      {SERIES.map((serie) => (
        <p key={serie.clave} className="mt-1 flex items-center justify-between gap-3 text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: COLOR[serie.clave] }} />
            {serie.etiqueta}
          </span>
          <span className="font-medium text-slate-900 tabular-nums">{barra[serie.clave]}</span>
        </p>
      ))}
      <p className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-slate-600">
        Total <span className="font-medium text-slate-900 tabular-nums">{total}</span>
      </p>
    </div>
  );
}

/** Los mismos datos como tabla, para leerlos sin depender del color. */
function TablaDatos({ barras, encabezado }: { barras: readonly Barra[]; encabezado: string }) {
  return (
    <details className="mt-3 text-xs text-slate-600">
      <summary className="cursor-pointer text-slate-500 hover:text-blue-700">Ver como tabla</summary>
      <table className="mt-2 w-full tabular-nums">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-1 font-medium">{encabezado}</th>
            <th className="py-1 text-right font-medium">Sin responder</th>
            <th className="py-1 text-right font-medium">Respondidas</th>
            <th className="py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {barras.map((barra) => (
            <tr key={barra.clave} className="border-b border-slate-100 last:border-0">
              <td className="py-1">{barra.etiqueta}</td>
              <td className="py-1 text-right">{barra.pendientes}</td>
              <td className="py-1 text-right">{barra.respondidas}</td>
              <td className="py-1 text-right font-medium text-slate-900">{barra.pendientes + barra.respondidas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Barras horizontales apiladas, una por categoria, con el total en la punta. */
export function BarrasApiladas({
  barras,
  encabezado,
}: {
  barras: readonly Barra[];
  encabezado: string;
}) {
  const [activa, setActiva] = useState<string | null>(null);
  const maximo = Math.max(1, ...barras.map((barra) => barra.pendientes + barra.respondidas));

  if (barras.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">Sin consultas en el periodo.</p>;
  }

  return (
    <div>
      <ul className="flex flex-col gap-1">
        {barras.map((barra) => {
          const total = barra.pendientes + barra.respondidas;
          const segmentos = SERIES.filter((serie) => barra[serie.clave] > 0);
          return (
            <li
              key={barra.clave}
              className="relative grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 rounded-md px-1 py-1 hover:bg-slate-50"
              onMouseEnter={() => setActiva(barra.clave)}
              onMouseLeave={() => setActiva(null)}
              onFocus={() => setActiva(barra.clave)}
              onBlur={() => setActiva(null)}
              tabIndex={0}
              aria-label={`${barra.etiqueta}: ${barra.pendientes} sin responder, ${barra.respondidas} respondidas`}
            >
              <span className="truncate text-xs text-slate-700" title={barra.etiqueta}>
                {barra.etiqueta}
              </span>
              <div className="flex items-center gap-2">
                <div
                  className="flex h-4 gap-0.5"
                  style={{ width: `${(total / maximo) * 85}%` }}
                >
                  {segmentos.map((serie, indice) => (
                    <span
                      key={serie.clave}
                      className={indice === segmentos.length - 1 ? "rounded-r" : ""}
                      style={{ background: COLOR[serie.clave], flexGrow: barra[serie.clave], flexBasis: 0 }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium text-slate-900 tabular-nums">{total}</span>
              </div>
              {activa === barra.clave ? (
                <div className="absolute top-full left-40 z-10 mt-1">
                  <Tooltip barra={barra} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <TablaDatos barras={barras} encabezado={encabezado} />
    </div>
  );
}

/** Ticks redondos: 0, la mitad y un tope "lindo" (5, 10, 20, 25, 50...). */
function topeEje(maximo: number): number {
  if (maximo <= 4) return 4;
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  const paso = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitud >= maximo) ?? 10;
  const tope = paso * magnitud;
  return tope % 2 === 0 ? tope : tope * 2;
}

/** Columnas apiladas por dia. */
export function ColumnasPorDia({ barras }: { barras: readonly Barra[] }) {
  const [activa, setActiva] = useState<number | null>(null);
  const tope = topeEje(Math.max(0, ...barras.map((barra) => barra.pendientes + barra.respondidas)));
  const ALTO = 180;
  // Con muchos dias las etiquetas se pisan: se muestra una de cada N.
  const cadaCuantas = barras.length <= 14 ? 1 : barras.length <= 31 ? 3 : 7;

  return (
    <div>
      <div className="flex gap-2">
        <div
          className="relative w-6 shrink-0 text-right text-[11px] text-slate-500 tabular-nums"
          style={{ height: ALTO }}
        >
          {[tope, tope / 2, 0].map((valor, indice) => (
            <span key={valor} className="absolute right-0 -translate-y-1/2" style={{ top: (indice * ALTO) / 2 }}>
              {valor}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="relative" style={{ height: ALTO }}>
            {[0, 0.5, 1].map((fraccion) => (
              <div
                key={fraccion}
                className="absolute inset-x-0 h-px"
                style={{ top: fraccion * ALTO, background: GRILLA }}
              />
            ))}
            <div className="absolute inset-0 flex">
              {barras.map((barra, indice) => {
                const segmentos = SERIES.filter((serie) => barra[serie.clave] > 0);
                return (
                  <div
                    key={barra.clave}
                    className="relative flex h-full flex-1 items-end justify-center hover:bg-slate-100/60"
                    onMouseEnter={() => setActiva(indice)}
                    onMouseLeave={() => setActiva(null)}
                    onFocus={() => setActiva(indice)}
                    onBlur={() => setActiva(null)}
                    tabIndex={0}
                    aria-label={`${barra.etiqueta}: ${barra.pendientes} sin responder, ${barra.respondidas} respondidas`}
                  >
                    {/* De abajo hacia arriba: sin responder pegado a la base. */}
                    <div className="flex w-full max-w-6 flex-col-reverse gap-0.5 px-0.5">
                      {segmentos.map((serie, posicion) => (
                        <span
                          key={serie.clave}
                          className={posicion === segmentos.length - 1 ? "rounded-t" : ""}
                          style={{
                            background: COLOR[serie.clave],
                            height: Math.max(2, (barra[serie.clave] / tope) * ALTO - 2),
                          }}
                        />
                      ))}
                    </div>
                    {activa === indice ? (
                      <div
                        className={`absolute bottom-full z-10 mb-1 ${
                          indice > barras.length / 2 ? "right-0" : "left-0"
                        }`}
                      >
                        <Tooltip barra={barra} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-1 flex">
            {barras.map((barra, indice) => (
              <span key={barra.clave} className="flex-1 text-center text-[10px] whitespace-nowrap text-slate-500">
                {indice % cadaCuantas === 0 ? barra.etiqueta.split(" ")[1] : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <TablaDatos barras={barras} encabezado="Dia" />
    </div>
  );
}
