"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { campoUsuario } from "@/components/usuarios/Compartidos";
import { MailDocumentoUsuario } from "@/components/usuarios/PlantillasMailUsuario";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { dineroUsuario, facturasConEstado, fechaUsuario, productosHabituales, redondear, sumarDias } from "@/lib/usuarios/analisis";
import { CATALOGO_USUARIOS, productoDelCatalogo } from "@/lib/usuarios/catalogo";
import type { PlantillasUsuarios } from "@/lib/usuarios/plantillas";
import { MEDIOS_PAGO, MOTIVOS_RECHAZO, TIPOS_PARTE } from "@/types/usuarios";
import type { CambioUsuario, CotizacionUsuario, FichaUsuario, ItemNuevo, MedioPago, MotivoRechazo, TipoParte } from "@/types/usuarios";

/**
 * Formularios de carga rapida de una cuenta. Cada uno arma el cambio y lo
 * entrega a `onGuardar`, que lo manda a la API; si sale bien, el modal se
 * cierra. Las reglas se validan otra vez en el servidor.
 */

type PropsFormulario = {
  ficha: FichaUsuario;
  hoy: string;
  guardando: boolean;
  onGuardar: (cambio: CambioUsuario) => void;
  onCerrar: () => void;
};

/** "1.250,5" o "1250.5" -> 1250.5 (NaN si no es un numero). */
function aNumero(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return Number.NaN;
  return Number(limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio);
}

function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-slate-700">
      {etiqueta}
      {children}
      {ayuda ? <span className="text-xs font-normal text-slate-500">{ayuda}</span> : null}
    </label>
  );
}

function Botonera({ guardando, listo, etiqueta, onGuardar, onCerrar }: { guardando: boolean; listo: boolean; etiqueta: string; onGuardar: () => void; onCerrar: () => void }) {
  return (
    <>
      <Button variante="secundario" onClick={onCerrar} disabled={guardando}>
        Cancelar
      </Button>
      <Button onClick={onGuardar} disabled={!listo || guardando}>
        {guardando ? "Guardando…" : etiqueta}
      </Button>
    </>
  );
}

// --- Parte de seguimiento -------------------------------------------------------

