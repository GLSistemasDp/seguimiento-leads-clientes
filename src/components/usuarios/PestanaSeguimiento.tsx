"use client";

import type { ReactNode } from "react";
import { BadgeUsuario, CopiarDato, PanelUsuario, VacioUsuario } from "@/components/usuarios/Compartidos";
import type { TonoBadge } from "@/components/usuarios/Compartidos";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { dineroUsuario, fechaUsuario, pedidosPendientes, totalItems } from "@/lib/usuarios/analisis";
import type { ResumenUsuario } from "@/lib/usuarios/analisis";
import { ESTADOS_PEDIDO_USUARIO, ROLES_CONTACTO, TIPOS_PARTE } from "@/types/usuarios";
import type { FichaUsuario, TipoParte } from "@/types/usuarios";

const TONO_PARTE: Record<TipoParte, TonoBadge> = { LLAMADA: "azul", REUNION: "verde", VISITA: "ambar", CORREO: "neutro", WHATSAPP: "verde" };

const MOMENTO = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-slate-500">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-sm text-slate-900">{children}</dd>
    </div>
  );
}

/** Pedidos todavia sin entregar: numero, fecha, estado e importe. */
function PedidosEnCurso({ ficha, hoy }: { ficha: FichaUsuario; hoy: string }) {
  const pedidos = pedidosPendientes(ficha, hoy);
  return (
    <PanelUsuario titulo="Pedidos pendientes" detalle={pedidos.length === 0 ? "Todo lo pedido ya se entregó." : "Pedidos todavía sin entregar."}>
      {pedidos.length === 0 ? null : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {pedidos.map((pedido) => (
            <li key={pedido.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">{pedido.numero}</span>
                <span className="block text-xs text-slate-500">
                  {fechaUsuario(pedido.fecha)}
                  {pedido.ordenCompra ? ` · ${pedido.ordenCompra}` : ""} · {pedido.items.length} {pedido.items.length === 1 ? "artículo" : "artículos"}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <BadgeUsuario tono={pedido.estado === "DESPACHADO" ? "azul" : "ambar"}>{ESTADOS_PEDIDO_USUARIO[pedido.estado]}</BadgeUsuario>
                <span className="text-xs font-medium text-slate-700 tabular-nums">{dineroUsuario(totalItems(pedido.items), ficha.moneda)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelUsuario>
  );
}

/**
 * Pestana 1: la alerta de inactividad, la bitacora de partes (lo mas nuevo
 * arriba) y la ficha tecnica con los contactos listos para copiar.
 */
export function PestanaSeguimiento({
  ficha,
  resumen,
  hoy,
  onNuevoParte,
  onEditar,
}: {
  ficha: FichaUsuario;
  resumen: ResumenUsuario;
  hoy: string;
  onNuevoParte: () => void;
  onEditar: () => void;
}) {
  const { contacto } = resumen;
  const proximoVencido = resumen.proximoContacto !== "" && resumen.proximoContacto < hoy;
  return (
    <div className="flex flex-col gap-4">
      {resumen.requiereSeguimiento ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <Icono nombre="alerta" className="mt-0.5 size-4" />
            <span>
              <strong>Requiere seguimiento.</strong>{" "}
              {contacto.dias === null
                ? "Todavía no hay partes ni pedidos registrados."
                : `Pasaron ${contacto.dias} días desde el último ${contacto.origen === "pedido" ? "pedido" : "parte"}; el umbral de esta cuenta es de ${ficha.umbralSeguimientoDias} días.`}
              {proximoVencido ? ` El contacto previsto para el ${fechaUsuario(resumen.proximoContacto)} ya pasó.` : ""}
            </span>
          </p>
          <Button tamano="sm" onClick={onNuevoParte}>
            <Icono nombre="mas" className="size-3.5" />
            Registrar contacto
          </Button>
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PanelUsuario
          titulo="Bitácora de partes"
          detalle={
            resumen.proximoContacto
              ? `Próximo contacto: ${fechaUsuario(resumen.proximoContacto)}${proximoVencido ? " (vencido)" : ""}`
              : "Sin próxima fecha de contacto"
          }
          acciones={
            <Button tamano="sm" variante="secundario" onClick={onNuevoParte}>
              <Icono nombre="mas" className="size-3.5" />
              Nuevo parte
            </Button>
          }
        >
          {ficha.partes.length === 0 ? (
            <VacioUsuario>Todavía no hay partes de seguimiento.</VacioUsuario>
          ) : (
            <ol className="flex flex-col divide-y divide-slate-100">
              {ficha.partes.map((parte) => (
                <li key={parte.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <BadgeUsuario tono={TONO_PARTE[parte.tipo]}>{TIPOS_PARTE[parte.tipo]}</BadgeUsuario>
                    <time dateTime={parte.fecha} className="font-medium text-slate-700 tabular-nums">
                      {MOMENTO.format(new Date(parte.fecha))}
                    </time>
                    <span aria-hidden="true">·</span>
                    <span>{parte.autor}</span>
                  </div>
                  <p className="mt-1.5 text-sm whitespace-pre-wrap text-slate-800">{parte.resumen}</p>
                  {parte.proximoContacto ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Icono nombre="calendario" className="size-3" />
                      Volver a contactar el {fechaUsuario(parte.proximoContacto)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </PanelUsuario>

        <div className="flex flex-col gap-4">
          <PedidosEnCurso ficha={ficha} hoy={hoy} />
          <PanelUsuario titulo="Contactos clave" detalle={ficha.contactos.some((persona) => persona.nombre) ? undefined : "Completá los contactos desde la ficha cuando estén los datos reales."}>
            <ul className="flex flex-col divide-y divide-slate-100">
              {ficha.contactos.map((persona) => (
                <li key={persona.id} className="px-4 py-2.5">
                  <p className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-slate-900">{persona.nombre || <span className="font-normal text-slate-400">A completar</span>}</span>
                    <BadgeUsuario>{ROLES_CONTACTO[persona.rol]}</BadgeUsuario>
                  </p>
                  {persona.telefono ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                      <Icono nombre="telefono" className="size-3 text-slate-400" />
                      <span className="min-w-0 truncate tabular-nums">{persona.telefono}</span>
                      <CopiarDato valor={persona.telefono} etiqueta="Teléfono" />
                    </p>
                  ) : null}
                  {persona.email ? (
                    <p className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Icono nombre="mail" className="size-3 text-slate-400" />
                      <span className="min-w-0 truncate">{persona.email}</span>
                      <CopiarDato valor={persona.email} etiqueta="Email" />
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-400">Sin teléfono ni email cargados</p>
                  )}
                </li>
              ))}
            </ul>
          </PanelUsuario>

          <PanelUsuario
            titulo="Ficha técnica"
            acciones={
              <button type="button" onClick={onEditar} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                <Icono nombre="editar" className="size-3" />
                Editar
              </button>
            }
          >
            <dl className="divide-y divide-slate-100 px-4 py-1">
              <Dato etiqueta="Razón social">{ficha.nombre}</Dato>
              <Dato etiqueta="Nombre de fantasía">{ficha.fantasia || "—"}</Dato>
              <Dato etiqueta="CUIT">
                <span className="inline-flex items-center gap-1 tabular-nums">
                  {ficha.cuit || "—"}
                  <CopiarDato valor={ficha.cuit} etiqueta="CUIT" />
                </span>
              </Dato>
              <Dato etiqueta="Condición IVA">{ficha.condicionIva || "—"}</Dato>
              <Dato etiqueta="Actividad">{ficha.actividad || "—"}</Dato>
              <Dato etiqueta="Provincia">{ficha.provincia || "—"}</Dato>
              <Dato etiqueta="Plazo de pago">{ficha.plazoPagoDias} días fecha de factura</Dato>
              <Dato etiqueta="Lista de precios">{ficha.listaPrecios || "—"}</Dato>
              <Dato etiqueta="Límite de crédito">{dineroUsuario(ficha.limiteCredito, ficha.moneda)}</Dato>
              <Dato etiqueta="Crédito disponible">
                <span className={resumen.creditoDisponible < 0 ? "font-medium text-red-700" : ""}>{dineroUsuario(resumen.creditoDisponible, ficha.moneda)}</span>
              </Dato>
              <Dato etiqueta="Alerta de inactividad">a los {ficha.umbralSeguimientoDias} días sin contacto</Dato>
            </dl>
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-500">Direcciones de entrega</p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {ficha.direccionesEntrega.length === 0 ? <li className="text-sm text-slate-400">Sin direcciones cargadas</li> : null}
                {ficha.direccionesEntrega.map((direccion) => (
                  <li key={direccion} className="flex items-start justify-between gap-2 text-sm text-slate-800">
                    <span className="min-w-0">{direccion}</span>
                    <CopiarDato valor={direccion} etiqueta="Dirección" />
                  </li>
                ))}
              </ul>
            </div>
          </PanelUsuario>
        </div>
      </div>
    </div>
  );
}
