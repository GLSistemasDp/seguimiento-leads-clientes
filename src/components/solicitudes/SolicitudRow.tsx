"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EstadoBadge } from "@/components/solicitudes/EstadoBadge";
import { InsigniaAptitud } from "@/components/solicitudes/Evaluacion";
import type { Evaluacion } from "@/lib/solicitudes/evaluacion";
import { Icono } from "@/components/ui/Icono";
import { colorAvatar, iniciales } from "@/lib/solicitudes/presentacion";
import type { Completitud } from "@/lib/solicitudes/presentacion";
import { formatearDiaCorto, formatearHora } from "@/lib/utils/dates";
import type { DatosSolicitud, Estado } from "@/types/solicitud";

export type FilaSolicitud = {
  id: string;
  nombre: string;
  email: string;
  estado: Estado;
  fechaImportacion: string | Date;
  cuit: string;
  cuitValido: boolean;
  rubro: string;
  provincia: string;
  completitud: Completitud;
  /** Todo lo que cargo la empresa en el formulario, incluidos los links a adjuntos. */
  datos: DatosSolicitud;
  /** Cantidad de archivos adjuntos (links) en el formulario. */
  documentos: number;
  /** Puntaje de aptitud vigente (IA o reglas). */
  evaluacion: Evaluacion;
};

export type SolicitudRowProps = {
  solicitud: FilaSolicitud;
  /** true mientras hay una operacion en curso sobre esta fila. */
  guardando: boolean;
  seleccionada: boolean;
  onSeleccionar: (id: string) => void;
  onPedirCambio: (solicitud: FilaSolicitud, estado: Estado) => void;
  onVerDocumentacion: (solicitud: FilaSolicitud) => void;
};

const COMPLETITUD = {
  COMPLETO: {
    etiqueta: "Completo",
    icono: "check",
    estilo: "bg-emerald-700 text-white",
  },
  INCOMPLETO: {
    etiqueta: "Incompleto",
    icono: "alerta",
    estilo: "bg-blue-50 text-slate-700 border border-blue-100",
  },
  SIN_DATOS: {
    etiqueta: "Sin datos",
    icono: "cruz",
    estilo: "bg-red-50 text-red-600 border border-red-100",
  },
} as const;

const ACCION =
  "flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white transition-colors disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 disabled:hover:bg-white";

export function SolicitudRow({
  solicitud,
  guardando,
  seleccionada,
  onSeleccionar,
  onPedirCambio,
  onVerDocumentacion,
}: SolicitudRowProps) {
  const router = useRouter();
  const descartada = solicitud.estado === "RECHAZADO";
  const completitud = COMPLETITUD[solicitud.completitud];

  return (
    <tr
      className={`cursor-pointer border-b border-slate-100 align-top transition-colors last:border-0 ${
        seleccionada ? "bg-blue-50/60" : "hover:bg-slate-50"
      }`}
      onClick={() => router.push(`/solicitudes/${solicitud.id}`)}
    >
      <td className="py-3.5 pr-2 pl-5" onClick={(evento) => evento.stopPropagation()}>
        <input
          type="checkbox"
          checked={seleccionada}
          onChange={() => onSeleccionar(solicitud.id)}
          aria-label={`Seleccionar ${solicitud.nombre}`}
          className="mt-2.5 size-4 cursor-pointer rounded border-slate-300 accent-blue-700"
        />
      </td>
      <td className="px-3 py-3.5">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
              descartada ? "bg-red-50 text-red-600" : colorAvatar(solicitud.nombre)
            }`}
          >
            {iniciales(solicitud.nombre)}
          </span>
          <div className="min-w-0">
            <p className={`truncate text-sm font-semibold ${descartada ? "text-red-600 line-through" : "text-slate-900"}`}>
              {solicitud.nombre}
            </p>
            <p className="truncate text-xs text-blue-700">{solicitud.email}</p>
            <p className={`text-xs ${solicitud.cuitValido ? "text-slate-500" : "text-amber-700"}`}>
              {solicitud.cuitValido ? `CUIT ${solicitud.cuit}` : solicitud.cuit ? `CUIT inválido · ${solicitud.cuit}` : "Sin CUIT válido"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3.5">
        <InsigniaAptitud evaluacion={solicitud.evaluacion} detalle />
      </td>
      <td className="px-3 py-3.5 text-sm">
        <p className="line-clamp-2 text-slate-800">{solicitud.rubro || <span className="text-slate-400">Rubro sin informar</span>}</p>
        <p className="text-xs text-slate-500">{solicitud.provincia || "Provincia sin informar"}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500" title={completitud.etiqueta}>
          <Icono nombre={completitud.icono} className="size-3.5" />
          {completitud.etiqueta} · {solicitud.documentos} adj.
        </p>
      </td>
      <td className="px-3 py-3.5">
        <EstadoBadge estado={solicitud.estado} />
        <p className="mt-1 text-xs text-slate-400">
          {formatearDiaCorto(solicitud.fechaImportacion)} · {formatearHora(solicitud.fechaImportacion)}
        </p>
      </td>
      <td className="py-3.5 pr-5 pl-3" onClick={(evento) => evento.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            title={`Ver documentacion (${solicitud.documentos} adjunto${solicitud.documentos === 1 ? "" : "s"})`}
            aria-label={`Ver documentacion de ${solicitud.nombre}`}
            onClick={() => onVerDocumentacion(solicitud)}
            className={`${ACCION} text-slate-700 hover:bg-slate-100`}
          >
            <Icono nombre="ojo" />
          </button>
          <button
            type="button"
            title="Aprobar"
            aria-label={`Aprobar ${solicitud.nombre}`}
            disabled={guardando || solicitud.estado === "APROBADO"}
            onClick={() => onPedirCambio(solicitud, "APROBADO")}
            className={`${ACCION} text-emerald-700 hover:bg-emerald-50`}
          >
            <Icono nombre="check" />
          </button>
          <button
            type="button"
            title="Rechazar"
            aria-label={`Rechazar ${solicitud.nombre}`}
            disabled={guardando || solicitud.estado === "RECHAZADO"}
            onClick={() => onPedirCambio(solicitud, "RECHAZADO")}
            className={`${ACCION} text-red-600 hover:bg-red-50`}
          >
            <Icono nombre="cruz" />
          </button>
          <Link
            href={`/generador/${solicitud.id}`}
            title="Generar mail"
            aria-label={`Generar mail para ${solicitud.nombre}`}
            className={`${ACCION} text-blue-700 hover:bg-blue-50`}
          >
            <Icono nombre="mail" />
          </Link>
        </div>
      </td>
    </tr>
  );
}
