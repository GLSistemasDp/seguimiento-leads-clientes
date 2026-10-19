"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";
import { CLASIFICACIONES_CALIDAD, type AccionCorrectiva, type Calidad } from "@/types/reclamo";

const campo =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

/** Pares "N°" + "Responsable" del cierre, como en el formulario. */
const COMPROBANTES = [
  ["Nota de crédito N°", "Responsable de nota de crédito"],
  ["Nota de débito N°", "Responsable de nota de débito"],
  ["Nueva factura N°", "Responsable de nueva factura"],
  ["N° de ajuste", "Responsable de ajuste"],
] as const;

type Fila = AccionCorrectiva & { clave: string };

function SiNo({
  nombre,
  valor,
  onCambio,
}: {
  nombre: string;
  valor: boolean | null;
  onCambio: (valor: boolean | null) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {([true, false] as const).map((opcion) => (
        <button
          key={String(opcion)}
          type="button"
          aria-pressed={valor === opcion}
          aria-label={`${nombre}: ${opcion ? "Sí" : "No"}`}
          onClick={() => onCambio(valor === opcion ? null : opcion)}
          className={`rounded-lg border px-4 py-1.5 text-sm font-medium ${
            valor === opcion
              ? opcion
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-red-600 bg-red-600 text-white"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          {opcion ? "Sí" : "No"}
        </button>
      ))}
    </div>
  );
}

/** Pagina 2 del FOR-03: lo completa el Asegurador de Calidad y cierra el reclamo. */
export function FormularioCalidad({
  id,
  calidad: inicialCalidad,
  cierre: inicialCierre,
}: {
  id: string;
  calidad: Calidad;
  cierre: Record<string, string | null>;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  const [clasificacion, setClasificacion] = useState(inicialCalidad.clasificacion ?? "");
  const [causa, setCausa] = useState(inicialCalidad.causa ?? "");
  const [procedente, setProcedente] = useState<boolean | null>(inicialCalidad.procedente);
  const [acciones, setAcciones] = useState<Fila[]>(() =>
    inicialCalidad.acciones.map((accion) => ({ ...accion, clave: crypto.randomUUID() })),
  );
  const [cierre, setCierre] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(inicialCierre).map(([clave, valor]) => [clave, valor ?? ""])),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const preventivas = cierre["Acciones correctivas preventivas iniciadas"];

  function cambiarCierre(clave: string, valor: string) {
    setCierre((previo) => ({ ...previo, [clave]: valor }));
  }

  function cambiarAccion(clave: string, cambios: Partial<AccionCorrectiva>) {
    setAcciones((previo) => previo.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)));
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/reclamos/${encodeURIComponent(id)}/calidad`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calidad: { clasificacion, causa, procedente, acciones },
          cierre,
        }),
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);
      mostrar("Evaluación y cierre guardados.", "exito");
      startTransition(() => router.refresh());
    } catch (causaError) {
      setError(causaError instanceof Error ? causaError.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-[#1b2b5e] px-5 py-2.5 text-white">
        <h2 className="text-sm font-semibold">A completar por Asegurador de Calidad de Industrias De Pascale</h2>
      </div>
      <fieldset disabled={guardando} className="flex flex-col gap-6 p-5">
        <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
          <div>
            <p className="text-sm font-medium text-slate-700">Clasificación del reclamo</p>
            <div className="mt-2 flex flex-col gap-1">
              {CLASIFICACIONES_CALIDAD.map((opcion) => (
                <label key={opcion} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="radio"
                    name={`calidad-${id}`}
                    checked={clasificacion === opcion}
                    onChange={() => setClasificacion(opcion)}
                    className="accent-blue-700"
                  />
                  {opcion}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-slate-700">
              Causa
              <textarea rows={6} maxLength={4000} value={causa} onChange={(e) => setCausa(e.target.value)} className={campo} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-700">El reclamo es procedente</span>
              <SiNo nombre="Procedente" valor={procedente} onCambio={setProcedente} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Desarrollo de acciones correctivas</h3>
          <div className="mt-2 flex flex-col gap-2">
            {acciones.length === 0 ? <p className="text-sm text-slate-500">Sin acciones registradas.</p> : null}
            {acciones.map((fila, indice) => (
              <div
                key={fila.clave}
                className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 md:grid-cols-[9rem_2fr_1fr_6rem_1fr_2.5rem]"
              >
                <input type="date" aria-label={`Fecha de la acción ${indice + 1}`} value={fila.fecha} onChange={(e) => cambiarAccion(fila.clave, { fecha: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input aria-label={`Acción ${indice + 1}`} placeholder="Acción" maxLength={500} value={fila.accion} onChange={(e) => cambiarAccion(fila.clave, { accion: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input aria-label={`Responsable de la acción ${indice + 1}`} placeholder="Responsable" maxLength={120} value={fila.responsable} onChange={(e) => cambiarAccion(fila.clave, { responsable: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input aria-label={`Tiempo de la acción ${indice + 1}`} placeholder="Tiempo" maxLength={60} value={fila.tiempo} onChange={(e) => cambiarAccion(fila.clave, { tiempo: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input aria-label={`Resultado de la acción ${indice + 1}`} placeholder="Resultado" maxLength={300} value={fila.resultado} onChange={(e) => cambiarAccion(fila.clave, { resultado: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <button
                  type="button"
                  aria-label={`Quitar la acción ${indice + 1}`}
                  onClick={() => setAcciones(acciones.filter((otra) => otra.clave !== fila.clave))}
                  className="flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <Icono nombre="cerrar" className="size-4" />
                </button>
              </div>
            ))}
            <div>
              <Button
                variante="secundario"
                tamano="sm"
                disabled={acciones.length >= 20}
                onClick={() =>
                  setAcciones([
                    ...acciones,
                    { clave: crypto.randomUUID(), fecha: "", accion: "", responsable: "", tiempo: "", resultado: "" },
                  ])
                }
              >
                + Agregar acción
              </Button>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Cierre del reclamo</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-slate-700">
              Fecha de devolución
              <input type="date" value={cierre["Fecha de devolución"] ?? ""} onChange={(e) => cambiarCierre("Fecha de devolución", e.target.value)} className={campo} />
            </label>
            {(["Devolución recepcionada por", "Conforme a la devolución por"] as const).map((clave) => (
              <label key={clave} className="text-sm text-slate-700">
                {clave}
                <input maxLength={200} value={cierre[clave] ?? ""} onChange={(e) => cambiarCierre(clave, e.target.value)} className={campo} />
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {COMPROBANTES.map(([numero, responsable]) => (
              <div key={numero} className="grid grid-cols-2 gap-2">
                <label className="text-sm text-slate-700">
                  {numero}
                  <input maxLength={60} value={cierre[numero] ?? ""} onChange={(e) => cambiarCierre(numero, e.target.value)} className={campo} />
                </label>
                <label className="text-sm text-slate-700">
                  Responsable
                  <input maxLength={120} value={cierre[responsable] ?? ""} onChange={(e) => cambiarCierre(responsable, e.target.value)} className={campo} />
                </label>
              </div>
            ))}
            <label className="text-sm text-slate-700">
              N° de transferencia
              <input maxLength={60} value={cierre["N° de transferencia"] ?? ""} onChange={(e) => cambiarCierre("N° de transferencia", e.target.value)} className={campo} />
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-700">Acciones correctivas preventivas iniciadas</span>
                <SiNo
                  nombre="Acciones preventivas"
                  valor={preventivas === "Sí" ? true : preventivas === "No" ? false : null}
                  onCambio={(valor) =>
                    cambiarCierre("Acciones correctivas preventivas iniciadas", valor === null ? "" : valor ? "Sí" : "No")
                  }
                />
              </div>
              <label className="text-sm text-slate-700">
                Número de pedido de acción
                <input maxLength={60} value={cierre["Número de pedido de acción"] ?? ""} onChange={(e) => cambiarCierre("Número de pedido de acción", e.target.value)} className={campo} />
              </label>
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-sm text-slate-700">
                Respuesta al cliente
                <textarea rows={3} maxLength={1000} value={cierre["Respuesta al cliente"] ?? ""} onChange={(e) => cambiarCierre("Respuesta al cliente", e.target.value)} className={campo} />
              </label>
              <label className="text-sm text-slate-700">
                Contacto con
                <input maxLength={200} value={cierre["Contacto con"] ?? ""} onChange={(e) => cambiarCierre("Contacto con", e.target.value)} className={campo} />
              </label>
            </div>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-5 py-3">
        {error ? (
          <p role="alert" className="mr-auto text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="mr-auto text-xs text-slate-500">
            Con la &quot;Respuesta al cliente&quot; completa, el reclamo pasa a respondido en el panel.
          </p>
        )}
        <Button type="submit" disabled={guardando}>
          <Icono nombre="check" className="size-4" />
          {guardando ? "Guardando…" : "Guardar evaluación y cierre"}
        </Button>
      </div>
    </form>
  );
}
