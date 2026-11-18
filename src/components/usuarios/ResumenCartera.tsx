"use client";

import type { ReactNode } from "react";
import { BadgeUsuario, PanelUsuario, VacioUsuario, tablaUsuario } from "@/components/usuarios/Compartidos";
import type { TonoBadge } from "@/components/usuarios/Compartidos";
import { Icono } from "@/components/ui/Icono";
import type { NombreIcono } from "@/components/ui/Icono";
import { dineroUsuario, fechaUsuario } from "@/lib/usuarios/analisis";
import type { ResumenUsuario } from "@/lib/usuarios/analisis";
import { ESTADOS_CUENTA, FILTROS_CARTERA, coincideBusqueda, cumpleFiltro, estadoCuenta, ordenarCartera, totalesCartera } from "@/lib/usuarios/cartera";
import type { EstadoCuenta, FiltroCartera } from "@/lib/usuarios/cartera";
import type { FichaUsuario } from "@/types/usuarios";

const TONO_ESTADO: Record<EstadoCuenta, TonoBadge> = { VENCIDA: "rojo", EXCEDIDA: "ambar", SALDO: "neutro", AL_DIA: "verde" };

function Total({ etiqueta, valor, detalle, icono, alerta = false }: { etiqueta: string; valor: ReactNode; detalle: ReactNode; icono: NombreIcono; alerta?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border bg-white px-4 py-3 ${alerta ? "border-red-200" : "border-slate-200"}`}>
      <p className="flex items-center justify-between gap-2 text-xs text-slate-500">
        {etiqueta}
        <Icono nombre={icono} className="size-3.5 text-slate-400" />
      </p>
      <p className={`mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums ${alerta ? "text-red-700" : "text-slate-900"}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

/**
 * Pantalla principal antes de elegir un cliente: los totales de la cartera y
 * una tabla con el estado de cuenta, credito, deuda y pedidos pendientes de
 * cada uno. Tocar una fila abre el cliente.
 */
export function ResumenCartera({
  fichas,
  resumenes,
  busqueda,
  filtro,
  onBuscar,
  onFiltrar,
  onSeleccionar,
}: {
  fichas: readonly FichaUsuario[];
  resumenes: ReadonlyMap<string, ResumenUsuario>;
  busqueda: string;
  filtro: FiltroCartera;
  onBuscar: (texto: string) => void;
  onFiltrar: (filtro: FiltroCartera) => void;
  onSeleccionar: (codigo: string) => void;
}) {
  const moneda = fichas[0]?.moneda ?? "USD";
  const dinero = (valor: number) => dineroUsuario(valor, moneda);
  const totales = totalesCartera(fichas, resumenes);
  const conteo = (clave: FiltroCartera) => fichas.filter((ficha) => cumpleFiltro(clave, resumenes.get(ficha.codigo)!)).length;
  const visibles = ordenarCartera(fichas, resumenes).filter((ficha) => cumpleFiltro(filtro, resumenes.get(ficha.codigo)!) && coincideBusqueda(ficha, busqueda));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Total
          etiqueta="Saldo de la cartera"
          icono="dinero"
          valor={dinero(totales.saldo)}
          detalle={`${totales.cuentas} ${totales.cuentas === 1 ? "cliente" : "clientes"} · facturado ${dinero(totales.facturacionAnio)} este año`}
        />
        <Total
          etiqueta="Deuda vencida"
          icono="alerta"
          alerta={totales.deudaVencida > 0}
          valor={dinero(totales.deudaVencida)}
          detalle={totales.conDeudaVencida === 0 ? "Ningún cliente con deuda vencida" : `${totales.conDeudaVencida} ${totales.conDeudaVencida === 1 ? "cliente" : "clientes"} con deuda vencida`}
        />
        <Total
          etiqueta="Crédito disponible"
          icono="escudo"
          valor={dinero(totales.creditoDisponible)}
          detalle={`De ${dinero(totales.limiteCredito)} de límite total`}
        />
        <Total
          etiqueta="Pedidos pendientes"
          icono="paquete"
          valor={totales.pedidosPendientes}
          detalle={totales.pedidosPendientes === 0 ? "Todo entregado" : `${dinero(totales.importePedidosPendientes)} sin entregar`}
        />
        <Total
          etiqueta="Requieren seguimiento"
          icono="reloj"
          valor={totales.requierenSeguimiento}
          detalle={`${totales.cotizacionesAbiertas} ${totales.cotizacionesAbiertas === 1 ? "cotización abierta" : "cotizaciones abiertas"} · ${dinero(totales.importeCotizaciones)}`}
        />
      </div>

      <PanelUsuario
        titulo="Clientes"
        detalle="Primero los que tienen deuda vencida, crédito excedido o seguimiento pendiente. Tocá un cliente para ver su ficha."
        acciones={
          <label className="relative flex w-full items-center sm:w-72">
            <Icono nombre="buscar" className="pointer-events-none absolute left-2.5 size-4 text-slate-400" />
            <input
              type="search"
              value={busqueda}
              onChange={(evento) => onBuscar(evento.target.value)}
              placeholder="Filtrar la tabla"
              aria-label="Filtrar clientes de la tabla"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-1.5 pr-2 pl-8 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        }
      >
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5" role="group" aria-label="Filtrar por estado">
          {(Object.keys(FILTROS_CARTERA) as FiltroCartera[]).map((clave) => (
            <button
              key={clave}
              type="button"
              aria-pressed={filtro === clave}
              onClick={() => onFiltrar(clave)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                filtro === clave ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {FILTROS_CARTERA[clave]}
              <span className={`tabular-nums ${filtro === clave ? "text-slate-300" : "text-slate-400"}`}>{conteo(clave)}</span>
            </button>
          ))}
        </div>
        {visibles.length === 0 ? (
          <VacioUsuario>Ningún cliente coincide.</VacioUsuario>
        ) : (
          <div className="overflow-x-auto">
            <table className={tablaUsuario}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Estado de cuenta</th>
                  <th className="num">Saldo</th>
                  <th className="num">Deuda vencida</th>
                  <th className="num">Crédito disponible</th>
                  <th className="num">Pedidos pendientes</th>
                  <th className="num">Cotizaciones</th>
                  <th>Último contacto</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((ficha) => {
                  const resumen = resumenes.get(ficha.codigo)!;
                  const estado = estadoCuenta(resumen);
                  const { contacto } = resumen;
                  return (
                    <tr
                      key={ficha.codigo}
                      tabIndex={0}
                      onClick={() => onSeleccionar(ficha.codigo)}
                      onKeyDown={(evento) => {
                        if (evento.key === "Enter" || evento.key === " ") {
                          evento.preventDefault();
                          onSeleccionar(ficha.codigo);
                        }
                      }}
                      aria-label={`Ver la ficha de ${ficha.nombre}`}
                      className="cursor-pointer hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none"
                    >
                      <td>
                        <span className="font-medium text-slate-900">{ficha.nombre}</span>
                        <span className="block text-xs text-slate-500">{ficha.actividad || "Actividad sin informar"}</span>
                      </td>
                      <td>
                        <BadgeUsuario tono={TONO_ESTADO[estado]}>{ESTADOS_CUENTA[estado]}</BadgeUsuario>
                        {estado === "VENCIDA" ? <span className="block pt-0.5 text-[11px] text-red-700">{resumen.mayorMora} días de mora</span> : null}
                      </td>
                      <td className="num font-medium text-slate-900">{dineroUsuario(resumen.saldo, ficha.moneda)}</td>
                      <td className={`num ${resumen.deudaVencida > 0 ? "font-semibold text-red-700" : "text-slate-400"}`}>
                        {resumen.deudaVencida > 0 ? dineroUsuario(resumen.deudaVencida, ficha.moneda) : "—"}
                      </td>
                      <td className="num">
                        <span className={resumen.creditoDisponible < 0 ? "font-semibold text-amber-700" : "text-slate-700"}>{dineroUsuario(resumen.creditoDisponible, ficha.moneda)}</span>
                        <span className="block text-[11px] text-slate-400">de {dineroUsuario(ficha.limiteCredito, ficha.moneda)}</span>
                      </td>
                      <td className="num">
                        {resumen.pedidosPendientes > 0 ? (
                          <>
                            <span className="font-medium text-slate-900">{resumen.pedidosPendientes}</span>
                            <span className="block text-[11px] text-slate-500">{dineroUsuario(resumen.importePedidosPendientes, ficha.moneda)}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="num">{resumen.cotizacionesAbiertas > 0 ? resumen.cotizacionesAbiertas : <span className="text-slate-400">—</span>}</td>
                      <td className="whitespace-nowrap">
                        <span className={resumen.requiereSeguimiento ? "font-medium text-amber-700" : "text-slate-700"}>
                          {contacto.dias === null ? "Sin contacto" : contacto.dias === 0 ? "Hoy" : `Hace ${contacto.dias} ${contacto.dias === 1 ? "día" : "días"}`}
                        </span>
                        {contacto.fecha ? <span className="block text-[11px] text-slate-400">{fechaUsuario(contacto.fecha)}</span> : null}
                      </td>
                    </tr>
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
