"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormularioIndicacion } from "@/components/reclamos/FormularioIndicacion";
import { CopiarLink } from "@/components/ui/CopiarLink";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatearDiaCorto } from "@/lib/utils/dates";
import { ACCIONES, ESTADOS_RECLAMO, type EstadoReclamo, type ReclamoPanel } from "@/types/reclamo";

const ESTILO_ESTADO: Record<EstadoReclamo, string> = {
  SIN_DEFINIR: "bg-red-600 text-white",
  EN_GESTION: "bg-blue-100 text-blue-800",
  RESUELTO: "bg-emerald-50 text-emerald-700",
};

const BORDE_ESTADO: Record<EstadoReclamo, string> = {
  SIN_DEFINIR: "border-l-red-600",
  EN_GESTION: "border-l-blue-500",
  RESUELTO: "border-l-emerald-300",
};

const ESTILO_CLASIFICACION: Record<string, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-sky-100 text-sky-800",
  C: "bg-slate-100 text-slate-600",
};

type Filtro = EstadoReclamo | "TODOS";

function Dias({ dias }: { dias: number | null }) {
  if (dias === null) return null;
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums ${
        dias >= 2 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
      }`}
    >
      {dias === 0 ? "Hoy" : `${dias} ${dias === 1 ? "día" : "días"}`}
    </span>
  );
}

/**
 * Panel de gerencia: todos los reclamos (WhatsApp y formularios), con la
 * accion a indicar en cada uno. Reemplaza el reenvio por Telegram.
 */
export function PanelReclamos({ reclamos, estadoInicial }: { reclamos: ReclamoPanel[]; estadoInicial: Filtro }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<Filtro>(estadoInicial);
  const [origen, setOrigen] = useState<"" | ReclamoPanel["origen"]>("");
  const [busqueda, setBusqueda] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const editando = reclamos.find((reclamo) => reclamo.id === editandoId) ?? null;

  const conteos: Record<Filtro, number> = {
    SIN_DEFINIR: reclamos.filter((reclamo) => reclamo.estado === "SIN_DEFINIR").length,
    EN_GESTION: reclamos.filter((reclamo) => reclamo.estado === "EN_GESTION").length,
    RESUELTO: reclamos.filter((reclamo) => reclamo.estado === "RESUELTO").length,
    TODOS: reclamos.length,
  };

  const texto = busqueda.trim().toLocaleLowerCase("es");
  const visibles = reclamos.filter(
    (reclamo) =>
      (filtro === "TODOS" || reclamo.estado === filtro) &&
      (!origen || reclamo.origen === origen) &&
      (!texto ||
        `${reclamo.cliente} ${reclamo.codigo} ${reclamo.detalle} ${reclamo.encargado} ${reclamo.grupoWhatsapp} ${reclamo.formulario ?? ""}`
          .toLocaleLowerCase("es")
          .includes(texto)),
  );

  const pestanas: { id: Filtro; etiqueta: string }[] = [
    { id: "SIN_DEFINIR", etiqueta: ESTADOS_RECLAMO.SIN_DEFINIR },
    { id: "EN_GESTION", etiqueta: ESTADOS_RECLAMO.EN_GESTION },
    { id: "RESUELTO", etiqueta: ESTADOS_RECLAMO.RESUELTO },
    { id: "TODOS", etiqueta: "Todos" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div role="tablist" className="flex flex-wrap gap-1">
          {pestanas.map((pestana) => (
            <button
              key={pestana.id}
              type="button"
              role="tab"
              aria-selected={filtro === pestana.id}
              onClick={() => setFiltro(pestana.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
                filtro === pestana.id ? "bg-[#1b2b5e] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {pestana.etiqueta}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  filtro === pestana.id ? "bg-white/20" : pestana.id === "SIN_DEFINIR" && conteos.SIN_DEFINIR > 0 ? "bg-red-100 text-red-700" : "bg-slate-100"
                }`}
              >
                {conteos[pestana.id]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <span className="sr-only">Buscar reclamos</span>
            <Icono nombre="buscar" className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-500" />
            <input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Cliente, N°, detalle, encargado…"
              className="w-60 rounded-lg border border-slate-200 py-2 pr-3 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label>
            <span className="sr-only">Origen</span>
            <select
              value={origen}
              onChange={(evento) => setOrigen(evento.target.value as typeof origen)}
              className="rounded-lg border border-slate-200 bg-white py-2 pr-8 pl-3 text-sm"
            >
              <option value="">Todos los orígenes</option>
              <option value="whatsapp">Grupos de WhatsApp</option>
              <option value="formulario">Formularios FOR-03</option>
            </select>
          </label>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-600 shadow-sm">
          {filtro === "SIN_DEFINIR" ? "No hay reclamos esperando una indicación. 👏" : "No hay reclamos con estos filtros."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[28%]" />
              <col />
              <col className="w-52" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-blue-50/50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <th className="py-3 pr-3 pl-5">Cliente</th>
                <th className="px-3 py-3">Reclamo</th>
                <th className="py-3 pr-5 pl-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((reclamo) => (
                <tr key={reclamo.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                  {/* Columna 1: fecha, cliente y su clasificacion */}
                  <td className={`border-l-4 py-3 pr-3 pl-4 ${BORDE_ESTADO[reclamo.estado]}`}>
                    <p className="text-xs text-slate-400">{formatearDiaCorto(reclamo.fecha)}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-slate-900">{reclamo.cliente}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {reclamo.codigo ? <span>N° {reclamo.codigo}</span> : <span>Sin N° de cliente</span>}
                      {reclamo.clasificacionCliente ? (
                        <span
                          className={`rounded px-1.5 font-semibold ${
                            ESTILO_CLASIFICACION[reclamo.clasificacionCliente] ?? "bg-slate-100 text-slate-600"
                          }`}
                          title="Clasificación del cliente"
                        >
                          {reclamo.clasificacionCliente}
                        </span>
                      ) : (
                        <span className="text-slate-400">Sin clasificación</span>
                      )}
                    </div>
                  </td>

                  {/* Columna 2: codigo, descripcion y dias de espera */}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                          reclamo.origen === "whatsapp" && !reclamo.formulario
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-amber-50 text-amber-900"
                        }`}
                      >
                        <Icono nombre={reclamo.formulario ? "documento" : "chat"} className="size-3" />
                        {reclamo.formulario ?? "WhatsApp"}
                      </span>
                      <Dias dias={reclamo.dias} />
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTILO_ESTADO[reclamo.estado]}`}>
                        {ESTADOS_RECLAMO[reclamo.estado]}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-800" title={reclamo.detalle}>
                      {reclamo.detalle}
                    </p>
                    {reclamo.indicacion ? (
                      <p className="mt-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900">
                        <span className="font-semibold">Gerencia:</span> {ACCIONES[reclamo.indicacion.accion]}
                        {reclamo.indicacion.sustitutos.length > 0
                          ? ` → ${reclamo.indicacion.sustitutos.map((sustituto) => sustituto.producto).join(", ")}`
                          : ""}
                        {reclamo.indicacion.comentario ? ` · ${reclamo.indicacion.comentario}` : ""}
                      </p>
                    ) : null}
                  </td>

                  {/* Columna 3: acciones */}
                  <td className="py-3 pr-5 pl-3">
                    <div className="flex flex-col items-stretch gap-1.5">
                      {reclamo.formulario ? (
                        <Link
                          href={`/reclamos/${reclamo.formulario}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Icono nombre="ojo" className="size-4" />
                          Ver formulario
                        </Link>
                      ) : reclamo.consultaId ? (
                        <CopiarLink
                          etiqueta="Enviar formulario"
                          ruta={`/formularios/reclamo?${new URLSearchParams({
                            razon: reclamo.cliente,
                            cliente: reclamo.codigo,
                            ref: reclamo.consultaId,
                          }).toString()}`}
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setEditandoId(reclamo.id)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                          reclamo.indicacion
                            ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            : "bg-blue-700 text-white hover:bg-blue-800"
                        }`}
                      >
                        {reclamo.indicacion ? "Cambiar indicación" : "Indicar acción"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        abierto={editando !== null}
        ancho="lg"
        titulo={editando ? `Indicación para el vendedor · ${editando.cliente}` : ""}
        onCerrar={() => setEditandoId(null)}
      >
        {editando ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {editando.origen === "whatsapp" ? "Reclamo por WhatsApp" : `Formulario · ${editando.tipo}`}
              </p>
              <p className="mt-1 text-sm text-slate-800">{editando.detalle}</p>
            </div>
            <FormularioIndicacion
              key={editando.id}
              reclamoId={editando.id}
              inicial={editando.indicacion}
              onCancelar={() => setEditandoId(null)}
              onGuardado={() => {
                setEditandoId(null);
                mostrar(`Indicación guardada para ${editando.cliente}.`, "exito");
                startTransition(() => router.refresh());
              }}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
