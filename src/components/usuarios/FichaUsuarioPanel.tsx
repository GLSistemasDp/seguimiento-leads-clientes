"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { AvisoUsuarios, BadgeUsuario, MetricaUsuario, PanelUsuario, RelacionUsuario, campoUsuario } from "@/components/usuarios/Compartidos";
import { CotizacionesUsuario, FacturasUsuario, PedidosUsuario } from "@/components/usuarios/DocumentosUsuario";
import { ObservacionesUsuario } from "@/components/usuarios/ObservacionesUsuario";
import { ResumenUsuario } from "@/components/usuarios/ResumenUsuario";
import { BotonSimularUsuarios } from "@/components/usuarios/BotonSimularUsuarios";
import { dineroUsuario, fechaUsuario, resumenUsuario } from "@/lib/usuarios/analisis";
import { aplicarGestion, gestionVacia, registrarGestionUsuario } from "@/lib/usuarios/gestion";
import type { CambioUsuario, FichaUsuario, PerfilUsuarioEditable } from "@/types/usuarios";

const TABS = { resumen: "Resumen comercial", pedidos: "Pedidos", cotizaciones: "Cotizaciones", facturas: "Facturas y cobranzas", observaciones: "Observaciones e historial" } as const;
type Tab = keyof typeof TABS;

function DatoUsuario({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return <div><dt className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">{etiqueta}</dt><dd className="mt-1 break-words text-sm text-slate-800">{children || "Sin informar"}</dd></div>;
}

function EditarPerfilUsuario({ ficha, guardar, guardando, onCerrar }: { ficha: FichaUsuario; guardar: (cambio: CambioUsuario) => Promise<boolean>; guardando: boolean; onCerrar: () => void }) {
  const [perfil, setPerfil] = useState<PerfilUsuarioEditable>({ actividad: ficha.actividad, vendedor: ficha.vendedor, contacto: ficha.contacto, email: ficha.email, telefono: ficha.telefono });
  const cambiar = (clave: keyof PerfilUsuarioEditable, valor: string) => setPerfil((p) => ({ ...p, [clave]: valor }));
  return <Modal abierto titulo="Editar ficha comercial interna" ancho="lg" onCerrar={onCerrar}>
    <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); if (await guardar({ accion: "perfil", perfil })) onCerrar(); }}>
      <label className="text-sm font-medium">Actividad <span className="text-red-600">*</span><input list="actividades-usuario" value={perfil.actividad} onChange={(e) => cambiar("actividad", e.target.value)} required maxLength={120} className={`${campoUsuario} mt-1`} /><datalist id="actividades-usuario">{["Petrolera", "Metalúrgica", "Automotriz", "Alimenticia", "Minería", "Construcción", "Energía", "Química", "Logística"].map((v) => <option key={v} value={v} />)}</datalist></label>
      <label className="text-sm font-medium">Vendedor asignado <span className="text-red-600">*</span><input required maxLength={160} value={perfil.vendedor} onChange={(e) => cambiar("vendedor", e.target.value)} className={`${campoUsuario} mt-1`} /></label>
      <label className="text-sm font-medium">Contacto de la empresa<input maxLength={160} value={perfil.contacto} onChange={(e) => cambiar("contacto", e.target.value)} className={`${campoUsuario} mt-1`} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Email<input type="email" maxLength={254} value={perfil.email} onChange={(e) => cambiar("email", e.target.value)} className={`${campoUsuario} mt-1`} /></label><label className="text-sm font-medium">Teléfono<input maxLength={80} value={perfil.telefono} onChange={(e) => cambiar("telefono", e.target.value)} className={`${campoUsuario} mt-1`} /></label></div>
      <div className="flex justify-end gap-2"><Button variante="secundario" disabled={guardando} onClick={onCerrar}>Cancelar</Button><Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar ficha"}</Button></div>
    </form>
  </Modal>;
}

