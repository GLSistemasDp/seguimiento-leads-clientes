"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BadgeUsuario, PanelUsuario, RelacionUsuario, VacioUsuario, campoUsuario } from "@/components/usuarios/Compartidos";
import type { GuardarUsuario } from "@/components/usuarios/DocumentosUsuario";
import { fechaUsuario, historialUsuario, ultimaObservacion } from "@/lib/usuarios/analisis";
import { RELACIONES } from "@/types/seguimiento";
import type { Relacion } from "@/types/seguimiento";
import type { FichaUsuario } from "@/types/usuarios";

const TIPOS = { todos: "Toda la actividad", relacion: "Relación y observaciones", cotizacion: "Cotizaciones", cobranza: "Cobranzas", pedido: "Pedidos", factura: "Facturas", perfil: "Ficha comercial" } as const;

export function ObservacionesUsuario({ ficha, hoy, guardar, guardando }: { ficha: FichaUsuario; hoy: string; guardar: GuardarUsuario; guardando: boolean }) {
  const ultima = ultimaObservacion(ficha);
  const [relacion, setRelacion] = useState<Relacion>(ultima?.relacion ?? "BUENA");
  const [texto, setTexto] = useState("");
  const [contacto, setContacto] = useState(ultima?.proximoContacto ?? "");
  const [accion, setAccion] = useState(ultima?.proximaAccion ?? "");
  const [filtro, setFiltro] = useState<keyof typeof TIPOS>("todos");
  const [cantidad, setCantidad] = useState(30);
  const historial = useMemo(() => historialUsuario(ficha), [ficha]);
  const eventos = historial.filter((evento) => filtro === "todos" || evento.tipo === filtro);
  return <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
    <PanelUsuario titulo="Observaciones y relación con el cliente" detalle="Dejá una síntesis útil para quien vuelva a atender esta cuenta.">
      <div className="flex flex-col gap-4 p-5">
        {ultima ? <div className="rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-slate-500">Última evaluación</p><RelacionUsuario relacion={ultima.relacion} /></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{ultima.texto}</p><p className="mt-2 text-[11px] text-slate-400">{fechaUsuario(ultima.fecha)} · {ultima.autor}</p>{ultima.proximoContacto ? <p className={`mt-3 text-xs ${ultima.proximoContacto < hoy ? "text-red-700" : "text-blue-800"}`}>Próxima acción: {fechaUsuario(ultima.proximoContacto)} · {ultima.proximaAccion}</p> : null}</div> : null}
        <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); if (await guardar({ accion: "observacion", texto, relacion, proximoContacto: contacto, proximaAccion: accion })) setTexto(""); }}>
          <label className="text-sm font-medium text-slate-700">¿Cómo está la relación? <span className="text-red-600">*</span><select value={relacion} onChange={(e) => setRelacion(e.target.value as Relacion)} className={`${campoUsuario} mt-1`}>{Object.entries(RELACIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Resumen de la situación <span className="text-red-600">*</span><textarea required rows={5} maxLength={3000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qué nos dijo el cliente, cómo está el vínculo, qué necesita y qué acordamos hacer…" className={`${campoUsuario} mt-1`} /></label>
          <label className="text-sm font-medium text-slate-700">Fecha del próximo contacto<input type="date" value={contacto} onChange={(e) => setContacto(e.target.value)} className={`${campoUsuario} mt-1`} /></label>
          <label className="text-sm font-medium text-slate-700">Próxima acción del vendedor<textarea rows={2} maxLength={500} value={accion} onChange={(e) => setAccion(e.target.value)} placeholder="Ej.: confirmar precio, coordinar visita o llamar a Compras." className={`${campoUsuario} mt-1`} /></label>
          <p className="text-xs text-slate-500">La evaluación y la explicación se conservan en el historial. Para cerrar una próxima acción, dejá vacíos su fecha y su descripción.</p>
          <Button type="submit" disabled={guardando || !texto.trim() || Boolean(contacto) !== Boolean(accion.trim())} className="self-end">{guardando ? "Guardando…" : "Guardar observación y relación"}</Button>
        </form>
      </div>
    </PanelUsuario>
    <PanelUsuario titulo="Historial de la cuenta" detalle="Más reciente primero · operaciones comerciales y gestiones internas" acciones={<select aria-label="Filtrar historial" value={filtro} onChange={(e) => { setFiltro(e.target.value as keyof typeof TIPOS); setCantidad(30); }} className={campoUsuario}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}>
      {eventos.length ? <ol className="max-h-[1000px] divide-y divide-slate-100 overflow-y-auto px-5">{eventos.slice(0, cantidad).map((evento) => <li key={evento.id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><BadgeUsuario tono={evento.tipo === "cobranza" ? "ambar" : evento.tipo === "relacion" ? "azul" : "neutro"}>{TIPOS[evento.tipo]}</BadgeUsuario><span className="text-[11px] text-slate-400">{fechaUsuario(evento.fecha)}</span></div><p className="mt-2 text-sm font-semibold text-slate-900">{evento.titulo}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{evento.detalle}</p><p className="mt-2 text-[11px] text-slate-400">{evento.autor}</p></li>)}</ol> : <VacioUsuario>No hay registros de este tipo.</VacioUsuario>}
      {eventos.length > cantidad ? <div className="border-t border-slate-100 p-3 text-center"><Button variante="secundario" tamano="sm" onClick={() => setCantidad(cantidad + 30)}>Ver más registros ({eventos.length - cantidad})</Button></div> : null}
    </PanelUsuario>
  </div>;
}
