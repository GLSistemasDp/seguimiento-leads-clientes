"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { BadgeUsuario } from "@/components/usuarios/Compartidos";
import { FormDocumento, FormPago, FormParte, FormPerfil, FormRechazo } from "@/components/usuarios/FormulariosCuenta";
import { ResumenCartera } from "@/components/usuarios/ResumenCartera";
import { SelectorCuenta } from "@/components/usuarios/SelectorCuenta";
import { PestanaCotizaciones } from "@/components/usuarios/PestanaCotizaciones";
import { PestanaCuenta } from "@/components/usuarios/PestanaCuenta";
import { PestanaProductos } from "@/components/usuarios/PestanaProductos";
import { PestanaSeguimiento } from "@/components/usuarios/PestanaSeguimiento";
import { MailDocumentoUsuario, PlantillasMailUsuario } from "@/components/usuarios/PlantillasMailUsuario";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import type { NombreIcono } from "@/components/ui/Icono";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { dineroUsuario, fechaUsuario, productosHabituales, resumenUsuario } from "@/lib/usuarios/analisis";
import type { ResumenUsuario } from "@/lib/usuarios/analisis";
import { ESTADOS_CUENTA } from "@/lib/usuarios/cartera";
import type { FiltroCartera } from "@/lib/usuarios/cartera";
import type { ContextoMailUsuario, PlantillasUsuarios } from "@/lib/usuarios/plantillas";
import type { CambioUsuario, CotizacionUsuario, EstadoCotizacion, FichaUsuario } from "@/types/usuarios";

type Pestana = "seguimiento" | "cuenta" | "cotizaciones" | "productos" | "plantillas";
/** Formulario abierto (uno a la vez). */
type Accion = { tipo: "parte" | "pago" | "pedido" | "cotizacion" | "perfil" } | { tipo: "rechazo"; cotizacion: CotizacionUsuario };

const EXITO: Record<CambioUsuario["accion"], string> = {
  parte: "Parte guardado.",
  pago: "Pago registrado: se actualizaron las facturas y la cuenta corriente.",
  pedido: "Pedido cargado.",
  cotizacion: "Cotización guardada.",
  "estado-cotizacion": "Estado de la cotización actualizado.",
  perfil: "Ficha actualizada.",
};

