"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { ANCHO_EMAIL } from "@/lib/email/templates";
import { VARIABLES, armarMail, variablesDesconocidas } from "@/lib/mailing/plantillas";
import type { Extras } from "@/lib/mailing/plantillas";
import { TIPOS_MAIL } from "@/types/mailing";
import type { Destinatario, PlantillaMailing, TipoMail } from "@/types/mailing";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";
const MAX_IMAGEN = 2 * 1024 * 1024;

/** Formatos del cuerpo: envuelven el texto seleccionado. */
const FORMATOS = [
  { etiqueta: "Negrita", icono: "B", antes: "<strong>", despues: "</strong>" },
  { etiqueta: "Cursiva", icono: "I", antes: "<em>", despues: "</em>" },
  { etiqueta: "Párrafo", icono: "¶", antes: "<p>", despues: "</p>" },
  { etiqueta: "Lista", icono: "•", antes: "<ul>\n<li>", despues: "</li>\n</ul>" },
  { etiqueta: "Enlace", icono: "🔗", antes: '<a href="https://">', despues: "</a>" },
] as const;

type CampoTexto = "asunto" | "cuerpo";

export type EditorPlantillaProps = {
  tipo: TipoMail;
  tipos: readonly TipoMail[];
  onTipo: (tipo: TipoMail) => void;
  plantilla: PlantillaMailing;
  onCambio: (plantilla: PlantillaMailing) => void;
  modificada: boolean;
  /** Distinta de la de fabrica (se puede restaurar). */
  personalizada: boolean;
  guardando: boolean;
  onGuardar: () => void;
  onRestaurar: () => void;
  /** A quien se le muestra la vista previa. */
  destinatario: Destinatario | null;
  posicion: { actual: number; total: number };
  onMover: (paso: -1 | 1) => void;
  extras: Extras;
};

