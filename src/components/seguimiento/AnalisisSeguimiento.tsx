import Link from "next/link";
import type { ReactNode } from "react";
import { BarrasHorizontales, Leyenda, SinDatos, numero } from "@/components/reclamos/informe/Graficos";
import { Icono } from "@/components/ui/Icono";
import { PERIODOS_ANALISIS, type Analisis, type PeriodoAnalisis } from "@/lib/seguimiento/analisis";

/**
 * "Ver analisis completo" del seguimiento: un desplegable (como el informe de
 * reclamos) con los indicadores, el volumen por semana, los motivos y los
 * reclamos por tipo y por grupo.
 */

const AZUL = "#2563eb";
const ROJO = "#dc2626";
const NARANJA = "#ea580c";
const GRIS = "#94a3b8";

const FECHA = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" });
const FECHA_ANIO = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });

const porciento = (valor: number) => `${Math.round(valor)}%`;

function Dato({ titulo, valor, detalle, alerta = false }: { titulo: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-medium tabular-nums ${alerta ? "text-red-600" : "text-slate-900"}`}>{valor}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{detalle}</p>
    </div>
  );
}

function Panel({ titulo, descripcion, children }: { titulo: string; descripcion?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-800">{titulo}</h4>
        {descripcion ? <p className="text-xs text-slate-500">{descripcion}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Columnas apiladas por semana: respondidas (abajo) y pendientes (arriba). */
function Semanas({ semanas }: { semanas: Analisis["semanas"] }) {
  const ancho = 640;
  const alto = 230;
  const margen = { arriba: 10, derecha: 8, abajo: 26, izquierda: 34 };
  const maximo = Math.max(1, ...semanas.map((semana) => semana.respondidas + semana.pendientes));
  const paso = Math.pow(10, Math.floor(Math.log10(maximo / 4)));
  const escala = [1, 2, 2.5, 5, 10].map((factor) => factor * paso).find((opcion) => opcion * 4 >= maximo) ?? paso * 10;
  const tope = escala * 4;
  const internoAlto = alto - margen.arriba - margen.abajo;
  const columna = (ancho - margen.izquierda - margen.derecha) / Math.max(1, semanas.length);
  const barra = Math.min(36, columna * 0.6);
  const y = (valor: number) => margen.arriba + internoAlto - (valor / tope) * internoAlto;
  const cada = Math.ceil(semanas.length / 14);
  return (
    <div className="flex flex-col gap-2">
      <Leyenda items={[{ etiqueta: "Respondidas", color: AZUL }, { etiqueta: "Pendientes", color: ROJO }]} />
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-auto w-full" role="img" aria-label="Consultas por semana, respondidas y pendientes">
        {[0, 1, 2, 3, 4].map((indice) => (
          <g key={indice} fontSize={11} fill="#64748b">
            <line x1={margen.izquierda} x2={ancho - margen.derecha} y1={y(indice * escala)} y2={y(indice * escala)} stroke="#e2e8f0" />
            <text x={margen.izquierda - 6} y={y(indice * escala) + 4} textAnchor="end">
              {numero.format(indice * escala)}
            </text>
          </g>
        ))}
        {semanas.map((semana, indice) => {
          const x = margen.izquierda + indice * columna + (columna - barra) / 2;
          const altoRespondidas = (semana.respondidas / tope) * internoAlto;
          const altoPendientes = (semana.pendientes / tope) * internoAlto;
          const base = margen.arriba + internoAlto;
          return (
            <g key={semana.lunes}>
              <title>{`Semana del ${semana.etiqueta}: ${semana.respondidas} respondidas, ${semana.pendientes} pendientes`}</title>
              <rect x={x} y={base - altoRespondidas} width={barra} height={altoRespondidas} fill={AZUL} rx={2} />
              {semana.pendientes > 0 ? (
                <rect x={x} y={base - altoRespondidas - altoPendientes} width={barra} height={Math.max(0, altoPendientes - 2)} fill={ROJO} rx={2} />
              ) : null}
              {indice % cada === 0 ? (
                <text x={x + barra / 2} y={alto - 8} textAnchor="middle" fontSize={11} fill="#64748b">
                  {semana.etiqueta}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Barras horizontales con la linea del promedio general. */
function ConPromedio({ filas, promedio }: { filas: Analisis["porGrupo"]; promedio: number }) {
  const maximo = Math.max(promedio, ...filas.map((fila) => fila.tasa)) * 1.05;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2.5">
        {filas.map((fila) => {
          const alta = fila.tasa >= promedio * 1.5;
          return (
            <li
              key={fila.grupo}
              className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2 text-sm"
              title={`${fila.grupo}: ${fila.reclamos} reclamos en ${fila.consultas} consultas`}
            >
              <span className="truncate text-right text-slate-700">{fila.grupo}</span>
              <span className="relative block h-3.5">
                <span className="absolute inset-y-0 left-0 rounded-r-sm" style={{ width: `${(fila.tasa / maximo) * 100}%`, background: alta ? ROJO : GRIS }} />
                <span className="absolute -inset-y-1 border-l border-dashed border-slate-500" style={{ left: `${(promedio / maximo) * 100}%` }} />
              </span>
              <span className="text-xs text-slate-600 tabular-nums">{numero.format(Math.round(fila.tasa * 10) / 10)}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-500">
        Línea punteada: promedio general ({numero.format(Math.round(promedio * 10) / 10)} cada 100). En rojo, los grupos con 1,5 veces el promedio o más.
      </p>
    </div>
  );
}

function Periodos({ actual, parametros }: { actual: PeriodoAnalisis; parametros: Record<string, string> }) {
  return (
    <nav aria-label="Período del análisis" className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {(Object.keys(PERIODOS_ANALISIS) as PeriodoAnalisis[]).map((periodo) => {
        const query = new URLSearchParams({ ...parametros, analisis: "1", periodoAnalisis: periodo });
        return (
          <Link
            key={periodo}
            href={`/seguimiento?${query.toString()}`}
            scroll={false}
            aria-current={actual === periodo ? "true" : undefined}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${actual === periodo ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {PERIODOS_ANALISIS[periodo].etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

export function AnalisisSeguimiento({
  analisis,
  abierto,
  parametros,
}: {
  analisis: Analisis;
  abierto: boolean;
  /** Los demas parametros de la URL, para no perderlos al cambiar el periodo. */
  parametros: Record<string, string>;
}) {
  const { rango } = analisis;
  const colorMotivo = (hito: string) => (hito === "Reclamo" ? ROJO : hito === "Estado de pedido" ? NARANJA : AZUL);

  return (
    <details open={abierto} className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#1b2b5e]">
          <Icono nombre="grafico" className="size-4" />
          <span className="group-open:hidden">Ver análisis completo</span>
          <span className="hidden group-open:inline">Ocultar análisis</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <span className="hidden sm:inline">Volumen por semana, motivos y reclamos</span>
          <Icono nombre="abajo" className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="flex flex-col gap-6 border-t border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            {rango.desde && rango.hasta
              ? `Consultas del ${FECHA.format(rango.desde)} al ${FECHA_ANIO.format(rango.hasta)}`
              : "Sin consultas en el período"}
          </p>
          <Periodos actual={analisis.periodo.clave} parametros={parametros} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Dato
            titulo="Consultas registradas"
            valor={numero.format(analisis.total)}
            detalle={rango.desde && rango.hasta ? `${FECHA.format(rango.desde)} al ${FECHA_ANIO.format(rango.hasta)}` : "—"}
          />
          <Dato
            titulo="Marcadas como respondidas"
            valor={porciento(analisis.respondidas.porcentaje)}
            detalle={`${numero.format(analisis.respondidas.cantidad)} de ${numero.format(analisis.total)}`}
          />
          <Dato
            titulo="Pendientes sin marcar"
            valor={numero.format(analisis.pendientes.cantidad)}
            detalle={analisis.pendientes.conMasDe30Dias ? `${analisis.pendientes.conMasDe30Dias} con más de 30 días` : "ninguna con más de 30 días"}
            alerta={analisis.pendientes.cantidad > 0}
          />
          <Dato
            titulo="Reclamos"
            valor={numero.format(analisis.reclamos.cantidad)}
            detalle={`${porciento(analisis.reclamos.porcentaje)} del total de consultas`}
          />
          <Dato
            titulo="Reclamos por falta de respuesta"
            valor={numero.format(analisis.reclamos.faltaDeRespuesta)}
            detalle="El cliente dice que no le contestan"
            alerta={analisis.reclamos.faltaDeRespuesta > 0}
          />
          <Dato
            titulo="Registradas por el bot"
            valor={porciento(analisis.bot.porcentaje)}
            detalle={analisis.bot.desde ? `Casi todas desde la semana del ${analisis.bot.desde}` : `${numero.format(analisis.total - analisis.bot.cantidad)} cargadas a mano`}
          />
        </div>

        <section className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-slate-900">Volumen y motivos</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              titulo="Consultas por semana"
              descripcion={
                analisis.semanasAtrasadas.length
                  ? `Respondidas vs. todavía sin marcar. ${
                      analisis.semanasAtrasadas.length === 1
                        ? `La semana del ${analisis.semanasAtrasadas[0]} concentra`
                        : `Las semanas del ${analisis.semanasAtrasadas.join(" y ")} concentran`
                    } el atraso sin cerrar.`
                  : "Respondidas vs. todavía sin marcar."
              }
            >
              {analisis.semanas.length ? <Semanas semanas={analisis.semanas} /> : <SinDatos>Sin consultas con fecha en el período.</SinDatos>}
            </Panel>
            <Panel titulo="¿De qué nos consultan?" descripcion='Total del período por motivo ("Hito a responder").'>
              {analisis.motivos.length ? (
                <BarrasHorizontales
                  filas={analisis.motivos.map((fila) => ({
                    etiqueta: fila.hito,
                    valor: fila.cantidad,
                    detalle: `· ${porciento(fila.porcentaje)}`,
                    color: colorMotivo(fila.hito),
                  }))}
                />
              ) : (
                <SinDatos>Sin consultas en el período.</SinDatos>
              )}
            </Panel>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-slate-900">Reclamos</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel titulo="Tipos de reclamo" descripcion="Clasificación de cada reclamo según el texto del mensaje.">
              {analisis.tiposReclamo.length ? (
                <BarrasHorizontales
                  filas={analisis.tiposReclamo.map((fila, indice) => ({
                    etiqueta: fila.tipo,
                    valor: fila.cantidad,
                    detalle: `· ${porciento(fila.porcentaje)}`,
                    color: indice === 0 ? ROJO : GRIS,
                  }))}
                />
              ) : (
                <SinDatos>Sin reclamos en el período.</SinDatos>
              )}
            </Panel>
            <Panel
              titulo="Reclamos cada 100 consultas, por grupo"
              descripcion={`Grupos con ${analisis.minimoPorGrupo} consultas o más.`}
            >
              {analisis.porGrupo.length ? (
                <ConPromedio filas={analisis.porGrupo} promedio={analisis.promedioPorGrupo} />
              ) : (
                <SinDatos>Ningún grupo llega a {analisis.minimoPorGrupo} consultas con reclamos en el período.</SinDatos>
              )}
            </Panel>
          </div>
        </section>
      </div>
    </details>
  );
}