export function FormParte({ ficha, hoy, guardando, onGuardar, onCerrar }: PropsFormulario) {
  const [tipo, setTipo] = useState<TipoParte>("LLAMADA");
  const [resumen, setResumen] = useState("");
  const [proximo, setProximo] = useState("");
  const listo = resumen.trim() !== "";
  return (
    <Modal
      abierto
      ancho="lg"
      titulo={`Nuevo parte · ${ficha.fantasia || ficha.nombre}`}
      onCerrar={onCerrar}
      acciones={<Botonera guardando={guardando} listo={listo} etiqueta="Guardar parte" onCerrar={onCerrar} onGuardar={() => onGuardar({ accion: "parte", tipo, resumen: resumen.trim(), proximoContacto: proximo })} />}
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Tipo de contacto</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Tipo de contacto">
            {(Object.keys(TIPOS_PARTE) as TipoParte[]).map((clave) => (
              <button
                key={clave}
                type="button"
                aria-pressed={tipo === clave}
                onClick={() => setTipo(clave)}
                className={`rounded-md px-3 py-1.5 text-sm ${tipo === clave ? "bg-slate-900 font-medium text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {TIPOS_PARTE[clave]}
              </button>
            ))}
          </div>
        </div>
        <Campo etiqueta="Resumen">
          <textarea
            autoFocus
            rows={5}
            maxLength={3000}
            value={resumen}
            onChange={(evento) => setResumen(evento.target.value)}
            placeholder="Con quién se habló, qué se acordó y qué quedó pendiente."
            className={campoUsuario}
          />
        </Campo>
        <div>
          <Campo etiqueta="Próxima fecha de contacto (opcional)">
            <input type="date" min={hoy} value={proximo} onChange={(evento) => setProximo(evento.target.value)} className={`${campoUsuario} sm:w-56`} />
          </Campo>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[3, 7, 15, 30].map((dias) => (
              <button key={dias} type="button" onClick={() => setProximo(sumarDias(hoy, dias))} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200">
                En {dias} días
              </button>
            ))}
            {proximo ? (
              <button type="button" onClick={() => setProximo("")} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
                Sin fecha
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// --- Pago -------------------------------------------------------------------------

export function FormPago({ ficha, hoy, guardando, onGuardar, onCerrar }: PropsFormulario) {
  // Primero lo que vence antes: es lo que se cancela primero.
  const facturas = facturasConEstado(ficha, hoy).filter((factura) => factura.saldo > 0).sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  const [fecha, setFecha] = useState(hoy);
  const [medio, setMedio] = useState<MedioPago>("TRANSFERENCIA");
  const [referencia, setReferencia] = useState("");
  /** Importe aplicado a cada factura (texto del campo). */
  const [aplicado, setAplicado] = useState<Record<string, string>>({});
  /** Importe total escrito a mano; vacio = la suma de lo aplicado. */
  const [importeManual, setImporteManual] = useState("");
  const dinero = (valor: number) => dineroUsuario(valor, ficha.moneda);

  const imputaciones = facturas.flatMap((factura) => {
    const importe = aNumero(aplicado[factura.id] ?? "");
    return Number.isFinite(importe) && importe > 0 ? [{ facturaId: factura.id, importe: redondear(importe), saldo: factura.saldo, numero: factura.numero }] : [];
  });
  const totalAplicado = redondear(imputaciones.reduce((total, imputacion) => total + imputacion.importe, 0));
  const importe = importeManual.trim() ? aNumero(importeManual) : totalAplicado;
  const aCuenta = Number.isFinite(importe) ? redondear(importe - totalAplicado) : 0;
  const excedida = imputaciones.find((imputacion) => imputacion.importe > imputacion.saldo + 0.005);
  const error = !Number.isFinite(importe) || importe <= 0
    ? facturas.length ? "Marcá las facturas que cancela el pago o escribí el importe." : "Escribí el importe del pago."
    : excedida
      ? `Lo aplicado a ${excedida.numero} supera su saldo (${dinero(excedida.saldo)}).`
      : aCuenta < -0.005
        ? "Lo aplicado a las facturas supera el importe del pago."
        : fecha > hoy || !fecha
          ? "La fecha del pago no puede ser futura."
          : null;

  const alternar = (id: string, saldo: number) =>
    setAplicado((previo) => {
      const siguiente = { ...previo };
      if (siguiente[id]) delete siguiente[id];
      else siguiente[id] = String(saldo).replace(".", ",");
      return siguiente;
    });

  return (
    <Modal
      abierto
      ancho="xl"
      titulo={`Registrar pago · ${ficha.fantasia || ficha.nombre}`}
      onCerrar={onCerrar}
      acciones={
        <Botonera
          guardando={guardando}
          listo={!error}
          etiqueta={Number.isFinite(importe) && importe > 0 ? `Registrar ${dinero(importe)}` : "Registrar pago"}
          onCerrar={onCerrar}
          onGuardar={() =>
            onGuardar({
              accion: "pago", fecha, importe: redondear(importe), medio, referencia: referencia.trim(),
              imputaciones: imputaciones.map(({ facturaId, importe: valor }) => ({ facturaId, importe: valor })),
            })
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo etiqueta="Fecha">
            <input type="date" max={hoy} value={fecha} onChange={(evento) => setFecha(evento.target.value)} className={campoUsuario} />
          </Campo>
          <Campo etiqueta="Medio de pago">
            <select value={medio} onChange={(evento) => setMedio(evento.target.value as MedioPago)} className={campoUsuario}>
              {(Object.keys(MEDIOS_PAGO) as MedioPago[]).map((clave) => (
                <option key={clave} value={clave}>{MEDIOS_PAGO[clave]}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Referencia">
            <input value={referencia} maxLength={120} onChange={(evento) => setReferencia(evento.target.value)} placeholder="N° de transferencia, cheque…" className={campoUsuario} />
          </Campo>
          <Campo etiqueta={`Importe (${ficha.moneda})`} ayuda={importeManual.trim() ? undefined : "Suma de lo aplicado"}>
            <input
              inputMode="decimal"
              value={importeManual}
              onChange={(evento) => setImporteManual(evento.target.value)}
              placeholder={totalAplicado ? totalAplicado.toLocaleString("es-AR") : "0,00"}
              className={`${campoUsuario} text-right tabular-nums`}
            />
          </Campo>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700">Facturas que cancela</p>
          {facturas.length === 0 ? (
            <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">No hay facturas con saldo: el pago queda a cuenta.</p>
          ) : (
            <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] tracking-wide text-slate-500 uppercase">
                    <th className="px-3 py-2 font-medium">Factura</th>
                    <th className="px-3 py-2 font-medium">Vencimiento</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    <th className="px-3 py-2 text-right font-medium">A aplicar</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((factura) => (
                    <tr key={factura.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-900">
                          <input type="checkbox" checked={Boolean(aplicado[factura.id])} onChange={() => alternar(factura.id, factura.saldo)} className="size-4 rounded accent-slate-900" />
                          {factura.numero}
                        </label>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {fechaUsuario(factura.vencimiento)}
                        {factura.vencida ? <span className="ml-1.5 text-[11px] font-semibold text-red-700">{factura.diasMora} d de mora</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{dinero(factura.saldo)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          inputMode="decimal"
                          value={aplicado[factura.id] ?? ""}
                          onChange={(evento) => setAplicado((previo) => ({ ...previo, [factura.id]: evento.target.value }))}
                          aria-label={`Importe a aplicar a ${factura.numero}`}
                          placeholder="—"
                          className="w-32 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className={`text-sm ${error ? "text-red-700" : "text-slate-600"}`} role="status">
          {error ??
            `Aplicado a facturas: ${dinero(totalAplicado)}${aCuenta > 0.005 ? ` · queda a cuenta: ${dinero(aCuenta)}` : ""}. Las facturas canceladas pasan a Pagada; las demás, a Parcial.`}
        </p>
      </div>
    </Modal>
  );
}

// --- Pedido y cotizacion -----------------------------------------------------------

type Renglon = { sku: string; cantidad: string; precio: string };
const renglonVacio = (): Renglon => ({ sku: "", cantidad: "", precio: "" });

/** Editor de renglones: producto del catalogo, cantidad y precio (arranca con el de lista). */
function EditorItems({ renglones, moneda, onCambiar }: { renglones: Renglon[]; moneda: FichaUsuario["moneda"]; onCambiar: (renglones: Renglon[]) => void }) {
  const cambiar = (indice: number, cambios: Partial<Renglon>) => onCambiar(renglones.map((renglon, posicion) => (posicion === indice ? { ...renglon, ...cambios } : renglon)));
  const elegidos = new Set(renglones.map((renglon) => renglon.sku));
  return (
    <div className="flex flex-col gap-2">
      {renglones.map((renglon, indice) => {
        const subtotal = aNumero(renglon.cantidad) * aNumero(renglon.precio);
        return (
          <div key={indice} className="grid grid-cols-[minmax(0,1fr)_5.5rem_6rem_2rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem_2rem]">
            <select
              value={renglon.sku}
              onChange={(evento) => cambiar(indice, { sku: evento.target.value, precio: renglon.precio || String(productoDelCatalogo(evento.target.value)?.precioUnitario ?? "").replace(".", ",") })}
              aria-label={`Producto del renglón ${indice + 1}`}
              className={campoUsuario}
            >
              <option value="">Elegir producto…</option>
              {CATALOGO_USUARIOS.map((producto) => (
                <option key={producto.sku} value={producto.sku} disabled={producto.sku !== renglon.sku && elegidos.has(producto.sku)}>
                  {producto.sku} · {producto.descripcion}
                </option>
              ))}
            </select>
            <input inputMode="numeric" value={renglon.cantidad} onChange={(evento) => cambiar(indice, { cantidad: evento.target.value })} placeholder="Cantidad" aria-label={`Cantidad del renglón ${indice + 1}`} className={`${campoUsuario} text-right tabular-nums`} />
            <input inputMode="decimal" value={renglon.precio} onChange={(evento) => cambiar(indice, { precio: evento.target.value })} placeholder="Precio" aria-label={`Precio unitario del renglón ${indice + 1}`} className={`${campoUsuario} text-right tabular-nums`} />
            <span className="hidden text-right text-sm text-slate-600 tabular-nums sm:block">{Number.isFinite(subtotal) && subtotal > 0 ? dineroUsuario(subtotal, moneda) : "—"}</span>
            <button
              type="button"
              onClick={() => onCambiar(renglones.length > 1 ? renglones.filter((_, posicion) => posicion !== indice) : [renglonVacio()])}
              aria-label={`Quitar el renglón ${indice + 1}`}
              className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600"
            >
              <Icono nombre="cerrar" className="size-4" />
            </button>
          </div>
        );
      })}
      <div>
        <button type="button" onClick={() => onCambiar([...renglones, renglonVacio()])} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
          <Icono nombre="mas" className="size-3.5" />
          Agregar producto
        </button>
      </div>
    </div>
  );
}

/** Renglones completos y validos; null si hay alguno a medio cargar. */
function leerRenglones(renglones: Renglon[]): ItemNuevo[] | null {
  const cargados = renglones.filter((renglon) => renglon.sku || renglon.cantidad.trim());
  if (cargados.length === 0) return null;
  const items = cargados.map((renglon) => ({ sku: renglon.sku, cantidad: aNumero(renglon.cantidad), precioUnitario: redondear(aNumero(renglon.precio)) }));
  return items.every((item) => item.sku && Number.isInteger(item.cantidad) && item.cantidad > 0 && item.precioUnitario > 0) ? items : null;
}

export function FormDocumento({ tipo, ficha, plantillas, hoy, guardando, onGuardar, onCerrar }: PropsFormulario & { tipo: "pedido" | "cotizacion"; plantillas: PlantillasUsuarios }) {
  const habituales = productosHabituales(ficha, hoy);
  const [renglones, setRenglones] = useState<Renglon[]>([renglonVacio()]);
  const [ordenCompra, setOrdenCompra] = useState("");
  const [validez, setValidez] = useState(sumarDias(hoy, 30));
  const [enviada, setEnviada] = useState(true);
  const items = leerRenglones(renglones);
  const total = items ? redondear(items.reduce((suma, item) => suma + item.cantidad * item.precioUnitario, 0)) : 0;
  const esPedido = tipo === "pedido";
  const listo = items !== null && (esPedido || validez >= hoy);
  const articulos = items?.flatMap((item) => {
    const producto = productoDelCatalogo(item.sku);
    return producto ? [{ ...producto, ...item }] : [];
  });

  /** Carga rapida: los productos de siempre, con su cantidad y ultimo precio. */
  const cargarHabituales = (soloAusentes: boolean) =>
    setRenglones(
      (soloAusentes ? habituales.ausentes : habituales.habituales).map((producto) => ({
        sku: producto.sku,
        cantidad: String(producto.cantidadPromedio),
        precio: String(producto.ultimoPrecio).replace(".", ","),
      })),
    );

  return (
    <Modal
      abierto
      ancho="xl"
      titulo={`${esPedido ? "Cargar pedido" : "Nueva cotización"} · ${ficha.fantasia || ficha.nombre}`}
      onCerrar={onCerrar}
      acciones={
        <Botonera
          guardando={guardando}
          listo={listo}
          etiqueta={esPedido ? "Cargar pedido" : enviada ? "Guardar como enviada" : "Guardar borrador"}
          onCerrar={onCerrar}
          onGuardar={() => {
            if (!items) return;
            onGuardar(esPedido ? { accion: "pedido", ordenCompra: ordenCompra.trim(), items } : { accion: "cotizacion", validez, estado: enviada ? "ENVIADA" : "BORRADOR", items });
          }}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {esPedido ? (
          <Campo etiqueta="Orden de compra del cliente (opcional)">
            <input value={ordenCompra} maxLength={80} onChange={(evento) => setOrdenCompra(evento.target.value)} placeholder="OC-0000" className={`${campoUsuario} sm:w-64`} />
          </Campo>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <Campo etiqueta="Válida hasta">
              <input type="date" min={hoy} value={validez} onChange={(evento) => setValidez(evento.target.value)} className={`${campoUsuario} sm:w-56`} />
            </Campo>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={enviada} onChange={(evento) => setEnviada(evento.target.checked)} className="size-4 rounded accent-slate-900" />
              Ya se envió al cliente
            </label>
          </div>
        )}

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">Productos</p>
            {habituales.habituales.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => cargarHabituales(false)} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200">
                  Cargar los {habituales.habituales.length} habituales
                </button>
                {habituales.ausentes.length > 0 ? (
                  <button type="button" onClick={() => cargarHabituales(true)} className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900 hover:bg-amber-200">
                    Solo los {habituales.ausentes.length} que faltaron
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
          <EditorItems renglones={renglones} moneda={ficha.moneda} onCambiar={setRenglones} />
        </div>

        <p className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
          <span className="text-slate-500">{items ? `${items.length} ${items.length === 1 ? "producto" : "productos"}` : "Completá producto, cantidad entera y precio en cada renglón."}</span>
          <span className="text-base font-semibold text-slate-900 tabular-nums">Total {dineroUsuario(total, ficha.moneda)}</span>
        </p>
        {esPedido ? <p className="text-xs text-slate-500">El pedido queda como Recibido. La factura se genera en el sistema de gestión, no desde acá.</p> : null}
        {listo && articulos ? (
          <MailDocumentoUsuario
            ficha={ficha}
            hoy={hoy}
            plantilla={plantillas.usuario_respuesta_cotizacion}
            contexto={esPedido
              ? { pedido: { id: "borrador", numero: "[N° PEDIDO]", fecha: hoy, ordenCompra: ordenCompra.trim(), estado: "RECIBIDO", items: articulos } }
              : { cotizacion: { id: "borrador", numero: "[N° COTIZACIÓN]", fecha: hoy, validez, estado: enviada ? "ENVIADA" : "BORRADOR", items: articulos, motivoRechazo: null, observacionRechazo: "" } }}
          />
        ) : <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">Al completar los productos vas a ver acá la plantilla de mail con sus cantidades y precios. Al guardar también se completa el número del documento.</p>}
      </div>
    </Modal>
  );
}

// --- Rechazo de cotizacion ---------------------------------------------------------

export function FormRechazo({ ficha, cotizacion, guardando, onGuardar, onCerrar }: Omit<PropsFormulario, "hoy"> & { cotizacion: CotizacionUsuario }) {
  const [motivo, setMotivo] = useState<MotivoRechazo | "">("");
  const [observacion, setObservacion] = useState("");
  const listo = motivo !== "" && observacion.trim() !== "";
  return (
    <Modal
      abierto
      ancho="lg"
      titulo={`Rechazar ${cotizacion.numero} · ${ficha.fantasia || ficha.nombre}`}
      onCerrar={onCerrar}
      acciones={
        <Botonera
          guardando={guardando}
          listo={listo}
          etiqueta="Marcar como rechazada"
          onCerrar={onCerrar}
          onGuardar={() => motivo && onGuardar({ accion: "estado-cotizacion", cotizacionId: cotizacion.id, estado: "RECHAZADA", motivoRechazo: motivo, observacionRechazo: observacion.trim() })}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">Para rechazar una cotización hay que dejar registrado por qué se perdió: el motivo y las observaciones son obligatorios.</p>
        <div>
          <p className="text-sm font-medium text-slate-700">Motivo de rechazo</p>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Motivo de rechazo">
            {(Object.keys(MOTIVOS_RECHAZO) as MotivoRechazo[]).map((clave) => (
              <button
                key={clave}
                type="button"
                role="radio"
                aria-checked={motivo === clave}
                onClick={() => setMotivo(clave)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${motivo === clave ? "border-red-400 bg-red-50 font-medium text-red-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {MOTIVOS_RECHAZO[clave]}
              </button>
            ))}
          </div>
        </div>
        <Campo etiqueta="Observaciones">
          <textarea rows={4} maxLength={2000} value={observacion} onChange={(evento) => setObservacion(evento.target.value)} placeholder="Qué dijo el cliente, contra quién se perdió, qué se podría mejorar." className={campoUsuario} />
        </Campo>
      </div>
    </Modal>
  );
}

// --- Ficha --------------------------------------------------------------------------

export function FormPerfil({ ficha, guardando, onGuardar, onCerrar }: Omit<PropsFormulario, "hoy">) {
  const [perfil, setPerfil] = useState({
    actividad: ficha.actividad, vendedor: ficha.vendedor, contacto: ficha.contacto, email: ficha.email, telefono: ficha.telefono,
    umbral: String(ficha.umbralSeguimientoDias),
  });
  const cambiar = (campo: keyof typeof perfil) => (evento: { target: { value: string } }) => setPerfil((previo) => ({ ...previo, [campo]: evento.target.value }));
  const umbral = Number(perfil.umbral);
  const listo = perfil.actividad.trim() !== "" && perfil.vendedor.trim() !== "" && Number.isInteger(umbral) && umbral >= 1 && umbral <= 365;
  return (
    <Modal
      abierto
      ancho="lg"
      titulo={`Editar ficha · ${ficha.fantasia || ficha.nombre}`}
      onCerrar={onCerrar}
      acciones={
        <Botonera
          guardando={guardando}
          listo={listo}
          etiqueta="Guardar ficha"
          onCerrar={onCerrar}
          onGuardar={() =>
            onGuardar({
              accion: "perfil",
              perfil: { actividad: perfil.actividad.trim(), vendedor: perfil.vendedor.trim(), contacto: perfil.contacto.trim(), email: perfil.email.trim(), telefono: perfil.telefono.trim(), umbralSeguimientoDias: umbral },
            })
          }
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Ejecutivo asignado"><input value={perfil.vendedor} maxLength={160} onChange={cambiar("vendedor")} className={campoUsuario} /></Campo>
        <Campo etiqueta="Actividad"><input value={perfil.actividad} maxLength={120} onChange={cambiar("actividad")} className={campoUsuario} /></Campo>
        <Campo etiqueta="Contacto principal (Compras)"><input value={perfil.contacto} maxLength={160} onChange={cambiar("contacto")} className={campoUsuario} /></Campo>
        <Campo etiqueta="Teléfono"><input value={perfil.telefono} maxLength={80} onChange={cambiar("telefono")} className={campoUsuario} /></Campo>
        <Campo etiqueta="Email" ayuda="Es el que usa el módulo de mailing."><input type="email" value={perfil.email} onChange={cambiar("email")} className={campoUsuario} /></Campo>
        <Campo etiqueta="Alerta de inactividad (días)" ayuda="Días sin partes ni pedidos antes de marcar “Requiere seguimiento”.">
          <input inputMode="numeric" value={perfil.umbral} onChange={cambiar("umbral")} className={`${campoUsuario} sm:w-32`} />
        </Campo>
      </div>
    </Modal>
  );
}