function Indicador({ etiqueta, valor, detalle, tono = "neutro", icono }: { etiqueta: string; valor: ReactNode; detalle: ReactNode; tono?: "neutro" | "rojo" | "ambar" | "verde"; icono: NombreIcono }) {
  const color = { neutro: "text-slate-900", rojo: "text-red-700", ambar: "text-amber-700", verde: "text-emerald-700" }[tono];
  return (
    <div className={`min-w-0 rounded-xl border bg-white px-4 py-3 ${tono === "rojo" ? "border-red-200" : tono === "ambar" ? "border-amber-200" : "border-slate-200"}`}>
      <p className="flex items-center justify-between gap-2 text-xs text-slate-500">
        {etiqueta}
        <Icono nombre={icono} className="size-3.5 text-slate-400" />
      </p>
      <p className={`mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums ${color}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

/** Encabezado fijo, indicadores y pestanas de la cuenta elegida. */
function EspacioCuenta({
  ficha,
  plantillas,
  resumen,
  hoy,
  pestana,
  guardando,
  onPestana,
  onAccion,
  onCambiarEstado,
  onPrepararMail,
}: {
  ficha: FichaUsuario;
  plantillas: PlantillasUsuarios;
  resumen: ResumenUsuario;
  hoy: string;
  pestana: Pestana;
  guardando: boolean;
  onPestana: (pestana: Pestana) => void;
  onAccion: (accion: Accion) => void;
  onCambiarEstado: (cotizacion: CotizacionUsuario, estado: EstadoCotizacion) => void;
  onPrepararMail: (contexto: ContextoMailUsuario) => void;
}) {
  const dinero = (valor: number) => dineroUsuario(valor, ficha.moneda);
  const ausentes = productosHabituales(ficha, hoy).ausentes.length;
  const { contacto } = resumen;
  const acciones: { tipo: "parte" | "pedido" | "pago" | "cotizacion"; etiqueta: string }[] = [
    { tipo: "parte", etiqueta: "Nuevo parte" },
    { tipo: "pedido", etiqueta: "Cargar pedido" },
    { tipo: "pago", etiqueta: "Registrar pago" },
    { tipo: "cotizacion", etiqueta: "Nueva cotización" },
  ];

  return (
    <section aria-label={`Cuenta ${ficha.nombre}`} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50">
      {/* Fijo debajo del encabezado del CRM mientras se recorre la ficha. */}
      <header className="z-20 rounded-t-xl border-b border-slate-200 bg-white px-4 py-3 md:sticky md:top-[60px]">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg leading-tight font-semibold text-slate-900">{ficha.nombre}</h2>
              {resumen.requiereSeguimiento ? <BadgeUsuario tono="ambar"><Icono nombre="alerta" className="size-3" />Requiere seguimiento</BadgeUsuario> : null}
              {resumen.facturasVencidas > 0 ? <BadgeUsuario tono="rojo">Deuda vencida</BadgeUsuario> : null}
              {resumen.creditoDisponible < 0 ? <BadgeUsuario tono="ambar">Crédito excedido</BadgeUsuario> : null}
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
              {ficha.fantasia ? <span>{ficha.fantasia}</span> : null}
              {ficha.actividad ? <span>{ficha.actividad}</span> : null}
              <span>
                CUIT <span className="text-slate-700 tabular-nums">{ficha.cuit || "a completar"}</span>
              </span>
              {ficha.condicionIva ? <span>{ficha.condicionIva}</span> : null}
              <span>
                Ejecutivo: <span className="text-slate-700">{ficha.vendedor || "sin asignar"}</span>
              </span>
              <span>Código {ficha.codigo}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {acciones.map((accion, indice) => (
              <Button key={accion.tipo} tamano="sm" variante={indice === 0 ? "primario" : "secundario"} onClick={() => onAccion({ tipo: accion.tipo })}>
                <Icono nombre="mas" className="size-3.5" />
                {accion.etiqueta}
              </Button>
            ))}
            <Button tamano="sm" variante="secundario" onClick={() => onPestana("plantillas")}>
              <Icono nombre="mail" className="size-3.5" />
              Plantillas de mail
            </Button>
            {/* El centro de mailing necesita un email; las plantillas se pueden copiar sin él. */}
            {ficha.email ? (
              <Link
                href={`/mailing?categoria=usuarios&cliente=${encodeURIComponent(ficha.codigo)}`}
                title="Preparar un mail para esta cuenta"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                <Icono nombre="mail" className="size-3.5" />
                Mail
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <Indicador
            etiqueta="Estado de cuenta"
            icono="dinero"
            tono={resumen.facturasVencidas > 0 ? "rojo" : resumen.saldo > 0 ? "neutro" : "verde"}
            valor={dinero(resumen.saldo)}
            detalle={
              resumen.facturasVencidas > 0
                ? `${ESTADOS_CUENTA.VENCIDA}: ${dinero(resumen.deudaVencida)} · ${resumen.mayorMora} días de mora`
                : resumen.saldo > 0
                  ? "Saldo dentro del plazo de pago"
                  : ESTADOS_CUENTA.AL_DIA
            }
          />
          <Indicador
            etiqueta="Crédito disponible"
            icono="escudo"
            tono={resumen.creditoDisponible < 0 ? "ambar" : "neutro"}
            valor={dinero(resumen.creditoDisponible)}
            detalle={
              resumen.creditoDisponible < 0
                ? `${ESTADOS_CUENTA.EXCEDIDA} · límite ${dinero(ficha.limiteCredito)}`
                : `Usado ${Math.round((Math.max(0, resumen.saldo) / Math.max(1, ficha.limiteCredito)) * 100)}% de ${dinero(ficha.limiteCredito)}`
            }
          />
          <Indicador
            etiqueta="Pedidos pendientes"
            icono="paquete"
            valor={resumen.pedidosPendientes}
            detalle={resumen.pedidosPendientes === 0 ? "Todo entregado" : `${dinero(resumen.importePedidosPendientes)} sin entregar`}
          />
          <Indicador
            etiqueta={`Facturación acumulada ${hoy.slice(0, 4)}`}
            icono="tendencia"
            valor={dinero(resumen.facturacionAnio)}
            detalle={resumen.variacionAnual === null ? "Sin año anterior para comparar" : `${resumen.variacionAnual > 0 ? "+" : ""}${resumen.variacionAnual}% vs. mismo período del año anterior`}
          />
          <Indicador
            etiqueta="Cotizaciones pendientes"
            icono="documento"
            valor={dinero(resumen.importeCotizaciones)}
            detalle={resumen.cotizacionesAbiertas === 0 ? "Ninguna abierta" : `${resumen.cotizacionesAbiertas} ${resumen.cotizacionesAbiertas === 1 ? "abierta" : "abiertas"}: enviadas o en negociación`}
          />
          <Indicador
            etiqueta="Días desde último contacto"
            icono="reloj"
            tono={resumen.requiereSeguimiento ? "ambar" : "neutro"}
            valor={contacto.dias === null ? "Sin contacto" : contacto.dias === 0 ? "Hoy" : `${contacto.dias} ${contacto.dias === 1 ? "día" : "días"}`}
            detalle={
              contacto.fecha
                ? `Último ${contacto.origen === "pedido" ? "pedido" : "parte"}: ${fechaUsuario(contacto.fecha)} · alerta a los ${ficha.umbralSeguimientoDias} días`
                : `Umbral de ${ficha.umbralSeguimientoDias} días`
            }
          />
        </div>

        <div className="overflow-x-auto">
          <Tabs
            activo={pestana}
            onCambio={(id) => onPestana(id as Pestana)}
            tabs={[
              { id: "seguimiento", etiqueta: <span className="whitespace-nowrap">Resumen &amp; Seguimiento</span> },
              {
                id: "cuenta",
                etiqueta: (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    Estado de cuenta &amp; Facturación
                    {resumen.facturasVencidas > 0 ? <span className="rounded bg-red-600 px-1 text-[10px] font-semibold text-white">{resumen.facturasVencidas}</span> : null}
                  </span>
                ),
              },
              {
                id: "cotizaciones",
                etiqueta: (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    Cotizaciones
                    {resumen.cotizacionesAbiertas > 0 ? <span className="rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-800">{resumen.cotizacionesAbiertas}</span> : null}
                  </span>
                ),
              },
              {
                id: "productos",
                etiqueta: (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    Historial de productos &amp; Brechas
                    {ausentes > 0 ? <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">{ausentes}</span> : null}
                  </span>
                ),
              },
              { id: "plantillas", etiqueta: <span className="whitespace-nowrap">Plantillas de mail</span> },
            ]}
          />
        </div>

        <div role="tabpanel">
          {pestana === "seguimiento" ? (
            <PestanaSeguimiento ficha={ficha} resumen={resumen} hoy={hoy} onNuevoParte={() => onAccion({ tipo: "parte" })} onEditar={() => onAccion({ tipo: "perfil" })} />
          ) : pestana === "cuenta" ? (
            <PestanaCuenta ficha={ficha} resumen={resumen} hoy={hoy} onRegistrarPago={() => onAccion({ tipo: "pago" })} />
          ) : pestana === "cotizaciones" ? (
            <PestanaCotizaciones ficha={ficha} hoy={hoy} guardando={guardando} onNueva={() => onAccion({ tipo: "cotizacion" })} onCambiarEstado={onCambiarEstado} onPrepararMail={(cotizacion) => onPrepararMail({ cotizacion })} />
          ) : pestana === "productos" ? (
            <PestanaProductos ficha={ficha} hoy={hoy} onCargarPedido={() => onAccion({ tipo: "pedido" })} onPrepararMail={(pedido) => onPrepararMail({ pedido })} />
          ) : (
            <PlantillasMailUsuario key={ficha.codigo} ficha={ficha} plantillas={plantillas} hoy={hoy} />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * CRM de cuentas clave. Arriba, un menu desplegable con buscador para elegir
 * el cliente (sirve para listas largas). Sin cliente elegido se ve el resumen
 * de la cartera; con uno elegido, su ficha completa. Todas las cuentas llegan
 * cargadas, asi que cambiar de una a otra es inmediato.
 */
export function CuentasClave({ fichas, plantillas, hoy, inicial }: { fichas: FichaUsuario[]; plantillas: PlantillasUsuarios; hoy: string; inicial?: string }) {
  const { mostrar } = useToast();
  const [cuentas, setCuentas] = useState(fichas);
  const [seleccion, setSeleccion] = useState<string | null>(() => (inicial && fichas.some((ficha) => ficha.codigo === inicial) ? inicial : null));
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroCartera>("todos");
  const [pestana, setPestana] = useState<Pestana>("seguimiento");
  const [accion, setAccion] = useState<Accion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [correo, setCorreo] = useState<{ ficha: FichaUsuario; contexto: ContextoMailUsuario } | null>(null);

  const resumenes = useMemo(() => new Map(cuentas.map((ficha) => [ficha.codigo, resumenUsuario(ficha, hoy)])), [cuentas, hoy]);
  // En el menu, en orden alfabetico: es lo que se espera al buscar en una lista larga.
  const alfabetico = useMemo(() => [...cuentas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [cuentas]);
  const ficha = cuentas.find((cuenta) => cuenta.codigo === seleccion) ?? null;

  /** Elige un cliente (o vuelve al resumen con null). Queda en la direccion para compartir o volver con un link. */
  function seleccionar(codigo: string | null) {
    setSeleccion(codigo);
    setAccion(null);
    setCorreo(null);
    window.history.replaceState(null, "", codigo ? `/usuarios?cliente=${encodeURIComponent(codigo)}` : "/usuarios");
    window.scrollTo({ top: 0 });
  }

  async function guardar(cambio: CambioUsuario) {
    if (!ficha || guardando) return;
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/usuarios/${encodeURIComponent(ficha.codigo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambio),
      });
      const cuerpo = (await respuesta.json().catch(() => null)) as { ficha?: FichaUsuario; error?: string } | null;
      if (!respuesta.ok || !cuerpo?.ficha) {
        mostrar(cuerpo?.error ?? "No se pudo guardar. Probá de nuevo.", "error");
        return;
      }
      const actualizada = cuerpo.ficha;
      setCuentas((previas) => previas.map((cuenta) => (cuenta.codigo === actualizada.codigo ? actualizada : cuenta)));
      setAccion(null);
      if (cambio.accion === "pedido") {
        const pedido = actualizada.pedidos.find((item) => !ficha.pedidos.some((anterior) => anterior.id === item.id));
        if (pedido) setCorreo({ ficha: actualizada, contexto: { pedido } });
      } else if (cambio.accion === "cotizacion") {
        const cotizacion = actualizada.cotizaciones.find((item) => !ficha.cotizaciones.some((anterior) => anterior.id === item.id));
        if (cotizacion) setCorreo({ ficha: actualizada, contexto: { cotizacion } });
      }
      mostrar(EXITO[cambio.accion], "exito");
    } catch {
      mostrar("No se pudo guardar: revisá la conexión y probá de nuevo.", "error");
    } finally {
      setGuardando(false);
    }
  }

  function cambiarEstado(cotizacion: CotizacionUsuario, estado: EstadoCotizacion) {
    if (estado === cotizacion.estado) return;
    // Rechazar pide el motivo antes de guardar; el resto se guarda directo.
    if (estado === "RECHAZADA") setAccion({ tipo: "rechazo", cotizacion });
    else void guardar({ accion: "estado-cotizacion", cotizacionId: cotizacion.id, estado, motivoRechazo: null, observacionRechazo: "" });
  }

  const formulario = ficha ? { ficha, hoy, guardando, onGuardar: guardar, onCerrar: () => setAccion(null) } : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-[#1b2b5e]">Cuentas clave · clientes USUARIOS</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {ficha ? (
              <button type="button" onClick={() => seleccionar(null)} className="font-medium text-blue-700 hover:underline">
                ← Volver al resumen de la cartera
              </button>
            ) : (
              "Resumen de la cartera. Elegí un cliente para ver su ficha."
            )}
          </p>
        </div>
        <SelectorCuenta fichas={alfabetico} resumenes={resumenes} seleccion={seleccion} onSeleccionar={seleccionar} />
      </div>
      <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
        <strong>Datos comerciales de ejemplo</strong> hasta conectar el sistema de gestión: los clientes son los reales, pero saldos, pedidos y
        facturas son de prueba. Lo que registres acá (partes, pagos, pedidos y cotizaciones) sí se guarda.
      </p>

      {!ficha ? <PlantillasMailUsuario plantillas={plantillas} hoy={hoy} /> : null}

      {cuentas.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">Todavía no hay cuentas clave cargadas.</p>
      ) : ficha ? (
        <EspacioCuenta
          ficha={ficha}
          plantillas={plantillas}
          resumen={resumenes.get(ficha.codigo)!}
          hoy={hoy}
          pestana={pestana}
          guardando={guardando}
          onPestana={setPestana}
          onAccion={setAccion}
          onCambiarEstado={cambiarEstado}
          onPrepararMail={(contexto) => setCorreo({ ficha, contexto })}
        />
      ) : (
        <ResumenCartera
          fichas={cuentas}
          resumenes={resumenes}
          busqueda={busqueda}
          filtro={filtro}
          onBuscar={setBusqueda}
          onFiltrar={setFiltro}
          onSeleccionar={seleccionar}
        />
      )}

      {formulario && accion ? (
        accion.tipo === "rechazo" ? <FormRechazo key={accion.cotizacion.id} cotizacion={accion.cotizacion} {...formulario} />
        : accion.tipo === "parte" ? <FormParte key={formulario.ficha.codigo} {...formulario} />
        : accion.tipo === "pago" ? <FormPago key={formulario.ficha.codigo} {...formulario} />
        : accion.tipo === "perfil" ? <FormPerfil key={formulario.ficha.codigo} {...formulario} />
        : <FormDocumento key={`${formulario.ficha.codigo}-${accion.tipo}`} tipo={accion.tipo} plantillas={plantillas} {...formulario} />
      ) : null}

      {correo ? (
        <Modal abierto ancho="xl" titulo={`Mail del ${correo.contexto.pedido ? "pedido" : "presupuesto"} · ${correo.ficha.nombre}`} onCerrar={() => setCorreo(null)} acciones={<Button variante="secundario" onClick={() => setCorreo(null)}>Cerrar</Button>}>
          <MailDocumentoUsuario ficha={correo.ficha} hoy={hoy} plantilla={plantillas.usuario_respuesta_cotizacion} contexto={correo.contexto} />
        </Modal>
      ) : null}
    </div>
  );
}
