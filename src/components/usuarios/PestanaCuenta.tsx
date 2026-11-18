"use client";

import { BadgeUsuario, PanelUsuario, VacioUsuario, tablaUsuario } from "@/components/usuarios/Compartidos";
import type { TonoBadge } from "@/components/usuarios/Compartidos";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { ESTADOS_FACTURA, cuentaCorriente, dineroUsuario, facturacionMensual, facturasConEstado, fechaUsuario } from "@/lib/usuarios/analisis";
import type { EstadoFactura, ResumenUsuario } from "@/lib/usuarios/analisis";
import type { FichaUsuario } from "@/types/usuarios";

const TONO_FACTURA: Record<EstadoFactura, TonoBadge> = { PENDIENTE: "ambar", PARCIAL: "azul", PAGADA: "verde" };
const TIPO_MOVIMIENTO = { FACTURA: "Factura", NOTA_CREDITO: "Nota de crédito", PAGO: "Recibo de pago" } as const;

/** Azul de las series del tablero: validado contra fondo blanco (contraste y daltonismo). */
const COLOR_BARRA = "#2a78d6";
const compacto = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Facturacion por mes: una sola serie, columnas finas apoyadas en la base.
 * El valor de cada mes aparece al pasar el mouse o con el teclado; se rotulan
 * solo el mes mas alto y el mes en curso. Debajo, los mismos datos en tabla.
 */
