"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { recomendar, RESPUESTAS } from "@/lib/seguimiento/respuestas";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import { sugerirRespuesta } from "@/lib/seguimiento/sugerencia";
import { separarCliente } from "@/lib/seguimiento/presentacion";
import type { Consulta, Relacion } from "@/types/seguimiento";

/**
 * "Respuesta sugerida": el atajo de respuesta rapida de WhatsApp Business que
 * conviene usar (/PedidoRecibido...), con su texto al pasar el mouse, un boton
 * para copiar el atajo y el motivo. "Revisar antes" se ve en ambar. Tocar el
 * atajo abre las alternativas y el texto completo para copiar.
 *
 * La misma pieza se usa en la tabla del seguimiento y en la ficha del cliente.
 */

type Props = {
  consulta: Pick<Consulta, "hito" | "consulta" | "tentativoRespuesta" | "cliente">;
  relacion: Relacion;
  /** Dias habiles sin respuesta. */
  diasHabiles: number | null;
  /** Situacion / estado de cuenta del cliente ("OK", "REVISAR DEUDORA"...). */
  estadoCuenta: string;
  confianza?: number | null;
  /** Atenuada cuando la consulta ya esta respondida. */
  apagada?: boolean;
  /** Respuestas de la planilla; sin ellas se usan las fijas de la app. */
  catalogo?: readonly RespuestaTipo[];
};

/** Resalta los [DATOS A COMPLETAR] del mensaje. */
function MensajeConMarcas({ texto }: { texto: string }) {
  const partes = texto.split(/(\[[^\]]+\])/g);
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
      {partes.map((parte, indice) =>
        /^\[[^\]]+\]$/.test(parte) ? (
          <mark key={indice} className="rounded bg-amber-100 px-0.5 text-amber-900">
            {parte}
          </mark>
        ) : (
          <Fragment key={indice}>{parte}</Fragment>
        ),
      )}
    </p>
  );
}

/**
 * Texto completo de la respuesta al pasar el mouse. Va en un portal con
 * posicion fija para que la tabla (overflow oculto) no lo recorte.
 */
