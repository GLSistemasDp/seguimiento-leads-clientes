"use client";

import { useState } from "react";
import { BadgeUsuario, PanelUsuario, RelacionUsuario, VacioUsuario, tablaUsuario } from "@/components/usuarios/Compartidos";
import { dineroUsuario, fechaUsuario, rankingLineas, rankingProductos, resumenUsuario, serieMensual, totalProductos } from "@/lib/usuarios/analisis";
import type { FichaUsuario } from "@/types/usuarios";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLORES = ["#3478f6", "#1b2b5e", "#16a085", "#9b6ee8", "#e6a52e"];

export function ResumenUsuario({ ficha, anio, hoy, onIr }: { ficha: FichaUsuario; anio: number; hoy: string; onIr: (tab: "cotizaciones" | "facturas" | "observaciones") => void }) {
  const [metrica, setMetrica] = useState<"facturacion" | "pedidos">("facturacion");
  const resumen = resumenUsuario(ficha, hoy, anio);
  const actual = serieMensual(ficha, anio, metrica, hoy);
  const anterior = serieMensual(ficha, anio - 1, metrica, hoy);
  const maximo = Math.max(...actual, ...anterior, 1);
  const productos = rankingProductos(ficha, anio, hoy).slice(0, 10);
  const lineas = rankingLineas(ficha, anio, hoy);
  const totalLineas = lineas.reduce((s, linea) => s + linea.importe, 0);
  const gradiente = lineas.map((linea, i) => {
    const inicio = totalLineas ? lineas.slice(0, i).reduce((s, l) => s + l.importe, 0) / totalLineas * 100 : 0;
    const fin = inicio + (totalLineas ? linea.importe / totalLineas * 100 : 0);
    return `${COLORES[i % COLORES.length]} ${inicio}% ${fin}%`;
  }).join(", ");
  const noGanadas = ficha.cotizaciones.filter((c) => c.estado === "NO_GANADA");
  return <div className="flex flex-col gap-5">
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <PanelUsuario titulo={metrica === "facturacion" ? "Historial de facturación" : "Historial de pedidos"} detalle={`Importes en ${ficha.moneda} · ${anio} y ${anio - 1}. Solo documentos emitidos hasta hoy.`} acciones={
        <div className="flex rounded-lg bg-slate-100 p-1">{(["facturacion", "pedidos"] as const).map((opcion) => <button key={opcion} type="button" aria-pressed={metrica === opcion} onClick={() => setMetrica(opcion)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${metrica === opcion ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{opcion === "facturacion" ? "Facturación" : "Pedidos"}</button>)}</div>
      }>
        <div className="p-5">
          <p className="text-2xl font-semibold text-[#1b2b5e] tabular-nums">{dineroUsuario(actual.reduce((s, n) => s + n, 0), ficha.moneda)} <span className="text-xs font-normal text-slate-500">{ficha.moneda}</span></p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500"><span><span className="mr-1 inline-block size-2.5 rounded-sm bg-[#3478f6]" />{anio}</span><span><span className="mr-1 inline-block size-2.5 rounded-sm bg-slate-300" />{anio - 1}</span></div>
          <div className="mt-4 overflow-x-auto">
            <svg viewBox="0 0 750 225" className="min-w-[520px] w-full" role="img" aria-label={`${metrica === "facturacion" ? "Facturación" : "Pedidos"} mensual de ${anio} comparada con ${anio - 1}`}>
              {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1="48" x2="745" y1={185 - tick * 40} y2={185 - tick * 40} stroke="#e2e8f0" /><text x="42" y={189 - tick * 40} textAnchor="end" fontSize="10" fill="#64748b">{new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(maximo * tick / 4)}</text></g>)}
              {MESES.map((mes, i) => <g key={mes}>
                <rect x={61 + i * 57} y={185 - anterior[i] / maximo * 160} width="17" height={anterior[i] / maximo * 160} rx="2" fill="#cbd5e1"><title>{`${mes} ${anio - 1}: ${dineroUsuario(anterior[i], ficha.moneda)}`}</title></rect>
                <rect x={81 + i * 57} y={185 - actual[i] / maximo * 160} width="17" height={actual[i] / maximo * 160} rx="2" fill="#3478f6"><title>{`${mes} ${anio}: ${dineroUsuario(actual[i], ficha.moneda)}`}</title></rect>
                <text x={80 + i * 57} y="207" textAnchor="middle" fontSize="11" fill="#64748b">{mes}</text>
              </g>)}
            </svg>
          </div>
          <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">Ver valores por mes</summary><div className="mt-3 overflow-x-auto"><table className={tablaUsuario}><thead><tr><th>Mes</th><th>{anio}</th><th>{anio - 1}</th></tr></thead><tbody>{MESES.map((mes, i) => <tr key={mes}><td>{mes}</td><td>{dineroUsuario(actual[i], ficha.moneda)}</td><td>{dineroUsuario(anterior[i], ficha.moneda)}</td></tr>)}</tbody></table></div></details>
        </div>
      </PanelUsuario>
      <PanelUsuario titulo="Situación para gestionar" detalle="Próximos pasos de la cuenta">
        <div className="flex flex-col gap-4 p-5">
          <div><div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-500">Relación actual</p><RelacionUsuario relacion={resumen.relacion} /></div><p className="mt-2 text-sm leading-6 text-slate-700">{resumen.observacion?.texto || "Todavía no se registró una evaluación de la relación."}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">Próximo contacto</p><p className="mt-1 text-sm font-semibold text-[#1b2b5e]">{resumen.observacion?.proximoContacto ? fechaUsuario(resumen.observacion.proximoContacto) : "Sin agendar"}</p><p className="mt-1 text-xs leading-5 text-slate-600">{resumen.observacion?.proximaAccion || "Registrá una próxima acción con el cliente."}</p><button type="button" onClick={() => onIr("observaciones")} className="mt-2 text-xs font-semibold text-blue-700 hover:underline">Actualizar relación y próxima acción →</button></div>
          <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3"><div><dt className="text-xs text-slate-500">Pedidos {anio}</dt><dd className="mt-1 font-semibold">{resumen.cantidadPedidos}</dd></div><div><dt className="text-xs text-slate-500">Ticket medio de pedido</dt><dd className="mt-1 text-sm font-semibold">{dineroUsuario(resumen.ticketPromedio, ficha.moneda)}</dd></div><div><dt className="text-xs text-slate-500">Conversión de cotizaciones</dt><dd className="mt-1 font-semibold">{resumen.conversion === null ? "Sin cierres" : `${resumen.conversion}%`}</dd></div><div><dt className="text-xs text-slate-500">Facturación vs. {anio - 1}</dt><dd className="mt-1 font-semibold">{resumen.variacion === null ? "Sin comparativo" : `${resumen.variacion > 0 ? "+" : ""}${resumen.variacion}%`}</dd></div></dl>
          <p className="text-[11px] text-slate-400">Conversión: ganadas sobre ganadas + no ganadas. La variación de facturación compara el mismo período de ambos años.</p>
        </div>
      </PanelUsuario>
    </div>

    <PanelUsuario titulo="Oportunidades y pendientes" detalle="Puntos concretos para preparar la próxima conversación comercial.">
      <div className="grid gap-3 p-4 md:grid-cols-3">
        <button type="button" onClick={() => onIr("cotizaciones")} className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-left hover:bg-blue-50"><p className="font-semibold text-blue-900">Retomar {resumen.abiertas.length} cotizaciones</p><p className="mt-2 text-xs leading-5 text-slate-600">Propuestas abiertas por {dineroUsuario(resumen.abiertas.reduce((s, c) => s + totalProductos(c.productos), 0), ficha.moneda)}. Confirmar decisión, validez y condiciones con Compras.</p></button>
        <button type="button" onClick={() => onIr("cotizaciones")} className="rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50"><p className="font-semibold text-slate-900">Revisar {noGanadas.length} propuestas no ganadas</p><p className="mt-2 text-xs leading-5 text-slate-600">Usar el motivo informado por el cliente para ajustar la próxima oferta.</p></button>
        <button type="button" onClick={() => onIr("facturas")} className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 text-left hover:bg-amber-50"><p className="font-semibold text-amber-900">Gestionar {resumen.vencidas.length} facturas vencidas</p><p className="mt-2 text-xs leading-5 text-slate-600">{resumen.promesasIncumplidas.length} compromisos de pago con fecha pasada. Registrar el acuerdo y cualquier problema administrativo.</p></button>
      </div>
    </PanelUsuario>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <PanelUsuario titulo="Productos que más compra" detalle={`Top 10 por unidades de pedidos entregados en ${anio}. No incluye pedidos cancelados ni en preparación.`}>
        {productos.length ? <div className="overflow-x-auto"><table className={tablaUsuario}><thead><tr><th>#</th><th>Producto</th><th>Línea</th><th>Unidades</th><th>Importe {ficha.moneda}</th></tr></thead><tbody>{productos.map((p, i) => <tr key={p.codigo}><td className="text-slate-400">{i + 1}</td><td className="min-w-56"><span className="font-mono text-xs font-semibold text-[#1b2b5e]">{p.codigo}</span><p className="mt-1 text-xs text-slate-600">{p.descripcion}</p></td><td><BadgeUsuario tono="azul">{p.linea}</BadgeUsuario></td><td className="whitespace-nowrap tabular-nums">{p.cantidad.toLocaleString("es-AR")}</td><td className="whitespace-nowrap tabular-nums">{dineroUsuario(p.importe, ficha.moneda)}</td></tr>)}</tbody></table></div> : <VacioUsuario>No hay pedidos entregados en este año.</VacioUsuario>}
      </PanelUsuario>
      <PanelUsuario titulo="Participación por línea" detalle={`Distribución del importe de productos entregados en ${anio}`}>
        {lineas.length ? <><div className="flex justify-center p-6"><div role="img" aria-label={lineas.map((l) => `${l.linea}: ${totalLineas ? Math.round(l.importe / totalLineas * 100) : 0}%`).join(", ")} className="flex size-52 items-center justify-center rounded-full" style={{ background: `conic-gradient(${gradiente})` }}><div className="flex size-36 flex-col items-center justify-center rounded-full bg-white"><span className="text-xs text-slate-500">Líneas compradas</span><span className="mt-1 text-3xl font-semibold text-[#1b2b5e]">{lineas.length}</span></div></div></div><div className="overflow-x-auto"><table className={tablaUsuario}><thead><tr><th>Línea</th><th>Unidades</th><th>Importe {ficha.moneda}</th><th>%</th></tr></thead><tbody>{lineas.map((l, i) => <tr key={l.linea}><td><span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: COLORES[i % COLORES.length] }} />{l.linea}</td><td className="tabular-nums">{l.cantidad.toLocaleString("es-AR")}</td><td className="whitespace-nowrap tabular-nums">{dineroUsuario(l.importe, ficha.moneda)}</td><td>{totalLineas ? Math.round(l.importe / totalLineas * 100) : 0}%</td></tr>)}</tbody></table></div></> : <VacioUsuario>Sin consumos para este período.</VacioUsuario>}
      </PanelUsuario>
    </div>
  </div>;
}
