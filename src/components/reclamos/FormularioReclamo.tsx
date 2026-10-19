"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";
import { ADJUNTOS, validarNuevoReclamo } from "@/lib/reclamos/formulario";
import { CLASIFICACIONES, MAX_PRODUCTOS, type NuevoReclamo } from "@/types/reclamo";

const campo =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";

type FilaProducto = { clave: string; codigo: string; descripcion: string; cantidadFacturada: string; cantidadReclamo: string };

function filaVacia(): FilaProducto {
  return { clave: crypto.randomUUID(), codigo: "", descripcion: "", cantidadFacturada: "", cantidadReclamo: "" };
}

/** Bloque con la barra azul de titulo, como en el FOR-03. */
function Bloque({ titulo, aclaracion, children }: { titulo: string; aclaracion?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-[#1b2b5e] px-5 py-2.5 text-white">
        <h2 className="text-sm font-semibold">{titulo}</h2>
      </div>
      <div className="flex flex-col gap-4 p-5">
        {aclaracion ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{aclaracion}</p> : null}
        {children}
      </div>
    </section>
  );
}

function Campo({
  etiqueta,
  obligatorio,
  children,
  className = "",
}: {
  etiqueta: string;
  obligatorio?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`text-sm font-medium text-slate-700 ${className}`}>
      {etiqueta} {obligatorio ? <span className="text-red-600">*</span> : null}
      {children}
    </label>
  );
}

