"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icono } from "@/components/ui/Icono";
import { alertasCliente, rutaPerfil, separarCliente } from "@/lib/seguimiento/presentacion";
import { formatearFechaHora } from "@/lib/utils/dates";
import { RELACIONES } from "@/types/seguimiento";
import type { Consulta, EventoHistorial } from "@/types/seguimiento";

const TIPOS: Record<EventoHistorial["tipo"], { etiqueta: string; estilo: string }> = {
  finalizada: { etiqueta: "Finalizada", estilo: "bg-emerald-600" },
  reabierta: { etiqueta: "Volvió a la cola", estilo: "bg-amber-500" },
  nota: { etiqueta: "Nota", estilo: "bg-slate-400" },
};

const ESTILO_RELACION = {
  BUENA: "text-emerald-700",
  REGULAR: "text-amber-700",
  EN_RIESGO: "text-red-700",
} as const;

/** Demora antes de abrir (pasar el mouse de largo no la abre) y antes de cerrar (da tiempo a entrar a la tarjeta). */
const DEMORA_ABRIR_MS = 300;
const DEMORA_CERRAR_MS = 150;
const ANCHO_TARJETA = 560;
const MARGEN = 16;

/** El historial de cada cliente se pide una vez por minuto, no en cada pasada del mouse. */
const VIGENCIA_HISTORIAL_MS = 60_000;
const historiales = new Map<string, { pedido: Promise<EventoHistorial[]>; leido: number }>();

function pedirHistorial(cliente: string): Promise<EventoHistorial[]> {
  const previo = historiales.get(cliente);
  if (previo && Date.now() - previo.leido < VIGENCIA_HISTORIAL_MS) return previo.pedido;
  const pedido = fetch(`/api/seguimiento/historial?cliente=${encodeURIComponent(cliente)}`)
    .then((respuesta) => (respuesta.ok ? respuesta.json() : Promise.reject(new Error(String(respuesta.status)))))
    .then((cuerpo: { eventos: EventoHistorial[] }) => cuerpo.eventos);
  historiales.set(cliente, { pedido, leido: Date.now() });
  pedido.catch(() => historiales.delete(cliente));
  return pedido;
}

