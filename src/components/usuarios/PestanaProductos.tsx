"use client";

import { Fragment, useState } from "react";
import { BadgeUsuario, PanelUsuario, VacioUsuario, tablaUsuario } from "@/components/usuarios/Compartidos";
import type { TonoBadge } from "@/components/usuarios/Compartidos";
import { TablaItems } from "@/components/usuarios/PestanaCotizaciones";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { MESES_HABITUALES, MIN_PEDIDOS_HABITUAL, dineroUsuario, fechaUsuario, productosHabituales, totalItems } from "@/lib/usuarios/analisis";
import { ESTADOS_PEDIDO_USUARIO } from "@/types/usuarios";
import type { EstadoPedido, FichaUsuario } from "@/types/usuarios";

const TONO_PEDIDO: Record<EstadoPedido, TonoBadge> = { RECIBIDO: "azul", EN_PREPARACION: "ambar", DESPACHADO: "ambar", ENTREGADO: "verde", CANCELADO: "neutro" };

/**
 * Pestana 4: los productos habituales que faltaron en el ultimo pedido (para
 * ofrecer en el proximo llamado), la comparacion completa y el historial de
 * pedidos con sus articulos y precios de cada momento.
 */
export function PestanaProductos({ ficha, hoy, onCargarPedido }: { ficha: FichaUsuario; hoy: string; onCargarPedido: () => void }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const analisis = productosHabituales(ficha, hoy);
  const dinero = (valor: number) => dineroUsuario(valor, ficha.moneda);
  const pedidos = [...ficha.pedidos].filter((pedido) => pedido.fecha <= hoy).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));
  const criterio = `Habitual: aparece en ${MIN_PEDIDOS_HABITUAL} o más pedidos de los últimos ${MESES_HABITUALES} meses.`;

  return (
    <div className="flex flex-col gap-4">
      {analisis.ausentes.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-amber-300 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <Icono nombre="alerta" className="size-4" />
                Productos habituales ausentes en su último pedido
              </h3>
              <p className="mt-0.5 text-xs text-amber-900/80">
                {analisis.ausentes.length === 1 ? "Solía comprarlo" : "Solía comprarlos"} con regularidad y no {analisis.ausentes.length === 1 ? "vino" : "vinieron"} en{" "}
                {analisis.ultimoPedido?.numero} ({fechaUsuario(analisis.ultimoPedido?.fecha ?? "")}). Para ofrecer en el próximo llamado.
              </p>
            </div>
            <Button tamano="sm" onClick={onCargarPedido}>
              <Icono nombre="mas" className="size-3.5" />
              Cargar pedido
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className={tablaUsuario}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Lo pidió</th>
                  <th className="num">Cantidad habitual</th>
                  <th>Última vez</th>
                  <th className="num">Último precio</th>
                  <th className="num">Venta en juego</th>
                </tr>
              </thead>
              <tbody>
                {analisis.ausentes.map((producto) => (
                  <tr key={producto.sku}>
                    <td>
                      <span className="font-medium text-slate-900">{producto.descripcion}</span>
                      <span className="block font-mono text-[11px] text-slate-500">{producto.sku} · {producto.linea}</span>
                    </td>
                    <td className="num">{producto.veces} de {analisis.pedidosAnalizados} pedidos</td>
                    <td className="num">{producto.cantidadPromedio.toLocaleString("es-AR")}</td>
                    <td className="whitespace-nowrap tabular-nums">{fechaUsuario(producto.ultimaVez)}</td>
                    <td className="num">{dinero(producto.ultimoPrecio)}</td>
                    <td className="num font-semibold text-slate-900">{dinero(producto.cantidadPromedio * producto.ultimoPrecio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <PanelUsuario
        titulo="Productos habituales vs. último pedido"
        detalle={
          analisis.ultimoPedido
            ? `${criterio} Último pedido: ${analisis.ultimoPedido.numero} del ${fechaUsuario(analisis.ultimoPedido.fecha)}${
                analisis.complementos.length ? ` (se suma ${analisis.complementos.map((pedido) => pedido.numero).join(", ")}, de la misma compra)` : ""
              }.`
            : criterio
        }
      >
        {analisis.habituales.length === 0 ? (
          <VacioUsuario>
            {analisis.ultimoPedido ? "Todavía no hay compras suficientes para identificar productos habituales." : `Sin pedidos en los últimos ${MESES_HABITUALES} meses.`}
          </VacioUsuario>
        ) : (
          <div className="overflow-x-auto">
            <table className={tablaUsuario}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Línea</th>
                  <th className="num">Recurrencia</th>
                  <th className="num">Cantidad habitual</th>
                  <th>En el último pedido</th>
                </tr>
              </thead>
              <tbody>
                {analisis.habituales.map((producto) => (
                  <tr key={producto.sku}>
                    <td>
                      <span className="text-slate-900">{producto.descripcion}</span>
                      <span className="ml-1.5 font-mono text-[11px] text-slate-500">{producto.sku}</span>
                    </td>
                    <td className="text-slate-600">{producto.linea}</td>
                    <td className="num">{producto.veces} de {analisis.pedidosAnalizados}</td>
                    <td className="num">{producto.cantidadPromedio.toLocaleString("es-AR")}</td>
                    <td>
                      {producto.enUltimoPedido ? (
                        <BadgeUsuario tono="verde"><Icono nombre="check" className="size-3" />Incluido</BadgeUsuario>
                      ) : (
                        <BadgeUsuario tono="ambar"><Icono nombre="alerta" className="size-3" />Ausente</BadgeUsuario>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelUsuario>

      <PanelUsuario titulo="Historial de pedidos" detalle="Con los artículos, cantidades y precios de cada pedido.">
        {pedidos.length === 0 ? (
          <VacioUsuario>Todavía no hay pedidos.</VacioUsuario>
        ) : (
          <div className="overflow-x-auto">
            <table className={tablaUsuario}>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fecha</th>
                  <th>Orden de compra</th>
                  <th>Artículos</th>
                  <th className="num">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((pedido) => {
                  const expandido = abierto === pedido.id;
                  return (
                    <Fragment key={pedido.id}>
                      <tr>
                        <td className="font-medium whitespace-nowrap text-slate-900">{pedido.numero}</td>
                        <td className="whitespace-nowrap tabular-nums">{fechaUsuario(pedido.fecha)}</td>
                        <td className="whitespace-nowrap text-slate-600">{pedido.ordenCompra || "—"}</td>
                        <td>
                          <button
                            type="button"
                            aria-expanded={expandido}
                            onClick={() => setAbierto(expandido ? null : pedido.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                          >
                            {pedido.items.length} {pedido.items.length === 1 ? "artículo" : "artículos"}
                            <Icono nombre="abajo" className={`size-3 transition-transform ${expandido ? "rotate-180" : ""}`} />
                          </button>
                        </td>
                        <td className="num font-semibold text-slate-900">{dinero(totalItems(pedido.items))}</td>
                        <td><BadgeUsuario tono={TONO_PEDIDO[pedido.estado]}>{ESTADOS_PEDIDO_USUARIO[pedido.estado]}</BadgeUsuario></td>
                      </tr>
                      {expandido ? (
                        <tr className="!border-t-0">
                          <td colSpan={6} className="!pt-0">
                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <TablaItems items={pedido.items} moneda={ficha.moneda} />
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
    </div>
  );
}
