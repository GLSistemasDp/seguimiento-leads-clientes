"use client";

import Link from "next/link";
import { useState } from "react";
import type { FilaConsulta } from "@/components/seguimiento/SeguimientoTable";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { esReclamo, separarCliente } from "@/lib/seguimiento/presentacion";
import type { CierreFrecuente } from "@/lib/seguimiento/presentacion";
import { formatearDiaCorto } from "@/lib/utils/dates";
import { ICONO_RELACION, RELACIONES, RESULTADOS } from "@/types/seguimiento";
import type { Relacion, Resultado } from "@/types/seguimiento";

export type CierreConsulta = { resultado: Resultado; relacion: Relacion; observaciones: string };

const ESTILO_RELACION: Record<Relacion, string> = {
  BUENA: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REGULAR: "border-amber-200 bg-amber-50 text-amber-800",
  EN_RIESGO: "border-red-200 bg-red-50 text-red-700",
};

type ModalFinalizarProps = {
  consulta: FilaConsulta | null;
  /** El cierre mas usado en el historial: se ofrece como boton de un click. */
  atajo: CierreFrecuente;
  onCancelar: () => void;
  onFinalizar: (consulta: FilaConsulta, cierre: CierreConsulta) => void;
};

/**
 * Cierre de una conversacion: resultado, relacion y observacion. Tiene su
 * propio estado para que elegir o escribir no vuelva a dibujar la tabla.
 */
export function ModalFinalizar({ consulta, atajo, onCancelar, onFinalizar }: ModalFinalizarProps) {
  if (!consulta) return null;
  // Con key, cada apertura arranca de cero.
  return <Contenido key={consulta.id} consulta={consulta} atajo={atajo} onCancelar={onCancelar} onFinalizar={onFinalizar} />;
}

/**
 * Puente entre el reclamo informal (charla por WhatsApp) y el formal (FOR-03
 * del modulo Reclamos): lo genera con el cliente y la consulta precargados, o
 * muestra el que ya existe.
 */
function DerivarFor03({ consulta, onDerivar }: { consulta: FilaConsulta; onDerivar: () => void }) {
  if (consulta.formularioReclamo) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <Icono nombre="portapapeles" className="size-4" />
        Este reclamo ya escaló al formulario FOR-03 <strong>{consulta.formularioReclamo}</strong>.
        <Link href={`/reclamos/${encodeURIComponent(consulta.formularioReclamo)}`} target="_blank" className="font-medium underline">
          Ver reclamo
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50/60 px-3 py-2.5">
      <p className="min-w-0 flex-1 text-sm text-red-900">
        <span className="font-semibold">¿Pasa a reclamo formal?</span> Generá el FOR-03 con el cliente y lo que contó ya cargados.
      </p>
      <a
        href={`/reclamos/nuevo?consulta=${encodeURIComponent(consulta.id)}`}
        target="_blank"
        rel="noopener"
        onClick={onDerivar}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
      >
        Generar FOR-03
        <Icono nombre="externo" className="size-3.5" />
      </a>
    </div>
  );
}

function Contenido({ consulta, atajo, onCancelar, onFinalizar }: ModalFinalizarProps & { consulta: FilaConsulta }) {
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState<Resultado | "">("");
  // Pre-cargada con lo que sugirio el clasificador (IA o reglas); se puede cambiar.
  const [relacion, setRelacion] = useState<Relacion>(consulta.relacion.relacion);

  return (
    <Modal
      abierto
      titulo={`Finalizar conversacion · ${separarCliente(consulta.cliente).nombre}`}
      onCerrar={onCancelar}
      acciones={
        <>
          <Button variante="secundario" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button
            disabled={!resultado}
            title={resultado ? undefined : "Elegí cómo quedó la conversación"}
            onClick={() => {
              if (resultado) onFinalizar(consulta, { resultado, relacion, observaciones: nota.trim() });
            }}
          >
            <Icono nombre="check" className="size-3.5" />
            Finalizar conversacion
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {consulta.hito || "Consulta"} · {formatearDiaCorto(consulta.fecha)}
          </p>
          <p className="mt-1 text-sm text-slate-800">{consulta.consulta}</p>
        </div>
        {/* El caso de todos los dias en un click; el formulario de abajo queda para el resto. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            onClick={() => onFinalizar(consulta, { resultado: atajo.resultado, relacion: atajo.relacion, observaciones: nota.trim() })}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Icono nombre="check" className="size-3.5" />
            {atajo.resultado} · Relación {RELACIONES[atajo.relacion].toLowerCase()}
          </button>
          <span className="text-xs text-slate-500">
            {atajo.veces > 0 ? `El cierre más usado (${atajo.veces} de ${atajo.total}). ` : ""}Finaliza en un click; si no es el caso, completá abajo.
          </span>
        </div>
        {esReclamo(consulta) ? (
          <DerivarFor03
            consulta={consulta}
            onDerivar={() => {
              // Queda anotado en el cierre; se puede cambiar antes de finalizar.
              setResultado((previo) => previo || "Derivado a otra area");
              setNota((previa) => previa || "Derivado al formulario de reclamo FOR-03.");
            }}
          />
        ) : null}
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            ¿Cómo quedó? <span className="text-red-600">*</span>
          </legend>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {RESULTADOS.map((opcion) => (
              <label
                key={opcion}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  resultado === opcion ? "border-blue-400 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="resultado"
                  value={opcion}
                  checked={resultado === opcion}
                  onChange={() => setResultado(opcion)}
                  className="accent-blue-700"
                />
                {opcion}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            Relación con el cliente <span className="text-red-600">*</span>
          </legend>
          <p className="mt-0.5 text-xs text-slate-500">
            {consulta.relacion.origen === "ia"
              ? "Pre-cargada con lo que detectó la IA en el último mensaje. Cambiala si no coincide."
              : "Pre-cargada según el último mensaje. Cambiala si no coincide."}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Relación con el cliente">
            {(Object.keys(RELACIONES) as Relacion[]).map((clave) => (
              <button
                key={clave}
                type="button"
                role="radio"
                aria-checked={relacion === clave}
                onClick={() => setRelacion(clave)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  relacion === clave ? ESTILO_RELACION[clave] : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span aria-hidden="true">{ICONO_RELACION[clave]}</span>
                {RELACIONES[clave]}
              </button>
            ))}
          </div>
        </fieldset>
        <Textarea
          label="Observación (opcional)"
          rows={3}
          value={nota}
          onChange={(evento) => setNota(evento.target.value)}
          placeholder="Qué se le respondió, a quién se derivó, próximo paso…"
        />
        <p className="text-xs text-slate-500">
          La conversación sale de la bandeja y el cierre (resultado, relación y observación) queda en el historial del
          cliente. La bandeja principal muestra únicamente las consultas que todavía están pendientes.
        </p>
      </div>
    </Modal>
  );
}
