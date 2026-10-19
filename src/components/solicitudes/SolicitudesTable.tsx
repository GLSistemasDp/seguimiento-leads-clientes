"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cambiarEstado } from "@/components/solicitudes/cambiar-estado";
import { DocumentacionAlta } from "@/components/solicitudes/DocumentacionAlta";
import { etiquetaEstado } from "@/components/solicitudes/EstadoBadge";
import { SolicitudRow } from "@/components/solicitudes/SolicitudRow";
import type { FilaSolicitud } from "@/components/solicitudes/SolicitudRow";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatearFechaHora } from "@/lib/utils/dates";
import type { Estado } from "@/types/solicitud";

type Pendiente = {
  solicitud: FilaSolicitud;
  nuevoEstado: Estado;
};

const COLUMNAS = ["Empresa", "Aptitud", "Rubro y datos", "Estado", "Acciones"] as const;

/** Escapa un valor para CSV con `;`, que es lo que Excel en es-AR abre directo. */
function celdaCsv(valor: string): string {
  return /[";\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function exportarCsv(filas: readonly FilaSolicitud[]) {
  const encabezados = ["Fecha", "Razon social", "CUIT", "Puntaje", "Aptitud", "Rubro", "Email", "Provincia", "Datos", "Estado"];
  const lineas = filas.map((fila) =>
    [
      formatearFechaHora(fila.fechaImportacion),
      fila.nombre,
      fila.cuit,
      String(fila.evaluacion.puntaje),
      fila.evaluacion.resumen,
      fila.rubro,
      fila.email,
      fila.provincia,
      fila.completitud,
      etiquetaEstado(fila.estado),
    ]
      .map(celdaCsv)
      .join(";"),
  );
  // El BOM hace que Excel lea los acentos como UTF-8.
  const contenido = "﻿" + [encabezados.join(";"), ...lineas].join("\r\n");
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `lote-solicitudes-${new Date().toISOString().slice(0, 10)}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

export function SolicitudesTable({ solicitudes }: { solicitudes: readonly FilaSolicitud[] }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [aprobandoLote, setAprobandoLote] = useState(false);
  /** Por id, para que el visor muestre el estado nuevo despues de aprobar o rechazar. */
  const [viendoId, setViendoId] = useState<string | null>(null);
  const viendo = solicitudes.find((solicitud) => solicitud.id === viendoId) ?? null;
  const [, startTransition] = useTransition();
  const casillaTodas = useRef<HTMLInputElement>(null);

  const seleccionadas = solicitudes.filter((solicitud) => seleccion.has(solicitud.id));
  const todasMarcadas = solicitudes.length > 0 && seleccionadas.length === solicitudes.length;
  const aAprobar = seleccionadas.filter((solicitud) => solicitud.estado !== "APROBADO");
  const yaRechazadas = aAprobar.filter((solicitud) => solicitud.estado === "RECHAZADO").length;

  useEffect(() => {
    if (casillaTodas.current) {
      casillaTodas.current.indeterminate = seleccionadas.length > 0 && !todasMarcadas;
    }
  }, [seleccionadas.length, todasMarcadas]);

  function alternar(id: string) {
    setSeleccion((previa) => {
      const nueva = new Set(previa);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
  }

  function alternarTodas() {
    setSeleccion(todasMarcadas ? new Set() : new Set(solicitudes.map((solicitud) => solicitud.id)));
  }

  async function aplicar(solicitud: FilaSolicitud, nuevoEstado: Estado) {
    setGuardandoId(solicitud.id);
    const resultado = await cambiarEstado(solicitud.id, nuevoEstado);
    setGuardandoId(null);

    if (!resultado.ok) {
      mostrar(`No se pudo actualizar: ${resultado.error}`, "error");
      return;
    }
    mostrar(`${solicitud.nombre} quedo como ${etiquetaEstado(nuevoEstado).toLowerCase()}.`, "exito");
    startTransition(() => router.refresh());
  }

  /**
   * Aprueba una por una: Sheets no tiene escritura en lote y asi un error en
   * una fila no frena al resto.
   */
  async function aprobarSeleccion() {
    setAprobandoLote(true);
    let fallidas = 0;
    for (const solicitud of aAprobar) {
      const resultado = await cambiarEstado(solicitud.id, "APROBADO");
      if (!resultado.ok) fallidas += 1;
    }
    setAprobandoLote(false);
    setSeleccion(new Set());

    const aprobadas = aAprobar.length - fallidas;
    if (fallidas > 0) {
      mostrar(`Se aprobaron ${aprobadas}; ${fallidas} no se pudieron actualizar.`, "error");
    } else {
      mostrar(`Se aprobaron ${aprobadas} solicitudes.`, "exito");
    }
    startTransition(() => router.refresh());
  }

  /**
   * Si la solicitud ya tenia una decision tomada, pide confirmacion antes de
   * pisarla; si estaba pendiente, aplica el cambio directo.
   */
  function pedirCambio(solicitud: FilaSolicitud, nuevoEstado: Estado) {
    if (solicitud.estado === "PENDIENTE") {
      void aplicar(solicitud, nuevoEstado);
      return;
    }
    setPendiente({ solicitud, nuevoEstado });
  }

  if (solicitudes.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-slate-600">No hay solicitudes que coincidan con el filtro.</p>
        <p className="mt-1 text-xs text-slate-500">
          Proba restablecer los filtros o importar un archivo nuevo.
        </p>
      </div>
    );
  }

  return (
    <>
      <div>
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-12" />
            <col className="w-[30%]" />
            <col className="w-[24%]" />
            <col />
            <col className="w-32" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-blue-50/50 text-left">
              <th className="py-3 pr-2 pl-5">
                <input
                  ref={casillaTodas}
                  type="checkbox"
                  checked={todasMarcadas}
                  onChange={alternarTodas}
                  aria-label="Seleccionar todas las de esta pagina"
                  className="size-4 cursor-pointer rounded border-slate-300 accent-blue-700"
                />
              </th>
              {COLUMNAS.map((columna) => (
                <th
                  key={columna}
                  className="px-3 py-3 text-xs font-semibold tracking-wide text-slate-600 uppercase last:pr-5"
                >
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((solicitud) => (
              <SolicitudRow
                key={solicitud.id}
                solicitud={solicitud}
                guardando={guardandoId === solicitud.id || aprobandoLote}
                seleccionada={seleccion.has(solicitud.id)}
                onSeleccionar={alternar}
                onPedirCambio={pedirCambio}
                onVerDocumentacion={(fila) => setViendoId(fila.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <DocumentacionAlta
        solicitud={viendo}
        guardando={guardandoId === viendoId || aprobandoLote}
        onCerrar={() => setViendoId(null)}
        onPedirCambio={pedirCambio}
      />

      {seleccionadas.length > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-40 w-[min(56rem,calc(100%-2rem))] -translate-x-1/2">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-800 px-5 py-4 text-white shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-blue-700">
                <Icono nombre="lista" className="size-4" />
              </span>
              <div className="text-sm leading-snug">
                <p className="font-medium">
                  {seleccionadas.length}{" "}
                  {seleccionadas.length === 1 ? "solicitud seleccionada" : "solicitudes seleccionadas"}
                </p>
                <p className="text-slate-300">
                  {aAprobar.length > 0
                    ? `${aAprobar.length} lista${aAprobar.length === 1 ? "" : "s"} para aprobar`
                    : "Todas ya estan aprobadas"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSeleccion(new Set())}
                className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
                aria-label="Limpiar seleccion"
              >
                <Icono nombre="cerrar" />
              </button>
              <button
                type="button"
                onClick={() => exportarCsv(seleccionadas)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-500 px-4 py-2 text-sm font-medium hover:bg-slate-700"
              >
                <Icono nombre="descargar" />
                Exportar lote
              </button>
              <button
                type="button"
                disabled={aAprobar.length === 0 || aprobandoLote}
                onClick={() => setConfirmarLote(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {aprobandoLote ? "Aprobando…" : "Aprobar seleccion"}
                <Icono nombre="flecha" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        abierto={confirmarLote}
        titulo="Aprobar seleccion"
        onCerrar={() => setConfirmarLote(false)}
        acciones={
          <>
            <Button variante="secundario" onClick={() => setConfirmarLote(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConfirmarLote(false);
                void aprobarSeleccion();
              }}
            >
              Si, aprobar {aAprobar.length}
            </Button>
          </>
        }
      >
        <p>
          Se van a aprobar <strong>{aAprobar.length}</strong> solicitudes.
          {yaRechazadas > 0
            ? ` ${yaRechazadas} de ellas figuraban como rechazadas y van a cambiar de estado.`
            : null}
        </p>
      </Modal>

      <Modal
        abierto={pendiente !== null}
        titulo="Cambiar el estado"
        onCerrar={() => setPendiente(null)}
        acciones={
          <>
            <Button variante="secundario" onClick={() => setPendiente(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!pendiente) return;
                const { solicitud, nuevoEstado } = pendiente;
                setPendiente(null);
                void aplicar(solicitud, nuevoEstado);
              }}
            >
              Si, cambiar
            </Button>
          </>
        }
      >
        {pendiente ? (
          <p>
            <strong>{pendiente.solicitud.nombre}</strong> ya figura como{" "}
            {etiquetaEstado(pendiente.solicitud.estado).toLowerCase()}. Queres pasarla a{" "}
            {etiquetaEstado(pendiente.nuevoEstado).toLowerCase()}?
          </p>
        ) : null}
      </Modal>
    </>
  );
}
