"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ICONO_RELACION, RELACIONES, type EventoHistorial, type Relacion } from "@/types/seguimiento";

/**
 * Historial del cliente como un scroll cronologico: las interacciones
 * aparecen a medida que se baja, los meses quedan fijos arriba y los
 * episodios en que la relacion estuvo en riesgo se agrupan y resaltan, con el
 * momento en que se recupero. La barra de arriba muestra todo el recorrido:
 * marca donde estas y deja saltar a cada episodio.
 */

export type EventoLinea = EventoHistorial & {
  /** Mensaje (o resumen) del cliente y quien lo atendio, ya resueltos. */
  mensaje: string;
  agente: string;
};

type Episodio = { numero: number; eventos: EventoLinea[]; recuperacion: EventoLinea | null };
type Bloque = { clase: "evento"; evento: EventoLinea } | { clase: "episodio"; episodio: Episodio };

const COLOR: Record<Relacion, string> = { BUENA: "#16a34a", REGULAR: "#f59e0b", EN_RIESGO: "#dc2626" };
const BADGE: Record<Relacion, string> = {
  BUENA: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REGULAR: "bg-amber-50 text-amber-800 ring-amber-200",
  EN_RIESGO: "bg-red-50 text-red-700 ring-red-200",
};
const TIPO: Record<EventoHistorial["tipo"], string> = { finalizada: "Chat resuelto", reabierta: "Se reabrió", nota: "Nota" };

const FECHA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const DIA = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "short" });
const MES = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", month: "long", year: "numeric" });