function ConTextoCompleto({ texto, children }: { texto: string; children: React.ReactNode }) {
  const ancla = useRef<HTMLSpanElement>(null);
  const [posicion, setPosicion] = useState<{ x: number; y: number; arriba: boolean } | null>(null);
  function abrir() {
    const caja = ancla.current?.getBoundingClientRect();
    if (!caja) return;
    const arriba = caja.top > window.innerHeight / 2;
    setPosicion({ x: Math.min(caja.left, window.innerWidth - 336), y: arriba ? caja.top - 6 : caja.bottom + 6, arriba });
  }
  return (
    <span ref={ancla} className="inline-flex" onMouseEnter={abrir} onMouseLeave={() => setPosicion(null)} onFocus={abrir} onBlur={() => setPosicion(null)}>
      {children}
      {posicion
        ? createPortal(
            <span
              role="tooltip"
              style={{ left: Math.max(8, posicion.x), top: posicion.y }}
              className={`pointer-events-none fixed z-50 max-h-[60vh] w-80 overflow-hidden rounded-md bg-slate-900 px-3 py-2 text-xs leading-relaxed whitespace-pre-line text-white shadow-lg ${
                posicion.arriba ? "-translate-y-full" : ""
              }`}
            >
              {texto}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

export function RecomendacionRespuesta({ consulta, relacion, diasHabiles, estadoCuenta, confianza, apagada = false, catalogo }: Props) {
  const { mostrar } = useToast();
  const sugerencia = useMemo(
    () => sugerirRespuesta(consulta, { relacion, diasHabiles, estadoCuenta, confianza, catalogo }),
    [consulta, relacion, diasHabiles, estadoCuenta, confianza, catalogo],
  );
  // Para el detalle: la sugerida (o la de despues de revisar) primero y las alternativas del catalogo.
  const opciones = useMemo(() => {
    const fuente = catalogo && catalogo.length > 0 ? catalogo : RESPUESTAS;
    const recomendacion = recomendar({ ...consulta, estadoCuenta }, fuente);
    const base = sugerencia.base?.toLowerCase();
    const primera = base ? (fuente.find((item) => item.comando.toLowerCase() === base) ?? RESPUESTAS.find((item) => item.comando.toLowerCase() === base)) : null;
    const lista = [primera, recomendacion.principal, ...recomendacion.alternativas].filter((item): item is RespuestaTipo => Boolean(item));
    return lista.filter((item, indice) => lista.findIndex((otra) => otra.comando === item.comando) === indice).slice(0, 3);
  }, [consulta, estadoCuenta, catalogo, sugerencia.base]);
  const [abierta, setAbierta] = useState(false);
  const [elegida, setElegida] = useState(0);
  const actual = opciones[elegida];
  const sugeridaPlanilla = consulta.tentativoRespuesta.trim();

  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto);
      mostrar(aviso, "exito");
    } catch {
      mostrar("No se pudo copiar al portapapeles.", "error");
    }
  }

  const abrirDetalle = () => {
    setElegida(0);
    setAbierta(true);
  };

  return (
    <>
      <div className={`flex flex-col gap-1 ${apagada ? "opacity-50" : ""}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Respuesta sugerida:</span>
          {sugerencia.revisar ? (
            <button
              type="button"
              onClick={abrirDetalle}
              className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-300 ring-inset hover:bg-amber-200"
            >
              <Icono nombre="alerta" className="size-3" />
              Revisar antes
            </button>
          ) : sugerencia.atajo ? (
            <>
              <ConTextoCompleto texto={sugerencia.texto ?? "Esta respuesta rápida no tiene texto cargado en el catálogo."}>
                <button
                  type="button"
                  onClick={abrirDetalle}
                  className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-medium text-blue-800 ring-1 ring-blue-200 ring-inset hover:bg-blue-100"
                >
                  {sugerencia.atajo}
                </button>
              </ConTextoCompleto>
              <button
                type="button"
                onClick={() => void copiar(sugerencia.atajo ?? "", `Copiado ${sugerencia.atajo}: pegalo en WhatsApp para usar la respuesta rápida.`)}
                aria-label={`Copiar el atajo ${sugerencia.atajo}`}
                title={`Copiar ${sugerencia.atajo}`}
                className="inline-flex size-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <Icono nombre="copiar" className="size-3.5" />
              </button>
            </>
          ) : (
            <button type="button" onClick={abrirDetalle} className="text-xs font-medium text-slate-600 underline-offset-2 hover:underline">
              Responder a mano
            </button>
          )}
        </div>
        <p className={`text-[11px] ${sugerencia.revisar ? "text-amber-800" : "text-slate-400"}`}>
          {sugerencia.motivo}
          {sugerencia.revisar && sugerencia.base ? <span className="text-slate-400"> · después: {sugerencia.base}</span> : null}
        </p>
        {sugerencia.flags.map((flag) => (
          <p key={flag} className="flex items-start gap-1 text-[11px] font-medium text-amber-700">
            <Icono nombre="alerta" className="mt-px size-3 shrink-0" />
            {flag}
          </p>
        ))}
      </div>

      <Modal
        abierto={abierta}
        ancho="lg"
        titulo={`Respuesta sugerida · ${separarCliente(consulta.cliente).nombre}`}
        onCerrar={() => setAbierta(false)}
        acciones={
          <>
            <Button variante="secundario" onClick={() => setAbierta(false)}>
              Cerrar
            </Button>
            {actual ? (
              <>
                <Button variante="secundario" onClick={() => void copiar(actual.comando, `Copiado ${actual.comando}.`)}>
                  <Icono nombre="copiar" className="size-3.5" />
                  Copiar atajo
                </Button>
                <Button onClick={() => void copiar(actual.mensaje, "Respuesta copiada. Completá los datos marcados antes de enviarla.")}>
                  <Icono nombre="copiar" className="size-3.5" />
                  Copiar texto
                </Button>
              </>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Consulta · {consulta.hito || "sin hito"}</p>
            <p className="mt-1 text-sm text-slate-800">{consulta.consulta}</p>
          </div>

          {sugerencia.revisar || sugerencia.flags.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {sugerencia.revisar ? (
                <p className="flex items-start gap-2 font-medium">
                  <Icono nombre="alerta" className="mt-0.5 size-4" />
                  {sugerencia.motivo}
                </p>
              ) : null}
              {sugerencia.flags.map((flag) => (
                <p key={flag} className="pl-6">
                  {flag}
                </p>
              ))}
            </div>
          ) : null}

          {sugeridaPlanilla ? (
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Cargada en la planilla</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">{sugeridaPlanilla}</p>
            </div>
          ) : null}

          {opciones.length > 0 ? (
            <div>
              <div className="flex flex-wrap gap-1.5" role="tablist">
                {opciones.map((opcion, indice) => (
                  <button
                    key={opcion.comando}
                    type="button"
                    role="tab"
                    aria-selected={indice === elegida}
                    onClick={() => setElegida(indice)}
                    className={`rounded-md px-2.5 py-1 font-mono text-xs ${
                      indice === elegida ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {opcion.comando}
                    {opcion.comando === sugerencia.base ? (sugerencia.revisar ? " · después de revisar" : " · sugerida") : ""}
                  </button>
                ))}
              </div>
              {actual ? (
                <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/40 p-4">
                  {actual.tipoQueja ? (
                    <p className="mb-2 text-xs font-semibold tracking-wide text-red-700 uppercase">Reclamo · {actual.tipoQueja}</p>
                  ) : null}
                  <MensajeConMarcas texto={actual.mensaje} />
                  {actual.cuando ? (
                    <p className="mt-3 text-xs text-slate-600">
                      <span className="font-semibold">Cuando usarla:</span> {actual.cuando}
                    </p>
                  ) : null}
                  {actual.accionInterna ? (
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-semibold">Accion interna:</span> {actual.accionInterna}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-slate-500">Plantilla del hito “{actual.hito}”. Lo resaltado se completa a mano.</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay una respuesta rápida para este hito: responder a mano.</p>
          )}
        </div>
      </Modal>
    </>
  );
}
