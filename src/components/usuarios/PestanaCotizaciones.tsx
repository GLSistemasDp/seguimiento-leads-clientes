"use client";

import { Fragment, useState } from "react";
import { BadgeUsuario, PanelUsuario, VacioUsuario, tablaUsuario } from "@/components/usuarios/Compartidos";
import type { TonoBadge } from "@/components/usuarios/Compartidos";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { dineroUsuario, fechaUsuario, totalItems } from "@/lib/usuarios/analisis";
import { ESTADOS_COTIZACION, MOTIVOS_RECHAZO } from "@/types/usuarios";
import type { CotizacionUsuario, EstadoCotizacion, FichaUsuario, ItemUsuario } from "@/types/usuarios";

const TONO_COTIZACION: Record<EstadoCotizacion, TonoBadge> = { BORRADOR: "neutro", ENVIADA: "azul", EN_NEGOCIACION: "ambar", APROBADA: "verde", RECHAZADA: "rojo" };

/** Renglones de un pedido o de una cotizacion. */
export function TablaItems({ items, moneda }: { items: readonly ItemUsuario[]; moneda: FichaUsuario["moneda"] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-1 font-medium">Producto</th>
          <th className="py-1 text-right font-medium">Cantidad</th>
          <th className="py-1 text-right font-medium">Precio</th>
          <th className="py-1 text-right font-medium">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.sku} className="border-t border-slate-200/70">
            <td className="py-1 pr-2">
              <span className="font-mono text-[11px] text-slate-500">{item.sku}</span> {item.descripcion}
            </td>
            <td className="py-1 text-right tabular-nums">{item.cantidad.toLocaleString("es-AR")}</td>
            <td className="py-1 text-right tabular-nums">{dineroUsuario(item.precioUnitario, moneda)}</td>
            <td className="py-1 text-right font-medium tabular-nums">{dineroUsuario(item.cantidad * item.precioUnitario, moneda)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Pestana 3: las cotizaciones con su estado. El estado se cambia desde el
 * desplegable; al elegir "Rechazada" se pide el motivo antes de guardar.
 */
export function PestanaCotizaciones({
  ficha,
  hoy,
  guardando,
  onNueva,
  onCambiarEstado,
  onPrepararMail,
}: {
  ficha: FichaUsuario;
  hoy: string;
  guardando: boolean;
  onNueva: () => void;
  /** Para "Rechazada" abre el formulario de motivo; el resto se guarda directo. */
  onCambiarEstado: (cotizacion: CotizacionUsuario, estado: EstadoCotizacion) => void;
  onPrepararMail: (cotizacion: CotizacionUsuario) => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const cotizaciones = [...ficha.cotizaciones].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));
  return (
    <PanelUsuario
      titulo="Cotizaciones"
      detalle="Enviadas y en negociación cuentan como abiertas. Para rechazar una hay que indicar el motivo."
      acciones={
        <Button tamano="sm" variante="secundario" onClick={onNueva}>
          <Icono nombre="mas" className="size-3.5" />
          Nueva cotización
        </Button>
      }
    >
      {cotizaciones.length === 0 ? (
        <VacioUsuario>Todavía no hay cotizaciones para esta cuenta.</VacioUsuario>
      ) : (
        <div className="overflow-x-auto">
          <table className={tablaUsuario}>
            <thead>
              <tr>
                <th>N° de cotización</th>
                <th>Fecha</th>
                <th>Válida hasta</th>
                <th>Ítems</th>
                <th className="num">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((cotizacion) => {
                const vencida = (cotizacion.estado === "ENVIADA" || cotizacion.estado === "EN_NEGOCIACION") && cotizacion.validez < hoy;
                const expandida = abierta === cotizacion.id;
                return (
                  <Fragment key={cotizacion.id}>
                    <tr>
                      <td className="font-medium whitespace-nowrap text-slate-900">{cotizacion.numero}</td>
                      <td className="whitespace-nowrap tabular-nums">{fechaUsuario(cotizacion.fecha)}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {fechaUsuario(cotizacion.validez)}
                        {vencida ? <span className="ml-1.5 text-[11px] font-medium text-amber-700">vencida</span> : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          aria-expanded={expandida}
                          onClick={() => setAbierta(expandida ? null : cotizacion.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                        >
                          {cotizacion.items.length} {cotizacion.items.length === 1 ? "producto" : "productos"}
                          <Icono nombre="abajo" className={`size-3 transition-transform ${expandida ? "rotate-180" : ""}`} />
                        </button>
                      </td>
                      <td className="num font-semibold text-slate-900">{dineroUsuario(totalItems(cotizacion.items), ficha.moneda)}</td>
                      <td>
                        <span className="flex flex-wrap items-center gap-2">
                          <BadgeUsuario tono={TONO_COTIZACION[cotizacion.estado]}>{ESTADOS_COTIZACION[cotizacion.estado]}</BadgeUsuario>
                          <select
                            value={cotizacion.estado}
                            disabled={guardando}
                            onChange={(evento) => onCambiarEstado(cotizacion, evento.target.value as EstadoCotizacion)}
                            aria-label={`Cambiar el estado de ${cotizacion.numero}`}
                            className="cursor-pointer rounded-md border border-slate-200 bg-white py-1 pr-6 pl-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-wait"
                          >
                            {(Object.keys(ESTADOS_COTIZACION) as EstadoCotizacion[]).map((estado) => (
                              <option key={estado} value={estado}>
                                {estado === cotizacion.estado ? "Cambiar estado…" : `Pasar a ${ESTADOS_COTIZACION[estado]}`}
                              </option>
                            ))}
                          </select>
                        </span>
                      </td>
                    </tr>
                    {cotizacion.estado === "RECHAZADA" ? (
                      <tr className="!border-t-0">
                        <td colSpan={6} className="!pt-0">
                          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900">
                            <strong>Motivo de rechazo: {cotizacion.motivoRechazo ? MOTIVOS_RECHAZO[cotizacion.motivoRechazo] : "sin informar"}.</strong>{" "}
                            {cotizacion.observacionRechazo}
                          </p>
                        </td>
                      </tr>
                    ) : null}
                    {expandida ? (
                      <tr className="!border-t-0">
                        <td colSpan={6} className="!pt-0">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <TablaItems items={cotizacion.items} moneda={ficha.moneda} />
                            <Button tamano="sm" variante="secundario" className="mt-3" onClick={() => onPrepararMail(cotizacion)}>
                              <Icono nombre="mail" className="size-3.5" />
                              Plantilla de mail de esta cotización
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PanelUsuario>
  );
}
