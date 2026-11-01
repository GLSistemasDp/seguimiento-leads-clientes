"use client";

import { useState } from "react";
import type { DatosRechazo } from "@/components/solicitudes/cambiar-estado";
import { etiquetaEstado } from "@/components/solicitudes/EstadoBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MOTIVOS_RECHAZO, esMotivoRechazo } from "@/types/solicitud";
import type { Estado, MotivoRechazo } from "@/types/solicitud";

export type CambioPedido = {
  nombre: string;
  estadoActual: Estado;
  nuevoEstado: Estado;
};

/**
 * Hace falta preguntar antes de cambiar: al rechazar (para elegir el motivo)
 * o al pisar una decision ya tomada. Aprobar una pendiente va directo.
 */
export function requiereConfirmacion(estadoActual: Estado, nuevoEstado: Estado): boolean {
  return nuevoEstado === "RECHAZADO" || estadoActual !== "PENDIENTE";
}

export type ModalDecisionProps = {
  cambio: CambioPedido | null;
  onCancelar: () => void;
  onConfirmar: (rechazo?: DatosRechazo) => void;
};

/** Confirmacion del cambio de estado; si es un rechazo, pide el motivo. */
export function ModalDecision({ cambio, onCancelar, onConfirmar }: ModalDecisionProps) {
  if (!cambio) return null;
  // Con key, cada apertura arranca con el selector vacio.
  return <Contenido key={`${cambio.nombre}-${cambio.nuevoEstado}`} cambio={cambio} onCancelar={onCancelar} onConfirmar={onConfirmar} />;
}

function Contenido({ cambio, onCancelar, onConfirmar }: ModalDecisionProps & { cambio: CambioPedido }) {
  const [motivo, setMotivo] = useState<MotivoRechazo | "">("");
  const [comentario, setComentario] = useState("");
  const rechaza = cambio.nuevoEstado === "RECHAZADO";
  const faltaComentario = motivo === "Otro" && !comentario.trim();
  const listo = !rechaza || (motivo !== "" && !faltaComentario);

  return (
    <Modal
      abierto
      titulo={rechaza ? `Rechazar a ${cambio.nombre}` : "Cambiar el estado"}
      onCerrar={onCancelar}
      acciones={
        <>
          <Button variante="secundario" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button
            variante={rechaza ? "peligro" : "primario"}
            disabled={!listo}
            onClick={() => onConfirmar(rechaza && motivo ? { motivo, comentario: comentario.trim() } : undefined)}
          >
            {rechaza ? "Rechazar solicitud" : "Sí, cambiar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {cambio.estadoActual !== "PENDIENTE" ? (
          <p>
            <strong>{cambio.nombre}</strong> ya figura como {etiquetaEstado(cambio.estadoActual).toLowerCase()}. ¿Querés
            pasarla a {etiquetaEstado(cambio.nuevoEstado).toLowerCase()}?
          </p>
        ) : null}

        {rechaza ? (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-900">¿Por qué se rechaza?</legend>
              <div className="flex flex-col gap-1.5">
                {MOTIVOS_RECHAZO.map((opcion) => (
                  <label
                    key={opcion}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      motivo === opcion ? "border-red-300 bg-red-50 text-red-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="motivo-rechazo"
                      value={opcion}
                      checked={motivo === opcion}
                      onChange={(evento) => setMotivo(esMotivoRechazo(evento.target.value) ? evento.target.value : "")}
                      className="size-4 accent-red-600"
                    />
                    {opcion}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-900">
                Comentario {motivo === "Otro" ? <span className="text-red-600">(obligatorio)</span> : <span className="font-normal text-slate-500">(opcional)</span>}
              </span>
              <textarea
                value={comentario}
                onChange={(evento) => setComentario(evento.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Detalle para el historial: qué faltó, qué se vio en Nosis…"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              />
            </label>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