function mesDe(fecha: string): string {
  const texto = MES.format(new Date(fecha));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Badge({ relacion }: { relacion: Relacion }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BADGE[relacion]}`}>
      <span aria-hidden="true">{ICONO_RELACION[relacion]}</span>
      {RELACIONES[relacion]}
    </span>
  );
}

/** Agrupa los cierres consecutivos en riesgo (con lo que pasa en el medio) en episodios. */
function armarBloques(eventos: readonly EventoLinea[]): Bloque[] {
  const bloques: Bloque[] = [];
  let actual: Episodio | null = null;
  let numero = 0;
  for (const evento of eventos) {
    const cierre = evento.tipo === "finalizada" ? evento.relacion : null;
    if (actual) {
      if (cierre && cierre !== "EN_RIESGO") {
        actual.recuperacion = evento;
        actual = null;
        continue;
      }
      actual.eventos.push(evento);
      continue;
    }
    if (cierre === "EN_RIESGO") {
      numero += 1;
      actual = { numero, eventos: [evento], recuperacion: null };
      bloques.push({ clase: "episodio", episodio: actual });
      continue;
    }
    bloques.push({ clase: "evento", evento });
  }
  return bloques;
}

function dias(desde: string, hasta: string): number {
  return Math.max(1, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000));
}

/** Una interaccion: aparece (fade + subida) la primera vez que entra en el scroll. */
function Nodo({ evento, visible, dentroDeEpisodio = false }: { evento: EventoLinea; visible: boolean; dentroDeEpisodio?: boolean }) {
  const relacion = evento.tipo === "finalizada" ? evento.relacion : null;
  return (
    <li
      data-id={evento.id}
      className={`relative scroll-mt-12 pb-5 pl-6 transition duration-500 last:pb-1 ${
        visible ? "translate-y-0 opacity-100" : "motion-safe:translate-y-3 motion-safe:opacity-0"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1.5 -left-[5px] rounded-full ring-4 ${dentroDeEpisodio ? "ring-red-50" : "ring-white"} ${
          relacion === "EN_RIESGO" ? "size-3 -left-[6px]" : "size-2.5"
        }`}
        style={{ background: relacion ? COLOR[relacion] : "#cbd5e1" }}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <time dateTime={evento.fecha} className="font-medium text-slate-700">
          {FECHA.format(new Date(evento.fecha))}
        </time>
        <span aria-hidden="true">·</span>
        <span>{evento.agente}</span>
        {evento.hito ? (
          <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 ring-inset">
            {evento.hito}
          </span>
        ) : null}
        {evento.tipo !== "finalizada" ? <span className="text-[11px] text-slate-400 italic">{TIPO[evento.tipo]}</span> : null}
        {relacion ? (
          <span className="ml-auto">
            <Badge relacion={relacion} />
          </span>
        ) : null}
      </div>
      {evento.mensaje ? (
        <p className={`mt-1.5 text-sm ${relacion === "EN_RIESGO" ? "font-medium text-red-950" : "text-slate-800"}`}>{evento.mensaje}</p>
      ) : null}
      {evento.tipo === "finalizada" ? (
        <p className="mt-1 text-sm text-slate-600">
          <span className="text-slate-400">Resolución:</span>{" "}
          <span className="font-medium text-slate-800">{evento.resultado ?? "Sin resultado"}</span>
          {evento.observacion ? ` — ${evento.observacion}` : ""}
        </p>
      ) : evento.observacion ? (
        <p className="mt-1 text-sm text-slate-500">{evento.observacion}</p>
      ) : null}
    </li>
  );
}

export function LineaDeTiempoCliente({ eventos: crudos }: { eventos: EventoLinea[] }) {
  const eventos = useMemo(() => [...crudos].sort((a, b) => a.fecha.localeCompare(b.fecha)), [crudos]);
  const bloques = useMemo(() => armarBloques(eventos), [eventos]);
  // La primera interaccion de cada mes lleva el encabezado del mes.
  const primerosDelMes = useMemo(
    () => new Set(eventos.filter((evento, indice) => indice === 0 || mesDe(evento.fecha) !== mesDe(eventos[indice - 1].fecha)).map((evento) => evento.id)),
    [eventos],
  );
  const episodios = bloques.flatMap((bloque) => (bloque.clase === "episodio" ? [bloque.episodio] : []));
  const cierres = eventos.filter((evento) => evento.tipo === "finalizada" && evento.relacion);
  const enRiesgo = cierres.filter((evento) => evento.relacion === "EN_RIESGO");

  const contenedor = useRef<HTMLDivElement>(null);
  const [visibles, setVisibles] = useState<ReadonlySet<string>>(new Set());
  const [enPantalla, setEnPantalla] = useState<string | null>(null);
  const posicion = useMemo(() => new Map(eventos.map((evento, indice) => [evento.id, indice])), [eventos]);

  // Cada interaccion aparece al entrar en el scroll; la barra marca la de mas arriba.
  useEffect(() => {
    const raiz = contenedor.current;
    if (!raiz) return;
    const enVista = new Set<string>();
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const id = (entrada.target as HTMLElement).dataset.id ?? "";
          if (entrada.isIntersecting) enVista.add(id);
          else enVista.delete(id);
        }
        const nuevas = entradas.filter((entrada) => entrada.isIntersecting).map((entrada) => (entrada.target as HTMLElement).dataset.id ?? "");
        if (nuevas.length > 0) setVisibles((previas) => new Set([...previas, ...nuevas]));
        const arriba = [...enVista].sort((a, b) => (posicion.get(a) ?? 0) - (posicion.get(b) ?? 0))[0];
        if (arriba) setEnPantalla(arriba);
      },
      { root: raiz, threshold: 0.35 },
    );
    raiz.querySelectorAll<HTMLElement>("[data-id]").forEach((nodo) => observador.observe(nodo));
    return () => observador.disconnect();
  }, [bloques, posicion]);

  /** Lleva el scroll a una interaccion o, si es un episodio, al bloque entero (con su titulo). */
  function ir(selector: string) {
    contenedor.current?.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (eventos.length === 0) {
    return (
      <p className="mt-6 rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Todavía no hay conversaciones finalizadas con este cliente.
      </p>
    );
  }

  const indiceEnPantalla = enPantalla ? cierres.findIndex((evento) => evento.id === enPantalla) : -1;

  const encabezadoMes = (evento: EventoLinea) =>
    primerosDelMes.has(evento.id) ? (
      <li className="sticky top-0 z-10 -ml-px bg-white/95 py-2 pl-6 backdrop-blur">
        <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{mesDe(evento.fecha)}</span>
      </li>
    ) : null;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* Resumen y recorrido completo */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <p>
            <span className="text-2xl font-medium text-slate-900 tabular-nums">{cierres.length}</span>{" "}
            <span className="text-slate-500">chats resueltos</span>
          </p>
          <p>
            <span className="text-2xl font-medium text-red-600 tabular-nums">{episodios.length}</span>{" "}
            <span className="text-slate-500">{episodios.length === 1 ? "episodio en riesgo" : "episodios en riesgo"}</span>
          </p>
          <p>
            <span className="text-2xl font-medium text-slate-900 tabular-nums">
              {cierres.length ? Math.round((enRiesgo.length / cierres.length) * 100) : 0}%
            </span>{" "}
            <span className="text-slate-500">de los cierres en riesgo</span>
          </p>
        </div>

        <div className="mt-3 flex h-5 items-end gap-[2px]" role="list" aria-label="Recorrido de la relación, del más viejo al más nuevo">
          {cierres.map((evento, indice) => (
            <button
              key={evento.id}
              type="button"
              role="listitem"
              onClick={() => ir(`[data-id="${CSS.escape(evento.id)}"]`)}
              title={`${DIA.format(new Date(evento.fecha))} · ${RELACIONES[evento.relacion!]} · ${evento.hito}`}
              className={`min-w-[3px] flex-1 rounded-sm transition-opacity hover:opacity-70 ${
                evento.relacion === "EN_RIESGO" ? "h-5" : "h-2.5"
              } ${indiceEnPantalla === indice ? "outline-2 outline-offset-1 outline-slate-900" : ""}`}
              style={{ background: COLOR[evento.relacion!] }}
            />
          ))}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>{DIA.format(new Date(cierres[0]?.fecha ?? eventos[0].fecha))}</span>
          <span className="flex gap-3 text-slate-500">
            {(Object.keys(COLOR) as Relacion[]).map((relacion) => (
              <span key={relacion} className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm" style={{ background: COLOR[relacion] }} />
                {RELACIONES[relacion]}
              </span>
            ))}
          </span>
          <span>Hoy</span>
        </div>

        {episodios.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {episodios.map((episodio) => (
              <button
                key={episodio.numero}
                type="button"
                onClick={() => ir(`[data-episodio="${episodio.numero}"]`)}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                🔴 Episodio {episodio.numero} · {DIA.format(new Date(episodio.eventos[0].fecha))}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Scroll cronologico */}
      <div ref={contenedor} className="max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white px-4 pb-4">
        <ol className="relative ml-2 border-l border-slate-200">
          {bloques.map((bloque) => {
            if (bloque.clase === "evento") {
              return (
                <Fragment key={bloque.evento.id}>
                  {encabezadoMes(bloque.evento)}
                  <Nodo evento={bloque.evento} visible={visibles.has(bloque.evento.id)} />
                </Fragment>
              );
            }
            const { episodio } = bloque;
            const primero = episodio.eventos[0];
            const ultimo = episodio.eventos[episodio.eventos.length - 1];
            const cierresEnRiesgo = episodio.eventos.filter((evento) => evento.tipo === "finalizada").length;
            return (
              <Fragment key={`episodio-${episodio.numero}`}>
                {encabezadoMes(primero)}
                <li className="relative -ml-px py-1">
                  <section
                    data-episodio={episodio.numero}
                    aria-label={`Episodio en riesgo ${episodio.numero}`}
                    className="scroll-mt-10 rounded-r-xl border-l-4 border-red-500 bg-red-50/70 py-3 pr-3"
                  >
                    <p className="mb-3 flex flex-wrap items-center gap-2 pl-4 text-xs font-semibold text-red-700">
                      <span aria-hidden="true">⚠</span>
                      Episodio en riesgo {episodio.numero}
                      <span className="font-normal text-red-600/80">
                        · {cierresEnRiesgo} {cierresEnRiesgo === 1 ? "chat" : "chats"} ·{" "}
                        {dias(primero.fecha, episodio.recuperacion?.fecha ?? ultimo.fecha)} días
                        {episodio.recuperacion ? "" : " · sin recuperar todavía"}
                      </span>
                    </p>
                    <ol className="ml-2 border-l border-red-200">
                      {episodio.eventos.map((evento) => (
                        <Nodo key={evento.id} evento={evento} visible={visibles.has(evento.id)} dentroDeEpisodio />
                      ))}
                    </ol>
                  </section>
                </li>
                {episodio.recuperacion ? (
                  <>
                    <li className="relative py-2 pl-6">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 ring-inset">
                        ✓ Relación recuperada el {DIA.format(new Date(episodio.recuperacion.fecha))}
                        {episodio.recuperacion.relacion ? ` · quedó ${RELACIONES[episodio.recuperacion.relacion].toLowerCase()}` : ""}
                      </span>
                    </li>
                    {encabezadoMes(episodio.recuperacion)}
                    <Nodo evento={episodio.recuperacion} visible={visibles.has(episodio.recuperacion.id)} />
                  </>
                ) : null}
              </Fragment>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
