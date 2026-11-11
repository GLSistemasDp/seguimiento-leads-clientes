"use client";

import { Fragment, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { BadgeUsuario, PanelUsuario, VacioUsuario, campoUsuario, tablaUsuario } from "@/components/usuarios/Compartidos";
import { dineroUsuario, estadoCotizacion, estadoFactura, fechaUsuario, totalProductos } from "@/lib/usuarios/analisis";
import { ESTADOS_COTIZACION, ESTADOS_PEDIDO_USUARIO } from "@/types/usuarios";
import type { CambioUsuario, CotizacionUsuario, FichaUsuario, ProductoUsuario } from "@/types/usuarios";

export type GuardarUsuario = (cambio: CambioUsuario) => Promise<boolean>;

function DetalleProductosUsuario({ productos, moneda }: { productos: ProductoUsuario[]; moneda: FichaUsuario["moneda"] }) {
  return <div className="overflow-x-auto"><table className={tablaUsuario}><thead><tr><th>Código / descripción</th><th>Línea</th><th>Cantidad</th><th>Precio unitario</th><th>Total {moneda}</th></tr></thead><tbody>{productos.map((p) => <tr key={p.codigo}><td className="min-w-64"><span className="font-mono text-xs">{p.codigo}</span><p className="mt-1 text-xs">{p.descripcion}</p></td><td>{p.linea}</td><td>{p.cantidad.toLocaleString("es-AR")}</td><td className="whitespace-nowrap">{dineroUsuario(p.precioUnitario, moneda)}</td><td className="whitespace-nowrap">{dineroUsuario(p.precioUnitario * p.cantidad, moneda)}</td></tr>)}</tbody></table></div>;
}

export function PedidosUsuario({ ficha, anio }: { ficha: FichaUsuario; anio: number }) {
  const [filtro, setFiltro] = useState("");
  const pedidos = ficha.pedidos.filter((p) => p.fecha.startsWith(String(anio)) && (!filtro || p.estado === filtro)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return <PanelUsuario titulo="Historial de pedidos" detalle={`Pedidos realizados en ${anio} · Importes en ${ficha.moneda}`} acciones={<select aria-label="Estado del pedido" value={filtro} onChange={(e) => setFiltro(e.target.value)} className={campoUsuario}><option value="">Todos los estados</option>{Object.entries(ESTADOS_PEDIDO_USUARIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}>
    {pedidos.length ? <div className="overflow-x-auto"><table className={tablaUsuario}><thead><tr><th>Pedido / orden de compra</th><th>Fecha</th><th>Estado</th><th>Entrega estimada</th><th>Importe {ficha.moneda}</th></tr></thead><tbody>{pedidos.map((p) => <Fragment key={p.id}><tr><td className="min-w-52"><p className="font-mono text-xs font-semibold text-[#1b2b5e]">{p.numero}</p><p className="mt-1 text-xs text-slate-500">{p.ordenCompra}</p></td><td className="whitespace-nowrap">{fechaUsuario(p.fecha)}</td><td><BadgeUsuario tono={p.estado === "ENTREGADO" ? "verde" : p.estado === "CANCELADO" ? "neutro" : "azul"}>{ESTADOS_PEDIDO_USUARIO[p.estado]}</BadgeUsuario></td><td className="whitespace-nowrap">{fechaUsuario(p.entregaEstimada)}</td><td className="whitespace-nowrap font-medium tabular-nums">{dineroUsuario(totalProductos(p.productos), ficha.moneda)}</td></tr><tr><td colSpan={5} className="!pt-0"><details><summary className="cursor-pointer text-xs font-medium text-blue-700">Ver {p.productos.length} artículos del pedido</summary><div className="mt-3 rounded-lg border border-slate-200"><DetalleProductosUsuario productos={p.productos} moneda={ficha.moneda} /></div></details></td></tr></Fragment>)}</tbody></table></div> : <VacioUsuario>No hay pedidos para este año y estado.</VacioUsuario>}
  </PanelUsuario>;
}

function EditarCotizacionUsuario({ cotizacion, guardar, guardando, onCerrar }: { cotizacion: CotizacionUsuario; guardar: GuardarUsuario; guardando: boolean; onCerrar: () => void }) {
  const [estado, setEstado] = useState(cotizacion.estado);
  const [motivo, setMotivo] = useState(cotizacion.motivoNoGanada);
  return <Modal abierto titulo={`Gestionar ${cotizacion.numero}`} ancho="lg" onCerrar={onCerrar}>
    <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); if (await guardar({ accion: "cotizacion", cotizacionId: cotizacion.id, estado, motivoNoGanada: estado === "NO_GANADA" ? motivo : "" })) onCerrar(); }}>
      <label className="text-sm font-medium text-slate-700">Estado de la cotización<select value={estado} onChange={(e) => setEstado(e.target.value as CotizacionUsuario["estado"])} className={`${campoUsuario} mt-1`}>{Object.entries(ESTADOS_COTIZACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {estado === "NO_GANADA" ? <label className="text-sm font-medium text-slate-700">Motivo informado por el cliente <span className="text-red-600">*</span><textarea required rows={4} maxLength={2000} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Qué nos dijo el cliente: precio, entrega, especificación, decisión del proyecto…" className={`${campoUsuario} mt-1`} /><span className="mt-1 block text-xs font-normal text-slate-500">Registrá la explicación del cliente para poder mejorar la próxima propuesta.</span></label> : null}
      <p className="text-xs text-slate-500">El cambio y el motivo quedan en el historial de esta cuenta.</p>
      <div className="flex justify-end gap-2"><Button variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Button><Button type="submit" disabled={guardando || (estado === "NO_GANADA" && !motivo.trim())}>{guardando ? "Guardando…" : "Guardar estado"}</Button></div>
    </form>
  </Modal>;
}

export function CotizacionesUsuario({ ficha, anio, hoy, guardar, guardando }: { ficha: FichaUsuario; anio: number; hoy: string; guardar: GuardarUsuario; guardando: boolean }) {
  const [filtro, setFiltro] = useState("");
  const [editarId, setEditarId] = useState<string | null>(null);
  const cotizaciones = ficha.cotizaciones.filter((c) => c.fecha.startsWith(String(anio)) && (!filtro || estadoCotizacion(c, hoy) === filtro)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const editar = ficha.cotizaciones.find((c) => c.id === editarId);
  return <>
    <PanelUsuario titulo="Cotizaciones y oportunidades" detalle={`Propuestas emitidas en ${anio} · El motivo de cada propuesta no ganada queda visible.`} acciones={<select aria-label="Filtrar cotizaciones" value={filtro} onChange={(e) => setFiltro(e.target.value)} className={campoUsuario}><option value="">Todos los estados</option>{Object.entries(ESTADOS_COTIZACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}>
      {cotizaciones.length ? <div className="overflow-x-auto"><table className={tablaUsuario}><thead><tr><th>Cotización / fecha</th><th>Validez</th><th>Estado</th><th>Importe {ficha.moneda}</th><th>Motivo informado por el cliente</th><th>Gestión</th></tr></thead><tbody>{cotizaciones.map((c) => {
        const estado = estadoCotizacion(c, hoy);
        return <Fragment key={c.id}><tr><td className="min-w-44"><p className="font-mono text-xs font-semibold text-[#1b2b5e]">{c.numero}</p><p className="mt-1 text-xs text-slate-500">{fechaUsuario(c.fecha)}</p></td><td className="whitespace-nowrap">{fechaUsuario(c.validez)}</td><td><BadgeUsuario tono={estado === "GANADA" ? "verde" : estado === "NO_GANADA" ? "rojo" : estado === "VENCIDA" ? "ambar" : "azul"}>{ESTADOS_COTIZACION[estado]}</BadgeUsuario></td><td className="whitespace-nowrap tabular-nums">{dineroUsuario(totalProductos(c.productos), ficha.moneda)}</td><td className="min-w-64 max-w-sm text-xs leading-5">{c.estado === "NO_GANADA" ? c.motivoNoGanada || "Sin motivo registrado" : <span className="text-slate-400">—</span>}</td><td><Button variante="secundario" tamano="sm" disabled={guardando} onClick={() => setEditarId(c.id)}>Gestionar</Button></td></tr><tr><td colSpan={6} className="!pt-0"><details><summary className="cursor-pointer text-xs font-medium text-blue-700">Ver artículos cotizados</summary><div className="mt-3 rounded-lg border border-slate-200"><DetalleProductosUsuario productos={c.productos} moneda={ficha.moneda} /></div></details></td></tr></Fragment>;
      })}</tbody></table></div> : <VacioUsuario>No hay cotizaciones para este año y estado.</VacioUsuario>}
    </PanelUsuario>
    {editar ? <EditarCotizacionUsuario key={editar.id} cotizacion={editar} guardar={guardar} guardando={guardando} onCerrar={() => setEditarId(null)} /> : null}
  </>;
}

export function FacturasUsuario({ ficha, anio, hoy, guardar, guardando }: { ficha: FichaUsuario; anio: number; hoy: string; guardar: GuardarUsuario; guardando: boolean }) {
  const [filtro, setFiltro] = useState("pendientes");
  const [facturaId, setFacturaId] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [promesa, setPromesa] = useState("");
  const factura = ficha.facturas.find((f) => f.id === facturaId);
  const facturas = ficha.facturas.filter((f) => {
    if (filtro === "pendientes") return f.saldo > 0;
    if (filtro === "vencidas") return estadoFactura(f, hoy) === "Vencida";
    if (filtro === "pagadas") return f.saldo <= 0 && f.fecha.startsWith(String(anio));
    return f.saldo > 0 || f.fecha.startsWith(String(anio));
  }).sort((a, b) => (a.saldo > 0 && a.vencimiento < hoy ? 0 : 1) - (b.saldo > 0 && b.vencimiento < hoy ? 0 : 1) || b.fecha.localeCompare(a.fecha));
  function abrir(id: string) { setFacturaId(id); setComentario(""); setPromesa(""); }
  return <>
    <PanelUsuario titulo="Facturas y seguimiento de cobranzas" detalle={`Pendientes de todos los períodos. Historial de facturas pagadas de ${anio}. Importes en ${ficha.moneda}.`} acciones={<select aria-label="Filtrar facturas" value={filtro} onChange={(e) => setFiltro(e.target.value)} className={campoUsuario}><option value="pendientes">Todas las pendientes</option><option value="vencidas">Solo vencidas</option><option value="pagadas">Pagadas del año</option><option value="todas">Historial completo del año y pendientes</option></select>}>
      {facturas.length ? <div className="overflow-x-auto"><table className={tablaUsuario}><thead><tr><th>Factura / emisión</th><th>Vencimiento</th><th>Estado</th><th>Total / saldo {ficha.moneda}</th><th>Última gestión / pago prometido</th><th>Gestión</th></tr></thead><tbody>{facturas.map((f) => {
        const estado = estadoFactura(f, hoy);
        const notas = ficha.cobranzas[f.id] ?? [];
        const ultima = notas[0];
        return <tr key={f.id} className={estado === "Vencida" ? "bg-red-50/30" : ""}><td className="min-w-44"><p className="font-mono text-xs font-semibold text-[#1b2b5e]">{f.numero}</p><p className="mt-1 text-xs text-slate-500">{fechaUsuario(f.fecha)}</p></td><td className="whitespace-nowrap"><p>{fechaUsuario(f.vencimiento)}</p>{estado === "Vencida" ? <p className="mt-1 text-xs text-red-600">{Math.floor((Date.parse(hoy) - Date.parse(f.vencimiento)) / 86_400_000)} días de atraso</p> : null}</td><td><BadgeUsuario tono={estado === "Vencida" ? "rojo" : estado === "Pagada" ? "verde" : "ambar"}>{estado}</BadgeUsuario></td><td className="whitespace-nowrap tabular-nums"><p className="text-xs text-slate-500">Total {dineroUsuario(f.importe, ficha.moneda)}</p><p className="mt-1 font-semibold">Saldo {dineroUsuario(f.saldo, ficha.moneda)}</p></td><td className="min-w-64 max-w-sm text-xs leading-5">{ultima ? <><p>{ultima.comentario}</p>{ultima.fechaPrometida ? <p className={`mt-1 font-medium ${f.saldo > 0 && ultima.fechaPrometida < hoy ? "text-red-700" : "text-blue-700"}`}>Pago: {fechaUsuario(ultima.fechaPrometida)}{f.saldo > 0 && ultima.fechaPrometida < hoy ? " · Compromiso con fecha pasada" : ""}</p> : null}<p className="mt-1 text-[11px] text-slate-400">{notas.length} gestión{notas.length === 1 ? "" : "es"} · {ultima.autor}</p></> : <span className="text-slate-400">Sin gestiones registradas</span>}</td><td><Button variante="secundario" tamano="sm" onClick={() => abrir(f.id)}>{f.saldo > 0 ? "Comentar / acordar pago" : "Ver historial"}</Button></td></tr>;
      })}</tbody></table></div> : <VacioUsuario>No hay facturas para este filtro.</VacioUsuario>}
    </PanelUsuario>
    {factura ? <Modal abierto titulo={`Gestión de factura ${factura.numero}`} ancho="lg" onCerrar={() => setFacturaId(null)}>
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm">Saldo pendiente: <strong>{dineroUsuario(factura.saldo, ficha.moneda)} {ficha.moneda}</strong> · Vencimiento: {fechaUsuario(factura.vencimiento)}</p>
        {factura.saldo > 0 ? <form className="flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); if (await guardar({ accion: "cobranza", facturaId: factura.id, comentario, fechaPrometida: promesa })) { setComentario(""); setPromesa(""); } }}>
          <label className="text-sm font-medium text-slate-700">Comentario de cobranza o problema informado <span className="text-red-600">*</span><textarea required rows={4} maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Cuándo pagan, quién lo confirmó, si falta un remito, hubo diferencias o existe otro problema…" className={`${campoUsuario} mt-1`} /></label>
          <label className="text-sm font-medium text-slate-700">Fecha de pago prometida (opcional)<input type="date" value={promesa} onChange={(e) => setPromesa(e.target.value)} className={`${campoUsuario} mt-1`} /></label>
          <p className="text-xs text-slate-500">El comentario registra el acuerdo; el saldo se actualizará desde el ERP o base de datos.</p>
          <Button type="submit" disabled={guardando || !comentario.trim()} className="self-end">{guardando ? "Guardando…" : "Guardar gestión de cobranza"}</Button>
        </form> : null}
        <div className="border-t border-slate-200 pt-4"><h3 className="mb-3 text-sm font-semibold text-slate-900">Historial de esta factura</h3>{(ficha.cobranzas[factura.id] ?? []).length ? <ol className="flex flex-col gap-3">{(ficha.cobranzas[factura.id] ?? []).map((nota) => <li key={nota.id} className="rounded-lg border border-slate-200 p-3"><p className="text-[11px] text-slate-500">{fechaUsuario(nota.fecha)} · {nota.autor}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{nota.comentario}</p>{nota.fechaPrometida ? <p className="mt-2 text-xs font-medium text-blue-700">Fecha de pago informada: {fechaUsuario(nota.fechaPrometida)}</p> : null}</li>)}</ol> : <p className="text-xs text-slate-400">Sin comentarios anteriores.</p>}</div>
      </div>
    </Modal> : null}
  </>;
}
