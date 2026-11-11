"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeUsuario, MetricaUsuario, PanelUsuario, RelacionUsuario, VacioUsuario, campoUsuario, tablaUsuario } from "@/components/usuarios/Compartidos";
import { dineroUsuario, fechaUsuario, resumenUsuario } from "@/lib/usuarios/analisis";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { FichaUsuario } from "@/types/usuarios";
import { RELACIONES } from "@/types/seguimiento";

export function CarteraUsuarios({ fichas, hoy, simulacion = false }: { fichas: FichaUsuario[]; hoy: string; simulacion?: boolean }) {
  const rutaFicha = (codigo: string) => `/usuarios/${encodeURIComponent(codigo)}${simulacion ? "?simulacion=1" : ""}`;
  const [busqueda, setBusqueda] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [actividad, setActividad] = useState("");
  const [relacion, setRelacion] = useState("");
  const [foco, setFoco] = useState("todos");
  const filas = useMemo(() => fichas.map((ficha) => ({ ficha, resumen: resumenUsuario(ficha, hoy) })), [fichas, hoy]);
  const contactos = filas.filter(({ resumen: r }) => r.observacion?.proximoContacto && r.observacion.proximoContacto <= hoy);
  const riesgo = filas.filter(({ resumen: r }) => r.relacion === "EN_RIESGO");
  const vencidas = filas.reduce((total, { resumen }) => total + resumen.vencidas.length, 0);
  const abiertas = filas.reduce((total, { resumen }) => total + resumen.abiertas.length, 0);
  const visibles = filas.filter(({ ficha, resumen: r }) => {
    const texto = normalizarEncabezado(busqueda.trim());
    if (texto && ![ficha.nombre, ficha.codigo, ficha.contacto, ficha.cuit].some((valor) => normalizarEncabezado(valor).includes(texto))) return false;
    if (vendedor && ficha.vendedor !== vendedor) return false;
    if (actividad && ficha.actividad !== actividad) return false;
    if (relacion && r.relacion !== relacion) return false;
    if (foco === "contactos" && !contactos.some((c) => c.ficha.codigo === ficha.codigo)) return false;
    if (foco === "riesgo" && r.relacion !== "EN_RIESGO") return false;
    if (foco === "cobranza" && r.vencidas.length === 0) return false;
    if (foco === "cotizaciones" && r.abiertas.length === 0) return false;
    return true;
  });
  return <div className="flex flex-col gap-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricaUsuario etiqueta="Cuentas USUARIOS" valor={fichas.length} detalle="Grandes empresas y multinacionales" />
      <MetricaUsuario etiqueta="Relaciones en riesgo" valor={riesgo.length} detalle="Según la última observación del vendedor" alerta={riesgo.length > 0} />
      <MetricaUsuario etiqueta="Cotizaciones por gestionar" valor={abiertas} detalle="Pendientes, en negociación o vencidas" />
      <MetricaUsuario etiqueta="Facturas vencidas" valor={vencidas} detalle="Comprobantes con saldo por cobrar" alerta={vencidas > 0} />
    </div>
    <PanelUsuario titulo="Cartera de clientes USUARIOS" detalle="Priorizá las gestiones y abrí la ficha completa de cada cuenta.">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <input aria-label="Buscar cliente USUARIO" placeholder="Cliente, código, CUIT o contacto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className={campoUsuario} />
          <select aria-label="Vendedor asignado" value={vendedor} onChange={(e) => setVendedor(e.target.value)} className={campoUsuario}><option value="">Todos los vendedores</option>{[...new Set(fichas.map((f) => f.vendedor))].sort().map((v) => <option key={v}>{v}</option>)}</select>
          <select aria-label="Actividad del cliente" value={actividad} onChange={(e) => setActividad(e.target.value)} className={campoUsuario}><option value="">Todas las actividades</option>{[...new Set(fichas.map((f) => f.actividad))].sort().map((a) => <option key={a}>{a}</option>)}</select>
          <select aria-label="Estado de la relación" value={relacion} onChange={(e) => setRelacion(e.target.value)} className={campoUsuario}><option value="">Todas las relaciones</option>{Object.entries(RELACIONES).map(([clave, etiqueta]) => <option key={clave} value={clave}>{etiqueta}</option>)}</select>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Prioridades de gestión">
          {[["todos", "Todos"], ["contactos", `Contactar hoy o atrasados (${contactos.length})`], ["riesgo", `En riesgo (${riesgo.length})`], ["cobranza", "Con facturas vencidas"], ["cotizaciones", "Con cotizaciones abiertas"]].map(([clave, texto]) => <button key={clave} type="button" aria-pressed={foco === clave} onClick={() => setFoco(clave)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${foco === clave ? "border-[#1b2b5e] bg-[#1b2b5e] text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{texto}</button>)}
        </div>
      </div>
      {visibles.length === 0 ? <VacioUsuario>No hay clientes que coincidan con estos filtros.</VacioUsuario> : <div className="overflow-x-auto">
        <table className={tablaUsuario}>
          <thead><tr><th>Cliente / actividad</th><th>Vendedor / relación</th><th>Situación comercial</th><th>Próxima gestión</th><th><span className="sr-only">Ficha</span></th></tr></thead>
          <tbody>{visibles.map(({ ficha: f, resumen: r }) => <tr key={f.codigo}>
            <td className="min-w-60"><Link href={rutaFicha(f.codigo)} className="font-semibold text-[#1b2b5e] hover:underline">{f.nombre}</Link><p className="mt-1 text-xs text-slate-500">#{f.codigo} · {f.actividad}</p><p className="mt-1 text-xs text-slate-500">{f.provincia}</p></td>
            <td className="min-w-48"><p className="mb-2 text-sm">{f.vendedor}</p><RelacionUsuario relacion={r.relacion} /></td>
            <td className="min-w-52"><p className="text-xs">{r.abiertas.length} cotizaciones abiertas</p><p className={`mt-1 text-xs ${r.vencido > 0 ? "font-medium text-red-700" : "text-slate-500"}`}>Vencido: {dineroUsuario(r.vencido, f.moneda)} {f.moneda}</p><p className="mt-1 text-xs text-slate-500">Último pedido: {r.ultimoPedido ? fechaUsuario(r.ultimoPedido.fecha) : "Sin pedidos"}</p></td>
            <td className="min-w-60 max-w-xs">{r.observacion?.proximoContacto ? <><BadgeUsuario tono={r.observacion.proximoContacto < hoy ? "rojo" : r.observacion.proximoContacto === hoy ? "ambar" : "azul"}>{fechaUsuario(r.observacion.proximoContacto)}{r.observacion.proximoContacto < hoy ? " · Atrasada" : ""}</BadgeUsuario><p className="mt-2 text-xs text-slate-600">{r.observacion.proximaAccion}</p></> : <span className="text-xs text-slate-400">Sin próxima acción registrada</span>}</td>
            <td><Link href={rutaFicha(f.codigo)} className="whitespace-nowrap rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100">Ver ficha →</Link></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{visibles.length} de {fichas.length} cuentas · Los importes se muestran en la moneda de cada cliente.</p>
    </PanelUsuario>
  </div>;
}
