"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { PRODUCTOS_DEMO } from "@/lib/reclamos/catalogo";
import { validarIndicacion } from "@/lib/reclamos/validacion";
import { ACCIONES, DETALLE_ACCIONES, type AccionReclamo, type Indicacion } from "@/types/reclamo";

const campo =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

type Fila = { clave: string; producto: string; observacion: string };

function filaVacia(): Fila {
  return { clave: crypto.randomUUID(), producto: "", observacion: "" };
}

/**
 * Lo que decide el gerente sobre un reclamo: la accion para el vendedor y,
 * si es un sustituto, que producto ofrecer. Se usa en el panel (dentro de un
 * modal) y en el detalle del formulario FOR-03.
 */
export function FormularioIndicacion({
  reclamoId,
  inicial,
  onGuardado,
  onCancelar,
}: {
  reclamoId: string;
  inicial: Indicacion | null;
  onGuardado: (indicacion: Indicacion) => void;
  onCancelar?: () => void;
}) {
  const lista = useId();
  const [accion, setAccion] = useState<AccionReclamo | "">(inicial?.accion ?? "");
  const [filas, setFilas] = useState<Fila[]>(() =>
    inicial?.sustitutos.length
      ? inicial.sustitutos.map((sustituto) => ({ ...sustituto, clave: crypto.randomUUID() }))
      : [filaVacia()],
  );
  const [comentario, setComentario] = useState(inicial?.comentario ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  function cambiarFila(clave: string, cambios: Partial<Fila>) {
    setFilas(filas.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)));
    setError("");
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");
    let datos;
    try {
      datos = validarIndicacion({ accion, sustitutos: filas, comentario });
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "Revisá los datos.");
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/reclamos/${encodeURIComponent(reclamoId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { indicacion?: Indicacion; error?: string };
      if (!respuesta.ok || !cuerpo.indicacion) throw new Error(cuerpo.error ?? "No se pudo guardar la indicación.");
      onGuardado(cuerpo.indicacion);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudo guardar. Intentá nuevamente.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <fieldset disabled={guardando} className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-slate-700">
            Acción para el vendedor <span className="text-red-600">*</span>
          </p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(ACCIONES) as AccionReclamo[]).map((clave) => (
              <label
                key={clave}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  accion === clave
                    ? "border-blue-400 bg-blue-50 text-blue-900"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name={`accion-${reclamoId}`}
                  value={clave}
                  checked={accion === clave}
                  onChange={() => {
                    setAccion(clave);
                    setError("");
                  }}
                  className="accent-blue-700"
                />
                {ACCIONES[clave]}
              </label>
            ))}
          </div>
          {accion ? <p className="mt-2 text-xs text-slate-600">{DETALLE_ACCIONES[accion]}</p> : null}
        </div>

        {accion === "SUSTITUTO" ? (
          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
            <datalist id={lista}>
              {PRODUCTOS_DEMO.map((producto) => (
                <option key={producto.id} value={`${producto.id} · ${producto.nombre}`} />
              ))}
            </datalist>
            {filas.map((fila, indice) => (
              <div key={fila.clave} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1.2fr_1fr_auto]">
                <label className="text-sm font-medium text-slate-700">
                  Producto sustituto {filas.length > 1 ? indice + 1 : ""} <span className="text-red-600">*</span>
                  <input
                    list={lista}
                    required
                    maxLength={200}
                    value={fila.producto}
                    onChange={(evento) => cambiarFila(fila.clave, { producto: evento.target.value })}
                    placeholder="Código o descripción del producto"
                    className={campo}
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Observación
                  <input
                    maxLength={500}
                    value={fila.observacion}
                    onChange={(evento) => cambiarFila(fila.clave, { observacion: evento.target.value })}
                    placeholder="Precio, talle, condiciones…"
                    className={campo}
                  />
                </label>
                <div className="flex items-end">
                  <Button
                    variante="fantasma"
                    tamano="sm"
                    disabled={filas.length === 1}
                    aria-label={`Quitar producto ${indice + 1}`}
                    onClick={() => setFilas(filas.filter((otra) => otra.clave !== fila.clave))}
                  >
                    <Icono nombre="cerrar" className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button variante="secundario" tamano="sm" disabled={filas.length >= 20} onClick={() => setFilas([...filas, filaVacia()])}>
                + Otro producto
              </Button>
            </div>
          </div>
        ) : null}

        <label className="text-sm font-medium text-slate-700">
          Comentario para el vendedor {accion === "OTRA" ? <span className="text-red-600">*</span> : "(opcional)"}
          <textarea
            rows={3}
            maxLength={2000}
            value={comentario}
            onChange={(evento) => {
              setComentario(evento.target.value);
              setError("");
            }}
            placeholder="Plazos, a quién derivar, qué decirle al cliente…"
            className={campo}
          />
        </label>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancelar ? (
          <Button variante="secundario" onClick={onCancelar}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={guardando || !accion}>
          <Icono nombre="check" className="size-3.5" />
          {guardando ? "Guardando…" : "Guardar indicación"}
        </Button>
      </div>
    </form>
  );
}