/** Columna derecha: la plantilla del tipo de mail, editable, con vista previa real. */
export function EditorPlantilla({
  tipo,
  tipos,
  onTipo,
  plantilla,
  onCambio,
  modificada,
  personalizada,
  guardando,
  onGuardar,
  onRestaurar,
  destinatario,
  posicion,
  onMover,
  extras,
}: EditorPlantillaProps) {
  const [pestana, setPestana] = useState<"editar" | "vista">("editar");
  const [errorImagen, setErrorImagen] = useState("");
  const asuntoRef = useRef<HTMLInputElement>(null);
  const cuerpoRef = useRef<HTMLTextAreaElement>(null);
  const ultimoCampo = useRef<CampoTexto>("cuerpo");
  const archivoRef = useRef<HTMLInputElement>(null);

  const mail = useMemo(
    () => (destinatario ? armarMail(plantilla, destinatario, extras) : null),
    [plantilla, destinatario, extras],
  );
  const desconocidas = variablesDesconocidas(plantilla, tipo);

  function cambiar<K extends keyof PlantillaMailing>(clave: K, valor: PlantillaMailing[K]) {
    onCambio({ ...plantilla, [clave]: valor });
  }

  /** Inserta (o envuelve la seleccion) en el ultimo campo de texto usado y deja el cursor despues. */
  function insertar(antes: string, despues = "", destino: CampoTexto = ultimoCampo.current) {
    const elemento = destino === "asunto" ? asuntoRef.current : cuerpoRef.current;
    const valor = plantilla[destino];
    const inicio = elemento?.selectionStart ?? valor.length;
    const fin = elemento?.selectionEnd ?? valor.length;
    const nuevo = valor.slice(0, inicio) + antes + valor.slice(inicio, fin) + despues + valor.slice(fin);
    cambiar(destino, nuevo);
    requestAnimationFrame(() => {
      if (!elemento) return;
      elemento.focus();
      const cursor = fin + antes.length + despues.length;
      elemento.setSelectionRange(cursor, cursor);
    });
  }

  function subirImagen(archivo: File | undefined) {
    setErrorImagen("");
    if (!archivo) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(archivo.type)) {
      setErrorImagen("Usá una imagen PNG, JPG, GIF o WEBP.");
      return;
    }
    if (archivo.size > MAX_IMAGEN) {
      setErrorImagen("La imagen pesa más de 2 MB.");
      return;
    }
    const lector = new FileReader();
    lector.onload = () => cambiar("imagen", String(lector.result));
    lector.readAsDataURL(archivo);
  }

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Plantilla del mail</h2>
            <p className="text-xs text-slate-500">
              Viene prearmada según el tipo. Editala y mirá cómo la recibe cada destinatario.
            </p>
          </div>
          <div role="tablist" className="flex rounded-lg bg-slate-100 p-0.5">
            {(["editar", "vista"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={pestana === id}
                onClick={() => setPestana(id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pestana === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {id === "editar" ? "Editar" : "Vista previa"}
              </button>
            ))}
          </div>
        </div>

        {tipos.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {tipos.map((opcion) => (
              <button
                key={opcion}
                type="button"
                aria-pressed={tipo === opcion}
                onClick={() => onTipo(opcion)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  tipo === opcion
                    ? "border-[#1b2b5e] bg-[#1b2b5e] font-medium text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {TIPOS_MAIL[opcion].etiqueta}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {pestana === "editar" ? (
        <div className="flex max-h-[68vh] min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <label className="text-sm font-medium text-slate-700">
            Asunto
            <input
              ref={asuntoRef}
              value={plantilla.asunto}
              maxLength={200}
              onFocus={() => (ultimoCampo.current = "asunto")}
              onChange={(evento) => cambiar("asunto", evento.target.value)}
              className={`${campo} mt-1`}
            />
          </label>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-700">Imagen del encabezado</p>
            <div className="flex flex-wrap items-start gap-3">
              {plantilla.imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={plantilla.imagen} alt={plantilla.imagenAlt} className="h-20 w-40 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 text-center text-xs text-slate-500">
                  Sin imagen: se muestra el título
                </div>
              )}
              <div className="flex min-w-48 flex-1 flex-col gap-2">
                <input
                  value={plantilla.imagen.startsWith("data:") ? "" : plantilla.imagen}
                  onChange={(evento) => cambiar("imagen", evento.target.value)}
                  placeholder={plantilla.imagen.startsWith("data:") ? "Imagen subida desde la PC" : "https://… (URL de la imagen)"}
                  className={campo}
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={archivoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={(evento) => {
                      subirImagen(evento.target.files?.[0]);
                      evento.target.value = "";
                    }}
                  />
                  <Button variante="secundario" tamano="sm" onClick={() => archivoRef.current?.click()}>
                    <Icono nombre="subir" className="size-3.5" />
                    Subir imagen
                  </Button>
                  {plantilla.imagen ? (
                    <Button variante="fantasma" tamano="sm" onClick={() => cambiar("imagen", "")}>
                      Quitar
                    </Button>
                  ) : null}
                </div>
                {errorImagen ? <p className="text-xs text-red-700">{errorImagen}</p> : null}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={plantilla.titulo}
                maxLength={200}
                onChange={(evento) => cambiar("titulo", evento.target.value)}
                placeholder="Título (si no hay imagen)"
                aria-label="Título del encabezado"
                className={campo}
              />
              <input
                value={plantilla.imagenAlt}
                maxLength={200}
                onChange={(evento) => cambiar("imagenAlt", evento.target.value)}
                placeholder="Texto alternativo de la imagen"
                aria-label="Texto alternativo de la imagen"
                className={campo}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Cuerpo</p>
              <div className="flex gap-1">
                {FORMATOS.map((formato) => (
                  <button
                    key={formato.etiqueta}
                    type="button"
                    title={formato.etiqueta}
                    aria-label={formato.etiqueta}
                    onMouseDown={(evento) => evento.preventDefault()}
                    onClick={() => insertar(formato.antes, formato.despues, "cuerpo")}
                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {formato.icono}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={cuerpoRef}
              rows={12}
              value={plantilla.cuerpo}
              onFocus={() => (ultimoCampo.current = "cuerpo")}
              onChange={(evento) => cambiar("cuerpo", evento.target.value)}
              className={`${campo} font-mono text-xs leading-5`}
            />
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Variables · se completan con los datos de cada destinatario
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VARIABLES[tipo].map((variable) => (
                <button
                  key={variable.clave}
                  type="button"
                  title={`Insertar {{${variable.clave}}} en el asunto o el cuerpo`}
                  onMouseDown={(evento) => evento.preventDefault()}
                  onClick={() => insertar(`{{${variable.clave}}}`)}
                  className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-blue-800 hover:bg-blue-50"
                >
                  {variable.etiqueta}
                </button>
              ))}
            </div>
            {desconocidas.length > 0 ? (
              <p className="mt-2 text-xs text-amber-800">
                Este tipo de mail no reconoce: {desconocidas.map((clave) => `{{${clave}}}`).join(", ")}. Quedarían escritas tal cual.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
            <label className="text-sm font-medium text-slate-700">
              Botón (opcional)
              <input
                value={plantilla.botonTexto}
                maxLength={60}
                onChange={(evento) => cambiar("botonTexto", evento.target.value)}
                placeholder="Texto del botón"
                className={`${campo} mt-1`}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Link del botón
              <input
                value={plantilla.botonUrl}
                maxLength={500}
                onChange={(evento) => cambiar("botonUrl", evento.target.value)}
                placeholder="https://…"
                className={`${campo} mt-1`}
              />
            </label>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Pie del mail
            <textarea
              rows={2}
              maxLength={1000}
              value={plantilla.pie}
              onChange={(evento) => cambiar("pie", evento.target.value)}
              className={`${campo} mt-1`}
            />
          </label>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          {destinatario && mail ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <p className="truncate">
                    <span className="text-slate-500">Para:</span>{" "}
                    <span className="font-medium text-slate-900">{destinatario.nombre}</span>{" "}
                    <span className="font-mono text-xs text-blue-700">&lt;{destinatario.email || "sin mail"}&gt;</span>
                  </p>
                  <p className="truncate">
                    <span className="text-slate-500">Asunto:</span> <span className="font-medium">{mail.asunto}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variante="fantasma" tamano="sm" aria-label="Destinatario anterior" disabled={posicion.total < 2} onClick={() => onMover(-1)}>
                    ‹
                  </Button>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {posicion.actual} / {posicion.total}
                  </span>
                  <Button variante="fantasma" tamano="sm" aria-label="Destinatario siguiente" disabled={posicion.total < 2} onClick={() => onMover(1)}>
                    ›
                  </Button>
                </div>
              </div>
              <iframe
                title="Vista previa del mail"
                srcDoc={mail.html}
                sandbox=""
                className="h-[60vh] w-full rounded-lg border border-slate-200 bg-white"
                style={{ minWidth: ANCHO_EMAIL / 2 }}
              />
            </>
          ) : (
            <p className="p-10 text-center text-sm text-slate-500">
              Elegí un destinatario de la lista para ver el mail con sus datos.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        <p className="text-xs text-slate-500">
          {modificada ? "Hay cambios sin guardar." : personalizada ? "Plantilla editada por el equipo." : "Plantilla original."}
        </p>
        <div className="flex gap-2">
          <Button variante="fantasma" tamano="sm" disabled={guardando || (!personalizada && !modificada)} onClick={onRestaurar}>
            <Icono nombre="restablecer" className="size-3.5" />
            Restaurar original
          </Button>
          <Button tamano="sm" disabled={guardando || !modificada} onClick={onGuardar}>
            <Icono nombre="check" className="size-3.5" />
            {guardando ? "Guardando…" : "Guardar plantilla"}
          </Button>
        </div>
      </div>
    </section>
  );
}
