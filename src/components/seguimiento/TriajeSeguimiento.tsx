import Link from "next/link";
import type { ReactNode } from "react";
import { ESCALA_ESPERA, TRIAJES, type DatosTriaje, type Triaje } from "@/lib/seguimiento/indicadores";
import { ICONO_RELACION, RELACIONES, type Relacion } from "@/types/seguimiento";

/**
 * Tarjetas de triaje: tres numeros accionables. Cada tarjeta es un filtro de
 * la tabla (tocarla de nuevo lo saca); la activa se invierte. Los graficos
 * usan el color del texto, asi se leen igual en la tarjeta activa.
 */

const COLOR_RELACION: Record<Relacion, string> = { BUENA: "#16a34a", REGULAR: "#f59e0b", EN_RIESGO: "#dc2626" };

function diaCorto(dia: string): string {
  const [, mes, numero] = dia.split("-");
  return `${numero}/${mes}`;
}

function Tarjeta({
  triaje,
  activa,
  href,
  valor,
  dato,
  pie,
  children,
}: {
  triaje: Triaje;
  activa: boolean;
  href: string;
  valor: number;
  dato: string;
  pie: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={activa}
      title={activa ? "Quitar el filtro" : `Ver solo: ${TRIAJES[triaje].toLowerCase()}`}
      className={`group flex min-w-0 flex-col gap-3 rounded-2xl border px-5 py-4 transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none ${
        activa ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50/60"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={`text-xs ${activa ? "text-slate-300" : "text-slate-500"}`}>{TRIAJES[triaje]}</span>
        <span className={`text-[11px] ${activa ? "text-slate-300" : "text-slate-400 group-hover:text-slate-600"}`}>
          {activa ? "Filtrando · quitar ✕" : "Filtrar →"}
        </span>
      </span>
      <span className="flex items-start gap-1.5">
        <span className="text-[28px] leading-none font-medium tracking-tight tabular-nums">{valor}</span>
        <span className={`text-[11px] leading-none ${activa ? "text-slate-400" : "text-slate-400"}`}>{dato}</span>
      </span>
      <span className="block h-8">{children}</span>
      <span className={`-mt-1 text-[11px] ${activa ? "text-slate-400" : "text-slate-400"}`}>{pie}</span>
    </Link>
  );
}

/** Linea fina en el color del texto, con el dato de cada dia al pasar el mouse. */
function Linea({ serie }: { serie: DatosTriaje["ingresos"] }) {
  const ancho = 160;
  const alto = 32;
  const maximo = Math.max(1, ...serie.map((punto) => punto.cantidad));
  const x = (indice: number) => (indice / Math.max(1, serie.length - 1)) * ancho;
  const y = (valor: number) => alto - 3 - (valor / maximo) * (alto - 6);
  const ultimo = serie[serie.length - 1];
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" className="h-8 w-full overflow-visible" role="img" aria-label="Consultas que entraron por día, últimos 30 días">
      <polyline
        points={serie.map((punto, indice) => `${x(indice).toFixed(1)},${y(punto.cantidad).toFixed(1)}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {ultimo ? <circle cx={x(serie.length - 1)} cy={y(ultimo.cantidad)} r={2.5} fill="currentColor" /> : null}
      {serie.map((punto, indice) => (
        <rect key={punto.dia} x={x(indice) - ancho / serie.length / 2} y={0} width={ancho / serie.length} height={alto} fill="transparent">
          <title>{`${diaCorto(punto.dia)}: ${punto.cantidad}`}</title>
        </rect>
      ))}
    </svg>
  );
}

/** Pendientes por dias de espera; las de 1 dia o mas, marcadas. */
function Demoras({ demoras }: { demoras: DatosTriaje["demoras"] }) {
  const maximo = Math.max(1, ...demoras.map((fila) => fila.cantidad));
  return (
    <span className="flex h-8 items-end gap-[3px]" role="img" aria-label="Consultas pendientes según los días de espera">
      {demoras.map((fila) => (
        <span
          key={fila.dias}
          className="flex h-full flex-1 items-end"
          title={`${fila.dias === ESCALA_ESPERA ? `${fila.dias} días o más` : `${fila.dias} ${fila.dias === 1 ? "día" : "días"}`}: ${fila.cantidad}`}
        >
          <span
            className={`block w-full rounded-t-[2px] bg-current ${fila.dias >= 1 ? "" : "opacity-25"}`}
            style={{ height: `${Math.max(fila.cantidad ? 12 : 4, (fila.cantidad / maximo) * 100)}%` }}
          />
        </span>
      ))}
    </span>
  );
}

/** Chats pendientes por relacion (semaforo), en una sola barra. */
function Relaciones({ relaciones }: { relaciones: DatosTriaje["relaciones"] }) {
  const orden: Relacion[] = ["BUENA", "REGULAR", "EN_RIESGO"];
  const total = orden.reduce((suma, clave) => suma + relaciones[clave], 0);
  return (
    <span className="flex h-8 flex-col justify-end gap-1.5" role="img" aria-label="Chats pendientes según la relación con el cliente">
      <span className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
        {total === 0 ? <span className="block h-full w-full bg-current opacity-20" /> : null}
        {orden.map((clave) =>
          relaciones[clave] > 0 ? (
            <span
              key={clave}
              className="block h-full"
              style={{ width: `${(relaciones[clave] / total) * 100}%`, background: COLOR_RELACION[clave] }}
              title={`${RELACIONES[clave]}: ${relaciones[clave]}`}
            />
          ) : null,
        )}
      </span>
      <span className="flex gap-3 text-[11px] tabular-nums">
        {orden.map((clave) => (
          <span key={clave}>
            {ICONO_RELACION[clave]} {relaciones[clave]}
          </span>
        ))}
      </span>
    </span>
  );
}

export function TriajeSeguimiento({
  datos,
  activo,
  enlaces,
}: {
  datos: DatosTriaje;
  activo: Triaje | null;
  /** Link de cada tarjeta (activa = el que quita el filtro). */
  enlaces: Record<Triaje, string>;
}) {
  const { conteos } = datos;
  const porcentajeRiesgo = conteos.pendientes.chats === 0 ? 0 : Math.round((conteos.riesgo.chats / conteos.pendientes.chats) * 100);
  return (
    <section aria-label="Triaje del seguimiento" className="grid gap-4 md:grid-cols-3">
      <Tarjeta
        triaje="pendientes"
        activa={activo === "pendientes"}
        href={enlaces.pendientes}
        valor={conteos.pendientes.chats}
        dato={`${conteos.pendientes.consultas} consultas`}
        pie="Ingresos por día · 30 días"
      >
        <Linea serie={datos.ingresos} />
      </Tarjeta>
      <Tarjeta
        triaje="demora"
        activa={activo === "demora"}
        href={enlaces.demora}
        valor={conteos.demora.chats}
        dato={`${conteos.demora.consultas} consultas`}
        pie="Pendientes por días de espera (0 a 7+)"
      >
        <Demoras demoras={datos.demoras} />
      </Tarjeta>
      <Tarjeta
        triaje="riesgo"
        activa={activo === "riesgo"}
        href={enlaces.riesgo}
        valor={conteos.riesgo.chats}
        dato={`${porcentajeRiesgo}% de los chats`}
        pie="Chats pendientes por relación"
      >
        <Relaciones relaciones={datos.relaciones} />
      </Tarjeta>
    </section>
  );
}