/** Lo que el equipo fue registrando con este cliente desde la app. */
function Historial({ cliente }: { cliente: string }) {
  const [eventos, setEventos] = useState<EventoHistorial[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    pedirHistorial(cliente)
      .then((lista) => {
        if (vigente) setEventos(lista);
      })
      .catch(() => {
        if (vigente) setError(true);
      });
    return () => {
      vigente = false;
    };
  }, [cliente]);

  return (
    <section>
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Historial con el cliente</p>
      {error ? (
        <p className="text-xs text-red-700">No se pudo cargar el historial.</p>
      ) : eventos === null ? (
        <p className="text-xs text-slate-500">Cargando…</p>
      ) : eventos.length === 0 ? (
        <p className="text-xs text-slate-500">Todavía no hay registros con este cliente.</p>
      ) : (
        <ol className="flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
          {eventos.map((evento) => (
            <li key={evento.id} className="flex gap-2">
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TIPOS[evento.tipo].estilo}`} />
              <div className="min-w-0 text-xs">
                <p className="text-slate-900">
                  <span className="font-medium">{evento.resultado ?? TIPOS[evento.tipo].etiqueta}</span>
                  {evento.hito ? <span className="text-slate-500"> · {evento.hito}</span> : null}
                  {evento.relacion ? (
                    <span className={`font-medium ${ESTILO_RELACION[evento.relacion]}`}>
                      {" "}
                      · Relación {RELACIONES[evento.relacion].toLowerCase()}
                    </span>
                  ) : null}
                  <span className="text-slate-400"> · {formatearFechaHora(evento.fecha)}</span>
                </p>
                {evento.observacion ? <p className="line-clamp-2 text-slate-600">{evento.observacion}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Dato({ etiqueta, valor, ancho = false }: { etiqueta: string; valor: string; ancho?: boolean }) {
  return (
    <div className={ancho ? "col-span-2" : undefined}>
      <dt className="text-[11px] text-slate-500">{etiqueta}</dt>
      <dd className="text-xs break-words text-slate-900">{valor || "—"}</dd>
    </div>
  );
}

/** Ficha del cliente (hojas "Desplegable" y "MaestroCliente"), resumen del chat e historial. */
function Ficha({ consulta, resumen }: { consulta: Consulta; resumen?: { total: number; sinResponder: number } }) {
  const { codigo, nombre } = separarCliente(consulta.cliente);
  const ficha = consulta.ficha;
  const alertas = alertasCliente(consulta);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-[#1b2b5e]">
          {nombre}
          {codigo ? <span className="ml-1.5 font-mono text-xs font-normal text-slate-500">#{codigo}</span> : null}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {alertas.map((alerta) => (
            <span
              key={alerta}
              className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-semibold text-orange-800"
            >
              <Icono nombre="alerta" className="size-3" />
              {alerta}
            </span>
          ))}
          {resumen ? (
            <span className="text-[11px] text-slate-600">
              {resumen.total} consulta{resumen.total === 1 ? "" : "s"} en este chat · {resumen.sinResponder} sin responder
            </span>
          ) : null}
        </div>
      </div>

      {!ficha ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-2.5 text-xs text-slate-600">
          El cliente no figura en las hojas Desplegable ni MaestroCliente de la planilla.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <dl className="grid grid-cols-2 content-start gap-x-3 gap-y-1.5 rounded-lg bg-slate-50 p-2.5">
            <Dato etiqueta="Lista de precio" valor={ficha.listaPrecio} />
            <Dato etiqueta="Clasificación" valor={ficha.clasificacion} />
            <Dato etiqueta="Grupo vendedor" valor={ficha.grupoVendedor.replace(/^FILTRO GRUPO\s*/i, "")} ancho />
            <Dato
              etiqueta="Grupos de WhatsApp"
              valor={[ficha.grupoWhatsapp, ficha.grupoWhatsapp2].filter(Boolean).join(" · ")}
              ancho
            />
            <Dato etiqueta="Última situación del chat" valor={ficha.observacion} ancho />
          </dl>
          <dl className="grid grid-cols-2 content-start gap-x-3 gap-y-1.5 rounded-lg bg-slate-50 p-2.5">
            <Dato etiqueta="Actividad" valor={ficha.actividad} ancho />
            <Dato etiqueta="Categoría" valor={ficha.categoria} />
            <Dato etiqueta="Límite de crédito" valor={ficha.limiteCredito} />
            <Dato etiqueta="Condición de pago" valor={ficha.condicionPago} ancho />
            <Dato etiqueta="Estado de cuenta (deuda)" valor={ficha.situacion} ancho />
          </dl>
        </div>
      )}

      <Historial cliente={consulta.cliente} />

      <Link
        href={rutaPerfil(consulta.cliente)}
        className="self-end text-xs font-medium text-[#1b2b5e] underline-offset-2 hover:underline"
      >
        Ver perfil y línea de tiempo →
      </Link>
    </div>
  );
}

type Posicion = { left: number; ancho: number } & ({ top: number } | { bottom: number });

/**
 * Vista rapida del cliente al pasar el mouse (o llegar con Tab) por su nombre:
 * una tarjeta con la ficha, el resumen del chat y el historial. Se queda
 * abierta mientras el mouse este sobre ella; clic en el nombre abre el perfil.
 * Va en un portal porque la tabla recorta lo que sale de sus bordes.
 */
export function VistaRapidaCliente({
  consulta,
  resumen,
  children,
}: {
  consulta: Consulta;
  resumen?: { total: number; sinResponder: number };
  children: ReactNode;
}) {
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const disparadorRef = useRef<HTMLSpanElement>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const temporizador = useRef<number | undefined>(undefined);

  function abrir() {
    const caja = disparadorRef.current?.getBoundingClientRect();
    if (!caja) return;
    const ancho = Math.min(ANCHO_TARJETA, window.innerWidth - MARGEN * 2);
    const left = Math.min(Math.max(caja.left, MARGEN), window.innerWidth - ancho - MARGEN);
    // Abajo del nombre; si no entra y arriba hay mas lugar, arriba.
    const lugarAbajo = window.innerHeight - caja.bottom;
    setPosicion(
      lugarAbajo < 380 && caja.top > lugarAbajo
        ? { left, ancho, bottom: window.innerHeight - caja.top + 8 }
        : { left, ancho, top: caja.bottom + 8 },
    );
  }

  function programar(accion: "abrir" | "cerrar", demora: number) {
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => (accion === "abrir" ? abrir() : setPosicion(null)), demora);
  }

  const cancelar = () => window.clearTimeout(temporizador.current);

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const abierta = posicion !== null;
  useEffect(() => {
    if (!abierta) return;
    const cerrar = () => setPosicion(null);
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") cerrar();
    };
    // Con la pagina que se mueve la tarjeta quedaria en otro lado: se cierra.
    // El scroll del historial, dentro de la tarjeta, no cuenta.
    const alDesplazar = (evento: Event) => {
      if (!tarjetaRef.current?.contains(evento.target as Node)) cerrar();
    };
    document.addEventListener("keydown", alTeclear);
    window.addEventListener("scroll", alDesplazar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      window.removeEventListener("scroll", alDesplazar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierta]);

  return (
    <>
      <span
        ref={disparadorRef}
        className="inline-flex"
        onMouseEnter={() => programar("abrir", DEMORA_ABRIR_MS)}
        onMouseLeave={() => programar("cerrar", DEMORA_CERRAR_MS)}
        onFocus={() => programar("abrir", 0)}
        onBlur={(evento) => {
          if (!tarjetaRef.current?.contains(evento.relatedTarget as Node)) programar("cerrar", DEMORA_CERRAR_MS);
        }}
      >
        {children}
      </span>
      {posicion
        ? createPortal(
            <div
              ref={tarjetaRef}
              role="dialog"
              aria-label={`Vista rápida de ${separarCliente(consulta.cliente).nombre}`}
              onMouseEnter={cancelar}
              onMouseLeave={() => programar("cerrar", DEMORA_CERRAR_MS)}
              style={{
                position: "fixed",
                left: posicion.left,
                width: posicion.ancho,
                ...("top" in posicion ? { top: posicion.top } : { bottom: posicion.bottom }),
              }}
              className="z-50 max-h-[min(32rem,calc(100vh-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-left shadow-2xl ring-1 ring-black/5"
            >
              <Ficha consulta={consulta} resumen={resumen} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