export function FichaUsuarioPanel({ inicial, hoy, simulacion = false }: { inicial: FichaUsuario; hoy: string; simulacion?: boolean }) {
  const [ficha, setFicha] = useState(inicial);
  const [gestionSimulada, setGestionSimulada] = useState(gestionVacia);
  const [tab, setTab] = useState<Tab>("resumen");
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const [guardando, setGuardando] = useState(false);
  const [editarPerfil, setEditarPerfil] = useState(false);
  const { mostrar } = useToast();
  const resumen = resumenUsuario(ficha, hoy, anio);
  const anios = [...new Set([Number(hoy.slice(0, 4)), ...ficha.pedidos.map((p) => Number(p.fecha.slice(0, 4))), ...ficha.facturas.map((f) => Number(f.fecha.slice(0, 4)))])].sort((a, b) => b - a);
  async function guardar(cambio: CambioUsuario): Promise<boolean> {
    if (guardando) return false;
    setGuardando(true);
    try {
      if (simulacion) {
        const gestion = registrarGestionUsuario(inicial, gestionSimulada, cambio, "Simulación · Equipo comercial", new Date().toISOString(), crypto.randomUUID());
        setGestionSimulada(gestion);
        setFicha(aplicarGestion(inicial, gestion));
        mostrar("Cambio aplicado a la simulación.", "exito");
        return true;
      }
      const respuesta = await fetch(`/api/usuarios/${encodeURIComponent(ficha.codigo)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambio) });
      const datos = await respuesta.json() as { ficha?: FichaUsuario; error?: string };
      if (!respuesta.ok || !datos.ficha) throw new Error(datos.error || "No se pudo guardar la gestión.");
      setFicha(datos.ficha);
      mostrar("La gestión se guardó en la ficha y en su historial.", "exito");
      return true;
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "No se pudo guardar.", "error");
      return false;
    } finally { setGuardando(false); }
  }
  return <div className="flex flex-col gap-5">
    <EncabezadoPagina titulo={ficha.nombre} etiqueta="GESTIÓN COMERCIAL INTERNA" descripcion={`Cliente #${ficha.codigo} · ${ficha.actividad} · Vendedor: ${ficha.vendedor}`} acciones={<BotonSimularUsuarios activo={simulacion} ruta={`/usuarios/${encodeURIComponent(ficha.codigo)}`} />} />
    <AvisoUsuarios simulacion={simulacion} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricaUsuario etiqueta="Límite de crédito" valor={dineroUsuario(ficha.limiteCredito, ficha.moneda)} detalle={ficha.moneda} />
      <MetricaUsuario etiqueta="Saldo pendiente total" valor={dineroUsuario(resumen.saldo, ficha.moneda)} detalle={`${ficha.moneda} · ${resumen.pendientes.length} facturas pendientes`} />
      <MetricaUsuario etiqueta="Crédito disponible" valor={dineroUsuario(resumen.creditoDisponible, ficha.moneda)} detalle={`${ficha.moneda} · Límite menos saldo pendiente`} alerta={resumen.creditoDisponible < 0} />
      <MetricaUsuario etiqueta="Saldo vencido" valor={dineroUsuario(resumen.vencido, ficha.moneda)} detalle={`${ficha.moneda} · ${resumen.vencidas.length} facturas vencidas`} alerta={resumen.vencido > 0} />
    </div>

    <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <PanelUsuario titulo="Ficha del cliente" acciones={<Button variante="fantasma" tamano="sm" onClick={() => setEditarPerfil(true)}>Editar</Button>}>
        <div className="p-5"><div className="flex flex-wrap items-center gap-2"><BadgeUsuario tono="azul">USUARIO</BadgeUsuario><RelacionUsuario relacion={resumen.relacion} /></div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
            <DatoUsuario etiqueta="Actividad">{ficha.actividad}</DatoUsuario><DatoUsuario etiqueta="Vendedor asignado">{ficha.vendedor}</DatoUsuario>
            <DatoUsuario etiqueta="Contacto">{ficha.contacto}</DatoUsuario><DatoUsuario etiqueta="Email">{ficha.email ? <a href={`mailto:${ficha.email}`} className="text-blue-700 hover:underline">{ficha.email}</a> : null}</DatoUsuario>
            <DatoUsuario etiqueta="Teléfono">{ficha.telefono}</DatoUsuario><DatoUsuario etiqueta="Provincia">{ficha.provincia}</DatoUsuario>
            <DatoUsuario etiqueta="CUIT">{ficha.cuit}</DatoUsuario><DatoUsuario etiqueta="Condición de pago">{ficha.condicionPago}</DatoUsuario>
            <DatoUsuario etiqueta="Último pedido">{resumen.ultimoPedido ? <>{fechaUsuario(resumen.ultimoPedido.fecha)}<span className="mt-1 block text-xs text-slate-500">Hace {resumen.diasSinCompra} días</span></> : "Sin pedidos"}</DatoUsuario>
          </dl>
          <Link href={`/mailing?categoria=usuarios&cliente=${encodeURIComponent(ficha.codigo)}`} className="mt-5 flex items-center justify-center rounded-lg bg-[#1b2b5e] px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-900">Preparar mail para este cliente</Link>
        </div>
      </PanelUsuario>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Información del cliente USUARIO" className="flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
            {(Object.entries(TABS) as [Tab, string][]).map(([clave, etiqueta]) => <button type="button" key={clave} role="tab" aria-selected={tab === clave} aria-controls={`usuario-panel-${clave}`} id={`usuario-tab-${clave}`} onClick={() => setTab(clave)} className={`rounded-lg px-3 py-2 text-xs font-medium ${tab === clave ? "bg-[#1b2b5e] text-white" : "text-slate-600 hover:bg-slate-50"}`}>{etiqueta}{clave === "cotizaciones" ? ` (${resumen.abiertas.length})` : clave === "facturas" ? ` (${resumen.pendientes.length})` : ""}</button>)}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">Año de análisis<select aria-label="Año de análisis comercial" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">{anios.map((a) => <option key={a}>{a}</option>)}</select></label>
        </div>
        <div role="tabpanel" id={`usuario-panel-${tab}`} aria-labelledby={`usuario-tab-${tab}`}>
          {tab === "resumen" ? <ResumenUsuario ficha={ficha} hoy={hoy} anio={anio} onIr={setTab} /> : null}
          {tab === "pedidos" ? <PedidosUsuario ficha={ficha} anio={anio} /> : null}
          {tab === "cotizaciones" ? <CotizacionesUsuario ficha={ficha} hoy={hoy} anio={anio} guardar={guardar} guardando={guardando} /> : null}
          {tab === "facturas" ? <FacturasUsuario ficha={ficha} hoy={hoy} anio={anio} guardar={guardar} guardando={guardando} /> : null}
          {tab === "observaciones" ? <ObservacionesUsuario ficha={ficha} hoy={hoy} guardar={guardar} guardando={guardando} /> : null}
        </div>
      </div>
    </div>
    {editarPerfil ? <EditarPerfilUsuario ficha={ficha} guardar={guardar} guardando={guardando} onCerrar={() => setEditarPerfil(false)} /> : null}
  </div>;
}