function GraficoFacturacion({ ficha, hoy }: { ficha: FichaUsuario; hoy: string }) {
  const serie = facturacionMensual(ficha, hoy);
  const maximo = Math.max(1, ...serie.map((punto) => punto.total));
  const indiceMaximo = serie.findIndex((punto) => punto.total === maximo);
  return (
    <div className="px-4 pt-3 pb-4">
      <div className="flex h-32 items-end gap-0.5 border-b border-slate-200" role="img" aria-label={`Facturación mensual de los últimos ${serie.length} meses, en ${ficha.moneda}`}>
        {serie.map((punto, indice) => {
          const rotulada = punto.total > 0 && (indice === indiceMaximo || indice === serie.length - 1);
          return (
            <div key={punto.mes} tabIndex={0} className="group relative flex h-full flex-1 flex-col items-center justify-end rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              <span className="pointer-events-none absolute -top-1 z-10 hidden -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block group-focus-visible:block">
                {punto.etiqueta}: {dineroUsuario(punto.total, ficha.moneda)}
              </span>
              {rotulada ? <span className="mb-1 text-[10px] text-slate-600 tabular-nums group-hover:invisible group-focus-visible:invisible">{compacto.format(punto.total)}</span> : null}
              <span
                className="w-full max-w-6 rounded-t-[4px] group-hover:opacity-80"
                style={{ height: `${(punto.total / maximo) * 78}%`, minHeight: punto.total > 0 ? 2 : 0, background: COLOR_BARRA }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-0.5" aria-hidden="true">
        {serie.map((punto) => (
          <span key={punto.mes} className="flex-1 text-center text-[10px] text-slate-400">
            {punto.etiqueta.split(" ")[0]}
          </span>
        ))}
      </div>
      <details className="mt-2 text-xs text-slate-600">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-900">Ver como tabla</summary>
        <table className="mt-2 w-full tabular-nums">
          <tbody>
            {serie.map((punto) => (
              <tr key={punto.mes} className="border-t border-slate-100">
                <td className="py-1">{punto.etiqueta}</td>
                <td className="py-1 text-right">{dineroUsuario(punto.total, ficha.moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Pestana 2: control de deuda, facturacion mensual y cuenta corriente. */
export function PestanaCuenta({ ficha, resumen, hoy, onRegistrarPago }: { ficha: FichaUsuario; resumen: ResumenUsuario; hoy: string; onRegistrarPago: () => void }) {
  const dinero = (valor: number) => dineroUsuario(valor, ficha.moneda);
  const impagas = facturasConEstado(ficha, hoy).filter((factura) => factura.saldo > 0);
  // Lo mas reciente arriba: es lo primero que se consulta.
  const movimientos = cuentaCorriente(ficha, hoy).reverse();

  return (
    <div className="flex flex-col gap-4">
      <PanelUsuario
        titulo="Control de deuda"
        detalle={
          impagas.length === 0
            ? "No hay facturas con saldo pendiente."
            : `${impagas.length} ${impagas.length === 1 ? "factura con saldo" : "facturas con saldo"} · ${dinero(impagas.reduce((total, factura) => total + factura.saldo, 0))}${
                resumen.facturasVencidas ? ` · ${dinero(resumen.deudaVencida)} vencido` : ""
              }`
        }
        acciones={
          <Button tamano="sm" variante="secundario" onClick={onRegistrarPago}>
            <Icono nombre="mas" className="size-3.5" />
            Registrar pago
          </Button>
        }
      >
        {impagas.length === 0 ? (
          <VacioUsuario>La cuenta está al día.</VacioUsuario>
        ) : (
          <div className="overflow-x-auto">
            <table className={tablaUsuario}>
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Emisión</th>
                  <th>Vencimiento</th>
                  <th className="num">Mora</th>
                  <th className="num">Total</th>
                  <th className="num">Pendiente</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {impagas.map((factura) => (
                  <tr key={factura.id} className={factura.vencida ? "bg-red-50/50" : ""}>
                    <td className="font-medium whitespace-nowrap text-slate-900">{factura.numero}</td>
                    <td className="whitespace-nowrap tabular-nums">{fechaUsuario(factura.fecha)}</td>
                    <td className="whitespace-nowrap tabular-nums">{fechaUsuario(factura.vencimiento)}</td>
                    <td className={`num ${factura.vencida ? "font-semibold text-red-700" : "text-slate-400"}`}>{factura.vencida ? `${factura.diasMora} d` : "—"}</td>
                    <td className="num text-slate-600">{dinero(factura.total)}</td>
                    <td className="num font-semibold text-slate-900">{dinero(factura.saldo)}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        <BadgeUsuario tono={TONO_FACTURA[factura.estado]}>{ESTADOS_FACTURA[factura.estado]}</BadgeUsuario>
                        {factura.vencida ? <BadgeUsuario tono="rojo">Vencida</BadgeUsuario> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelUsuario>

      <PanelUsuario
        titulo="Facturación mensual"
        detalle={`Últimos 12 meses, en ${ficha.moneda}${resumen.variacionAnual === null ? "" : ` · ${resumen.variacionAnual > 0 ? "+" : ""}${resumen.variacionAnual}% vs. el mismo período del año anterior`}`}
      >
        <GraficoFacturacion ficha={ficha} hoy={hoy} />
      </PanelUsuario>

      <PanelUsuario titulo="Cuenta corriente" detalle="Facturas al debe; notas de crédito y recibos al haber. Lo más reciente arriba, con el saldo después de cada movimiento.">
        {movimientos.length === 0 ? (
          <VacioUsuario>Sin movimientos.</VacioUsuario>
        ) : (
          <div className="overflow-x-auto">
            <table className={tablaUsuario}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>Detalle</th>
                  <th className="num">Debe</th>
                  <th className="num">Haber</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((movimiento) => (
                  <tr key={movimiento.id}>
                    <td className="whitespace-nowrap tabular-nums">{fechaUsuario(movimiento.fecha)}</td>
                    <td className="whitespace-nowrap">
                      <span className="font-medium text-slate-900">{movimiento.comprobante}</span>
                      <span className="block text-[11px] text-slate-500">{TIPO_MOVIMIENTO[movimiento.tipo]}</span>
                    </td>
                    <td className="text-xs text-slate-600">{movimiento.detalle}</td>
                    <td className="num">{movimiento.debe ? dinero(movimiento.debe) : ""}</td>
                    <td className="num text-emerald-700">{movimiento.haber ? dinero(movimiento.haber) : ""}</td>
                    <td className={`num font-medium ${movimiento.saldo > 0 ? "text-slate-900" : "text-emerald-700"}`}>{dinero(movimiento.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelUsuario>
    </div>
  );
}