function tamano(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/**
 * Alta del formulario FOR-03 Rev04 "Reclamo de Cliente": la parte que
 * completa el cliente (o el vendedor en su nombre). El numero de reclamo lo
 * asigna la app al guardar.
 */
export function FormularioReclamo({ inicial }: { inicial: Partial<NuevoReclamo> & { fecha: string } }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [datos, setDatos] = useState({
    fecha: inicial.fecha,
    razonSocial: inicial.razonSocial ?? "",
    numeroCliente: inicial.numeroCliente ?? "",
    sucursal: inicial.sucursal ?? "",
    transporte: inicial.transporte ?? "",
    contacto: inicial.contacto ?? "",
    cargo: inicial.cargo ?? "",
    telefono: inicial.telefono ?? "",
    email: inicial.email ?? "",
    ordenCompra: inicial.ordenCompra ?? "",
    pedido: inicial.pedido ?? "",
    factura: inicial.factura ?? "",
    remito: inicial.remito ?? "",
    clasificacion: inicial.clasificacion ?? "",
    detalle: inicial.detalle ?? "",
  });
  const [productos, setProductos] = useState<FilaProducto[]>(() => [filaVacia(), filaVacia(), filaVacia()]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  function cambiar(clave: keyof typeof datos, valor: string) {
    setDatos((previo) => ({ ...previo, [clave]: valor }));
    setError("");
  }

  function cambiarProducto(clave: string, cambios: Partial<FilaProducto>) {
    setProductos((previo) => previo.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)));
    setError("");
  }

  function sumarArchivos(nuevos: FileList | null) {
    if (!nuevos) return;
    const lista = [...archivos, ...Array.from(nuevos)];
    if (lista.length > ADJUNTOS.maximo) {
      setError(`Se admiten hasta ${ADJUNTOS.maximo} adjuntos.`);
      return;
    }
    const invalido = lista.find((archivo) => !(ADJUNTOS.tipos as readonly string[]).includes(archivo.type));
    if (invalido) {
      setError(`${invalido.name}: solo se aceptan PDF o imágenes.`);
      return;
    }
    if (lista.reduce((total, archivo) => total + archivo.size, 0) > ADJUNTOS.bytes) {
      setError("Los adjuntos superan los 4 MB en total.");
      return;
    }
    setArchivos(lista);
    setError("");
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    let validado: NuevoReclamo;
    try {
      validado = validarNuevoReclamo({ ...datos, productos, consultaId: inicial.consultaId ?? null });
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "Revisá los datos.");
      return;
    }
    setGuardando(true);
    try {
      const cuerpo = new FormData();
      cuerpo.set("datos", JSON.stringify(validado));
      archivos.forEach((archivo) => cuerpo.append("adjuntos", archivo));
      const respuesta = await fetch("/api/reclamos", { method: "POST", body: cuerpo });
      const resultado = (await respuesta.json().catch(() => ({}))) as { reclamo?: { id: string }; error?: string };
      if (!respuesta.ok || !resultado.reclamo) throw new Error(resultado.error ?? `Error ${respuesta.status}`);
      mostrar(`Reclamo ${resultado.reclamo.id} cargado.`, "exito");
      router.push(`/reclamos/${resultado.reclamo.id}`);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudo guardar el reclamo.");
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5 pb-10">
      <fieldset disabled={guardando} className="flex flex-col gap-5">
        <Bloque titulo="Reclamo de Cliente · FOR-03 Rev04">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="text-sm font-medium text-slate-700">
              Número de reclamo
              <p className="mt-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                Se asigna al guardar
              </p>
            </div>
            <Campo etiqueta="Fecha" obligatorio>
              <input type="date" required value={datos.fecha} onChange={(e) => cambiar("fecha", e.target.value)} className={campo} />
            </Campo>
          </div>
        </Bloque>

        <Bloque
          titulo="A completar por el Cliente"
          aclaracion="IMPORTANTE: adjuntar copia de Remito, Factura, Orden de Compra y Pedido del Cliente pertenecientes al reclamo."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Razón social" obligatorio>
              <input required maxLength={200} value={datos.razonSocial} onChange={(e) => cambiar("razonSocial", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="N° de cliente">
              <input maxLength={40} value={datos.numeroCliente} onChange={(e) => cambiar("numeroCliente", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="Sucursal">
              <input maxLength={120} value={datos.sucursal} onChange={(e) => cambiar("sucursal", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="Transporte">
              <input maxLength={120} value={datos.transporte} onChange={(e) => cambiar("transporte", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="Nombre y apellido" obligatorio>
              <input required maxLength={120} value={datos.contacto} onChange={(e) => cambiar("contacto", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="Cargo">
              <input maxLength={120} value={datos.cargo} onChange={(e) => cambiar("cargo", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="Teléfono">
              <input type="tel" maxLength={60} value={datos.telefono} onChange={(e) => cambiar("telefono", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="E-mail">
              <input type="email" maxLength={200} value={datos.email} onChange={(e) => cambiar("email", e.target.value)} className={campo} />
            </Campo>
          </div>
        </Bloque>

        <Bloque titulo="Clasificación del Problema">
          <div className="grid gap-4 sm:grid-cols-[18rem_1fr]">
            <Campo etiqueta="Clasificación" obligatorio>
              <select required value={datos.clasificacion} onChange={(e) => cambiar("clasificacion", e.target.value)} className={campo}>
                <option value="">Elegir…</option>
                {CLASIFICACIONES.map((clasificacion) => (
                  <option key={clasificacion}>{clasificacion}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Detalle del problema" obligatorio>
              <textarea
                required
                rows={4}
                maxLength={4000}
                value={datos.detalle}
                onChange={(e) => cambiar("detalle", e.target.value)}
                className={campo}
              />
            </Campo>
          </div>
        </Bloque>

        <Bloque titulo="Datos del Producto sobre el cual se realiza el Reclamo">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo etiqueta="N° orden de compra del cliente">
              <input maxLength={60} value={datos.ordenCompra} onChange={(e) => cambiar("ordenCompra", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="N° de factura del reclamo">
              <input maxLength={60} value={datos.factura} onChange={(e) => cambiar("factura", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="N° de pedido">
              <input maxLength={60} value={datos.pedido} onChange={(e) => cambiar("pedido", e.target.value)} className={campo} />
            </Campo>
            <Campo etiqueta="N° de remito">
              <input maxLength={60} value={datos.remito} onChange={(e) => cambiar("remito", e.target.value)} className={campo} />
            </Campo>
          </div>

          <div className="flex flex-col gap-2">
            <div className="hidden grid-cols-[1fr_2fr_7rem_7rem_2.5rem] gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
              <span>Código producto</span>
              <span>Descripción</span>
              <span>Cant. facturada</span>
              <span>Cant. reclamo</span>
              <span />
            </div>
            {productos.map((fila, indice) => (
              <div
                key={fila.clave}
                className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_2fr_7rem_7rem_2.5rem] sm:border-0 sm:p-0"
              >
                <input
                  aria-label={`Código del producto ${indice + 1}`}
                  placeholder="Código"
                  maxLength={60}
                  value={fila.codigo}
                  onChange={(e) => cambiarProducto(fila.clave, { codigo: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  aria-label={`Descripción del producto ${indice + 1}`}
                  placeholder="Descripción"
                  maxLength={200}
                  value={fila.descripcion}
                  onChange={(e) => cambiarProducto(fila.clave, { descripcion: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  aria-label={`Cantidad facturada del producto ${indice + 1}`}
                  placeholder="Facturada"
                  inputMode="decimal"
                  value={fila.cantidadFacturada}
                  onChange={(e) => cambiarProducto(fila.clave, { cantidadFacturada: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  aria-label={`Cantidad reclamada del producto ${indice + 1}`}
                  placeholder="Reclamo"
                  inputMode="decimal"
                  value={fila.cantidadReclamo}
                  onChange={(e) => cambiarProducto(fila.clave, { cantidadReclamo: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  aria-label={`Quitar el producto ${indice + 1}`}
                  disabled={productos.length === 1}
                  onClick={() => setProductos(productos.filter((otra) => otra.clave !== fila.clave))}
                  className="flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                >
                  <Icono nombre="cerrar" className="size-4" />
                </button>
              </div>
            ))}
            <div>
              <Button
                variante="secundario"
                tamano="sm"
                disabled={productos.length >= MAX_PRODUCTOS}
                onClick={() => setProductos([...productos, filaVacia()])}
              >
                + Otro producto ({productos.length} de {MAX_PRODUCTOS})
              </Button>
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Documentación adjunta">
          <div className="flex flex-col gap-3">
            <input
              ref={archivoRef}
              type="file"
              multiple
              accept=".pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                sumarArchivos(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variante="secundario" disabled={archivos.length >= ADJUNTOS.maximo} onClick={() => archivoRef.current?.click()}>
                <Icono nombre="subir" className="size-4" />
                Adjuntar remito, factura, OC o pedido
              </Button>
              <span className="text-xs text-slate-500">PDF o imagen · hasta {ADJUNTOS.maximo} archivos y 4 MB en total</span>
            </div>
            {archivos.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {archivos.map((archivo, indice) => (
                  <li key={`${archivo.name}-${indice}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <Icono nombre="documento" className="size-4 text-blue-700" />
                    <span className="min-w-0 flex-1 truncate">{archivo.name}</span>
                    <span className="text-xs text-slate-500">{tamano(archivo.size)}</span>
                    <button
                      type="button"
                      aria-label={`Quitar ${archivo.name}`}
                      onClick={() => setArchivos(archivos.filter((_, posicion) => posicion !== indice))}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100"
                    >
                      <Icono nombre="cerrar" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Bloque>
      </fieldset>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
        {error ? (
          <p role="alert" className="mr-auto text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="mr-auto text-xs text-slate-500">
            La evaluación de Calidad y el cierre se completan después, en el detalle del reclamo.
          </p>
        )}
        <Button variante="secundario" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando}>
          <Icono nombre="check" className="size-4" />
          {guardando ? "Guardando…" : "Guardar reclamo"}
        </Button>
      </div>
    </form>
  );
}
