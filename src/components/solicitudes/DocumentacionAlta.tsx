"use client";

import { useMemo, useState } from "react";
import { EstadoBadge } from "@/components/solicitudes/EstadoBadge";
import { PanelEvaluacion } from "@/components/solicitudes/Evaluacion";
import type { FilaSolicitud } from "@/components/solicitudes/SolicitudRow";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { separarDocumentos } from "@/lib/solicitudes/documentos";
import { formatearFechaHora } from "@/lib/utils/dates";
import type { Estado } from "@/types/solicitud";

export type DocumentacionAltaProps = {
  solicitud: FilaSolicitud | null;
  guardando: boolean;
  onCerrar: () => void;
  onPedirCambio: (solicitud: FilaSolicitud, estado: Estado) => void;
};

/**
 * Todo lo que cargo la empresa en el formulario de alta: datos y archivos
 * adjuntos con vista previa, y los botones para decidir sin salir del visor.
 */
export function DocumentacionAlta({ solicitud, guardando, onCerrar, onPedirCambio }: DocumentacionAltaProps) {
  const [seleccionado, setSeleccionado] = useState(0);
  const [idPrevio, setIdPrevio] = useState<string | null>(null);
  const { documentos, textos } = useMemo(
    () => separarDocumentos(solicitud?.datos ?? {}),
    [solicitud],
  );

  // Al abrir otra solicitud se vuelve al primer documento.
  if ((solicitud?.id ?? null) !== idPrevio) {
    setIdPrevio(solicitud?.id ?? null);
    setSeleccionado(0);
  }

  if (!solicitud) return null;
  const actual = documentos[seleccionado];

  return (
    <Modal
      abierto
      ancho="xl"
      titulo={`Documentacion del alta · ${solicitud.nombre}`}
      onCerrar={onCerrar}
      acciones={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button
            variante="peligro"
            disabled={guardando || solicitud.estado === "RECHAZADO"}
            onClick={() => onPedirCambio(solicitud, "RECHAZADO")}
          >
            <Icono nombre="cruz" className="size-3.5" />
            Rechazar
          </Button>
          <Button
            disabled={guardando || solicitud.estado === "APROBADO"}
            onClick={() => onPedirCambio(solicitud, "APROBADO")}
          >
            <Icono nombre="check" className="size-3.5" />
            Aprobar
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <PanelEvaluacion evaluacion={solicitud.evaluacion} cuit={solicitud.cuit} />
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Solicitud</p>
              <EstadoBadge estado={solicitud.estado} />
            </div>
            <dl className="mt-2 flex flex-col gap-1.5 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Mail</dt>
                <dd className="font-mono text-xs break-all text-blue-700">{solicitud.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Ingreso</dt>
                <dd className="text-slate-900">{formatearFechaHora(solicitud.fechaImportacion)}</dd>
              </div>
              {textos.map((dato) => (
                <div key={dato.campo}>
                  <dt className="text-xs text-slate-500">{dato.campo}</dt>
                  <dd className="break-words text-slate-900">{dato.valor}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Archivos adjuntos ({documentos.length})
            </p>
            {documentos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-red-200 bg-red-50 p-3 text-sm text-red-700">
                La empresa no adjunto documentacion.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {documentos.map((documento, indice) => (
                  <li key={`${documento.campo}-${documento.url}`}>
                    <button
                      type="button"
                      onClick={() => setSeleccionado(indice)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        indice === seleccionado
                          ? "border-blue-300 bg-blue-50 text-blue-900"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Icono nombre="documento" className="size-4 text-blue-700" />
                      <span className="flex-1 truncate">{documento.nombre}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {actual ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
                <p className="truncate text-sm font-medium text-slate-900">{actual.campo}</p>
                <a
                  href={actual.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                >
                  Abrir en otra pestaña
                  <Icono nombre="externo" className="size-3.5" />
                </a>
              </div>
              {actual.vistaPrevia === null ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-600">
                  <Icono nombre="documento" className="size-8 text-slate-400" />
                  Este archivo no tiene vista previa. Abrilo en otra pestaña para revisarlo.
                </div>
              ) : actual.tipo === "imagen" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={actual.vistaPrevia} alt={actual.nombre} className="m-auto max-h-[60vh] object-contain" />
              ) : (
                <iframe
                  key={actual.url}
                  src={actual.vistaPrevia}
                  title={actual.nombre}
                  className="min-h-[28rem] w-full flex-1 bg-white"
                />
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-500">
              Sin archivos para mostrar.
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
