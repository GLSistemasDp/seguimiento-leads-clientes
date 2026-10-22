import type { ReactNode } from "react";

/**
 * Graficos del informe de reclamos, en SVG/CSS sin librerias. Se renderizan
 * en el servidor; el detalle de cada valor va en el `title` (al pasar el
 * mouse) y en el texto, para no depender solo del color.
 */

const GRILLA = "#e2e8f0";
const TEXTO = "#64748b";

export const numero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
export const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

/** $ 1,2 M / $ 350 mil, para ejes y etiquetas chicas. */
export function pesosCorto(valor: number): string {
  if (valor >= 1_000_000) return `$ ${numero.format(valor / 1_000_000)} M`;
  if (valor >= 1_000) return `$ ${numero.format(Math.round(valor / 1_000))} mil`;
  return pesos.format(valor);
}

export function SinDatos({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Leyenda({ items }: { items: readonly { etiqueta: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((item) => (
        <li key={item.etiqueta} className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />
          {item.etiqueta}
        </li>
      ))}
    </ul>
  );
}

/** Linea minima para las cards (sin ejes). */
export function Sparkline({ valores, color, etiqueta }: { valores: readonly number[]; color: string; etiqueta: string }) {
  if (valores.length < 2) return null;
  const maximo = Math.max(...valores, 1);
  const minimo = Math.min(...valores, 0);
  const alto = 32;
  const puntos = valores.map((valor, indice) => {
    const x = (indice / (valores.length - 1)) * 100;
    const y = alto - 2 - ((valor - minimo) / (maximo - minimo || 1)) * (alto - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg viewBox={`0 0 100 ${alto}`} preserveAspectRatio="none" className="h-8 w-full" role="img" aria-label={etiqueta}>
      <title>{etiqueta}</title>
      <polygon points={`0,${alto} ${puntos.join(" ")} 100,${alto}`} fill={color} opacity={0.12} />
      <polyline points={puntos.join(" ")} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Barra de valor dentro de una celda de tabla. */
export function BarraInline({ valor, maximo, color = "#2563eb" }: { valor: number; maximo: number; color?: string }) {
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <span className="block h-full rounded-full" style={{ width: `${maximo ? (valor / maximo) * 100 : 0}%`, background: color }} />
    </span>
  );
}

export type FilaBarra = { etiqueta: string; valor: number; color?: string; detalle?: string };

export function BarrasHorizontales({
  filas,
  formato = (valor: number) => numero.format(valor),
  color = "#2563eb",
}: {
  filas: readonly FilaBarra[];
  formato?: (valor: number) => string;
  color?: string;
}) {
  const maximo = Math.max(...filas.map((fila) => fila.valor), 0);
  return (
    <ul className="flex flex-col gap-2.5">
      {filas.map((fila) => (
        <li key={fila.etiqueta} title={`${fila.etiqueta}: ${formato(fila.valor)}${fila.detalle ? ` · ${fila.detalle}` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">{fila.etiqueta}</span>
            <span className="shrink-0 font-semibold text-slate-900 tabular-nums">
              {formato(fila.valor)}
              {fila.detalle ? <span className="ml-1 text-xs font-normal text-slate-500">{fila.detalle}</span> : null}
            </span>
          </div>
          <BarraInline valor={fila.valor} maximo={maximo} color={fila.color ?? color} />
        </li>
      ))}
    </ul>
  );
}

export type Serie = { nombre: string; color: string; valores: readonly (number | null)[] };

/** Escala "linda" para el eje Y: 0 a un maximo redondo, 4 divisiones. */
function escala(maximo: number): number[] {
  if (maximo <= 0) return [0, 1, 2, 3, 4];
  const paso = Math.pow(10, Math.floor(Math.log10(maximo / 4)));
  const opciones = [1, 2, 2.5, 5, 10].map((factor) => factor * paso);
  const elegido = opciones.find((opcion) => opcion * 4 >= maximo) ?? opciones[opciones.length - 1];
  return [0, 1, 2, 3, 4].map((indice) => indice * elegido);
}

const ANCHO = 640;
const ALTO = 220;
const MARGEN = { arriba: 12, derecha: 12, abajo: 26, izquierda: 52 };

function Ejes({
  marcas,
  etiquetas,
  formato,
  centrado,
}: {
  marcas: number[];
  etiquetas: readonly string[];
  formato: (valor: number) => string;
  centrado: boolean;
}) {
  const alto = ALTO - MARGEN.arriba - MARGEN.abajo;
  const ancho = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const tope = marcas[marcas.length - 1];
  const cada = Math.ceil(etiquetas.length / 12);
  return (
    <g fontSize={11} fill={TEXTO}>
      {marcas.map((marca) => {
        const y = MARGEN.arriba + alto - (marca / tope) * alto;
        return (
          <g key={marca}>
            <line x1={MARGEN.izquierda} x2={ANCHO - MARGEN.derecha} y1={y} y2={y} stroke={GRILLA} />
            <text x={MARGEN.izquierda - 6} y={y + 4} textAnchor="end">
              {formato(marca)}
            </text>
          </g>
        );
      })}
      {etiquetas.map((etiqueta, indice) =>
        indice % cada === 0 ? (
          <text
            key={etiqueta}
            x={
              MARGEN.izquierda +
              (centrado ? ((indice + 0.5) / etiquetas.length) * ancho : (indice / Math.max(1, etiquetas.length - 1)) * ancho)
            }
            y={ALTO - 8}
            textAnchor="middle"
          >
            {etiqueta}
          </text>
        ) : null,
      )}
    </g>
  );
}

/** Lineas en el tiempo (una por serie). */
export function Lineas({
  etiquetas,
  series,
  formato = (valor: number) => numero.format(valor),
  descripcion,
}: {
  etiquetas: readonly string[];
  series: readonly Serie[];
  formato?: (valor: number) => string;
  descripcion: string;
}) {
  const valores = series.flatMap((serie) => serie.valores.filter((valor): valor is number => valor !== null));
  const marcas = escala(Math.max(...valores, 0));
  const tope = marcas[marcas.length - 1];
  const alto = ALTO - MARGEN.arriba - MARGEN.abajo;
  const ancho = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const x = (indice: number) => MARGEN.izquierda + (indice / Math.max(1, etiquetas.length - 1)) * ancho;
  const y = (valor: number) => MARGEN.arriba + alto - (valor / tope) * alto;
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="h-auto w-full" role="img" aria-label={descripcion}>
        <Ejes marcas={marcas} etiquetas={etiquetas} formato={formato} centrado={false} />
        {series.map((serie) => {
          const puntos = serie.valores
            .map((valor, indice) => (valor === null ? null : `${x(indice).toFixed(1)},${y(valor).toFixed(1)}`))
            .filter(Boolean);
          return (
            <g key={serie.nombre}>
              <polyline points={puntos.join(" ")} fill="none" stroke={serie.color} strokeWidth={2.25} strokeLinejoin="round" />
              {serie.valores.map((valor, indice) =>
                valor === null ? null : (
                  <circle key={indice} cx={x(indice)} cy={y(valor)} r={3} fill="white" stroke={serie.color} strokeWidth={1.75}>
                    <title>{`${serie.nombre} · ${etiquetas[indice]}: ${formato(valor)}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      {series.length > 1 ? <Leyenda items={series.map((serie) => ({ etiqueta: serie.nombre, color: serie.color }))} /> : null}
    </div>
  );
}

/** Columnas agrupadas: una barra por serie en cada categoria (ej. año actual vs anterior). */
export function ColumnasAgrupadas({
  etiquetas,
  series,
  formato = (valor: number) => numero.format(valor),
  descripcion,
}: {
  etiquetas: readonly string[];
  series: readonly Serie[];
  formato?: (valor: number) => string;
  descripcion: string;
}) {
  const valores = series.flatMap((serie) => serie.valores.filter((valor): valor is number => valor !== null));
  const marcas = escala(Math.max(...valores, 0));
  const tope = marcas[marcas.length - 1];
  const alto = ALTO - MARGEN.arriba - MARGEN.abajo;
  const ancho = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const grupo = ancho / etiquetas.length;
  const barra = Math.min(18, (grupo * 0.75) / series.length);
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="h-auto w-full" role="img" aria-label={descripcion}>
        <Ejes marcas={marcas} etiquetas={etiquetas} formato={formato} centrado />
        {etiquetas.map((etiqueta, indice) =>
          series.map((serie, posicion) => {
            const valor = serie.valores[indice];
            if (valor === null || valor === undefined) return null;
            const altura = (valor / tope) * alto;
            const inicio = MARGEN.izquierda + indice * grupo + (grupo - barra * series.length) / 2 + posicion * barra;
            return (
              <rect key={`${etiqueta}-${serie.nombre}`} x={inicio} y={MARGEN.arriba + alto - altura} width={barra - 2} height={altura} rx={2} fill={serie.color}>
                <title>{`${serie.nombre} · ${etiqueta}: ${formato(valor)}`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <Leyenda items={series.map((serie) => ({ etiqueta: serie.nombre, color: serie.color }))} />
    </div>
  );
}

/** Columnas verticales simples, con el valor arriba y una nota debajo. */
export function Columnas({
  filas,
  formato = (valor: number) => numero.format(valor),
  color = "#2563eb",
}: {
  filas: readonly { etiqueta: string; valor: number | null; nota?: string }[];
  formato?: (valor: number) => string;
  color?: string;
}) {
  const maximo = Math.max(...filas.map((fila) => fila.valor ?? 0), 0);
  return (
    <div className="flex h-52 items-end gap-3 border-b border-slate-200 px-1">
      {filas.map((fila) => (
        <div
          key={fila.etiqueta}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${fila.etiqueta}: ${fila.valor === null ? "sin datos" : formato(fila.valor)}${fila.nota ? ` · ${fila.nota}` : ""}`}
        >
          <span className="text-xs font-semibold text-slate-900 tabular-nums">{fila.valor === null ? "—" : formato(fila.valor)}</span>
          <span
            className="w-full max-w-14 rounded-t-md"
            style={{ height: `${maximo && fila.valor ? (fila.valor / maximo) * 75 : 0}%`, background: color, minHeight: fila.valor ? 4 : 0 }}
          />
          <span className="w-full truncate text-center text-[11px] leading-tight text-slate-600">{fila.etiqueta}</span>
          {fila.nota ? <span className="text-[10px] text-slate-400">{fila.nota}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Barras apiladas al 100%: la composicion de cada fila. */
export function Apiladas100({
  filas,
  series,
}: {
  filas: readonly { etiqueta: string; partes: readonly number[] }[];
  series: readonly { etiqueta: string; color: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {filas.map((fila) => {
          const total = fila.partes.reduce((suma, valor) => suma + valor, 0);
          return (
            <li key={fila.etiqueta} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-2 text-sm">
              <span className="truncate text-slate-700" title={fila.etiqueta}>
                {fila.etiqueta}
              </span>
              <span className="flex h-5 overflow-hidden rounded-md bg-slate-100">
                {fila.partes.map((valor, indice) =>
                  valor > 0 ? (
                    <span
                      key={series[indice].etiqueta}
                      className="flex items-center justify-center text-[10px] font-semibold text-white"
                      style={{ width: `${(valor / total) * 100}%`, background: series[indice].color }}
                      title={`${fila.etiqueta} · ${series[indice].etiqueta}: ${valor} (${Math.round((valor / total) * 100)}%)`}
                    >
                      {valor / total >= 0.12 ? `${Math.round((valor / total) * 100)}%` : ""}
                    </span>
                  ) : null,
                )}
              </span>
              <span className="text-right text-xs text-slate-500 tabular-nums">{total}</span>
            </li>
          );
        })}
      </ul>
      <Leyenda items={series} />
    </div>
  );
}

/** Dona para pocas categorias (2 a 4) donde importa la proporcion. */
export function Dona({
  partes,
  centro,
  descripcion,
}: {
  partes: readonly { etiqueta: string; valor: number; color: string }[];
  centro: string;
  descripcion: string;
}) {
  const total = partes.reduce((suma, parte) => suma + parte.valor, 0);
  const radio = 40;
  const circunferencia = 2 * Math.PI * radio;
  // Donde empieza cada segmento: la suma de los anteriores.
  const largos = partes.map((parte) => (total ? (parte.valor / total) * circunferencia : 0));
  const inicios = largos.map((_, indice) => largos.slice(0, indice).reduce((suma, largo) => suma + largo, 0));
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 100 100" className="size-36 shrink-0 -rotate-90" role="img" aria-label={descripcion}>
        <circle cx={50} cy={50} r={radio} fill="none" stroke="#f1f5f9" strokeWidth={14} />
        {partes.map((parte, indice) => (
            <circle
              key={parte.etiqueta}
              cx={50}
              cy={50}
              r={radio}
              fill="none"
              stroke={parte.color}
              strokeWidth={14}
              strokeDasharray={`${largos[indice]} ${circunferencia - largos[indice]}`}
              strokeDashoffset={-inicios[indice]}
            >
              <title>{`${parte.etiqueta}: ${parte.valor}`}</title>
            </circle>
        ))}
        <text x={50} y={50} transform="rotate(90 50 50)" textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700} fill="#0f172a">
          {centro}
        </text>
      </svg>
      <ul className="flex min-w-36 flex-1 flex-col gap-1.5 text-sm">
        {partes.map((parte) => (
          <li key={parte.etiqueta} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-700">
              <span className="size-2.5 rounded-sm" style={{ background: parte.color }} />
              {parte.etiqueta}
            </span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {parte.valor}
              <span className="ml-1 text-xs font-normal text-slate-500">{total ? `${Math.round((parte.valor / total) * 100)}%` : ""}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Embudo de un proceso secuencial: cada etapa con su % sobre la primera. */
export function Embudo({ etapas }: { etapas: readonly { etapa: string; cantidad: number }[] }) {
  const primera = etapas[0]?.cantidad ?? 0;
  const colores = ["#1b2b5e", "#2563eb", "#0ea5e9", "#16a34a"];
  return (
    <ol className="flex flex-col items-center gap-1.5">
      {etapas.map((etapa, indice) => {
        const proporcion = primera ? etapa.cantidad / primera : 0;
        return (
          <li
            key={etapa.etapa}
            className="flex h-11 items-center justify-between gap-2 rounded-md px-3 text-sm text-white"
            style={{ width: `${Math.max(38, proporcion * 100)}%`, background: colores[indice % colores.length] }}
            title={`${etapa.etapa}: ${etapa.cantidad}`}
          >
            <span className="truncate font-medium">{etapa.etapa}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {etapa.cantidad}
              {indice > 0 && primera ? <span className="ml-1 text-xs font-normal opacity-80">{Math.round(proporcion * 100)}%</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
