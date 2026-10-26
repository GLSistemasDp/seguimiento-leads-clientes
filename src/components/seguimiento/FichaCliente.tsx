"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
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

/** Lo que el equipo fue registrando con este cliente desde la app. */
function Historial({ cliente }: { cliente: string }) {
  const [eventos, setEventos] = useState<EventoHistorial[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetch(`/api/seguimiento/historial?cliente=${encodeURIComponent(cliente)}`)
      .then((respuesta) => (respuesta.ok ? respuesta.json() : Promise.reject(new Error(String(respuesta.status)))))
      .then((cuerpo: { eventos: EventoHistorial[] }) => {
        if (vigente) setEventos(cuerpo.eventos);
      })
      .catch(() => {
        if (vigente) setError(true);
      });
    return () => {
      vigente = false;
    };
  }, [cliente]);

  return (
    <section className="rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Historial con el cliente</p>
      {error ? (
        <p className="text-sm text-red-700">No se pudo cargar el historial.</p>
      ) : eventos === null ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : eventos.length === 0 ? (
        <p className="text-sm text-slate-500">
          Todavía no hay registros. Al finalizar una conversación, su resultado queda acá.
        </p>
      ) : (
        <ol className="flex max-h-64 flex-col gap-3 overflow-y-auto">
          {eventos.map((evento) => (
            <li key={evento.id} className="flex gap-2.5">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TIPOS[evento.tipo].estilo}`} />
              <div className="min-w-0 text-sm">
                <p className="text-slate-900">
                  <span className="font-medium">{evento.resultado ?? TIPOS[evento.tipo].etiqueta}</span>
                  {evento.hito ? <span className="text-slate-500"> · {evento.hito}</span> : null}
                  {evento.relacion ? (
                    <span className={`font-medium ${ESTILO_RELACION[evento.relacion]}`}>
                      {" "}
                      · Relación {RELACIONES[evento.relacion].toLowerCase()}
                    </span>
                  ) : null}
                </p>
                {evento.observacion ? <p className="text-slate-700">{evento.observacion}</p> : null}
                <p className="text-xs text-slate-500">{formatearFechaHora(evento.fecha)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="text-sm break-words text-slate-900">{valor || "—"}</dd>
    </div>
  );
}

/**
 * Ficha del cliente armada con las hojas "Desplegable" y "MaestroCliente" de
 * la planilla, mas el resumen de su chat en el seguimiento.
 */
export function FichaCliente({
  consulta,
  resumen,
  onCerrar,
}: {
  consulta: Consulta | null;
  resumen?: { total: number; sinResponder: number };
  onCerrar: () => void;
}) {
  if (!consulta) return null;
  const { codigo, nombre } = separarCliente(consulta.cliente);
  const ficha = consulta.ficha;
  const alertas = alertasCliente(consulta);

  return (
    <Modal
      abierto
      ancho="lg"
      titulo={`Ficha del cliente · ${nombre}`}
      onCerrar={onCerrar}
      acciones={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cerrar
          </Button>
          <Link
            href={rutaPerfil(consulta.cliente)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ver perfil y línea de tiempo →
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {codigo ? <span className="font-mono text-sm text-slate-500">#{codigo}</span> : null}
          {alertas.map((alerta) => (
            <span
              key={alerta}
              className="inline-flex items-center gap-1 rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800"
            >
              <Icono nombre="alerta" className="size-3" />
              {alerta}
            </span>
          ))}
          {resumen ? (
            <span className="ml-auto text-xs text-slate-600">
              {resumen.total} consulta{resumen.total === 1 ? "" : "s"} en este chat ·{" "}
              {resumen.sinResponder} sin responder
            </span>
          ) : null}
        </div>

        {!ficha ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">
            El cliente no figura en las hojas Desplegable ni MaestroCliente de la planilla.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Comercial · Desplegable
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Dato etiqueta="Lista de precio" valor={ficha.listaPrecio} />
                <Dato etiqueta="Clasificacion venta" valor={ficha.clasificacion} />
                <Dato etiqueta="Situacion" valor={ficha.situacion} />
                <Dato etiqueta="Grupo vendedor" valor={ficha.grupoVendedor.replace(/^FILTRO GRUPO\s*/i, "")} />
                <div className="col-span-2">
                  <Dato
                    etiqueta="Grupos de WhatsApp"
                    valor={[ficha.grupoWhatsapp, ficha.grupoWhatsapp2].filter(Boolean).join(" · ")}
                  />
                </div>
                {ficha.observacion ? (
                  <div className="col-span-2">
                    <Dato etiqueta="Observacion" valor={ficha.observacion} />
                  </div>
                ) : null}
              </dl>
            </section>
            <section className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Cuenta · MaestroCliente
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div className="col-span-2">
                  <Dato etiqueta="Actividad" valor={ficha.actividad} />
                </div>
                <Dato etiqueta="Categoria" valor={ficha.categoria} />
                <Dato etiqueta="Limite de credito" valor={ficha.limiteCredito} />
                <div className="col-span-2">
                  <Dato etiqueta="Condicion de pago" valor={ficha.condicionPago} />
                </div>
                <Dato etiqueta="Deuda" valor={ficha.deuda || "Sin marca"} />
              </dl>
            </section>
          </div>
        )}

        <Historial key={consulta.cliente} cliente={consulta.cliente} />
      </div>
    </Modal>
  );
}
