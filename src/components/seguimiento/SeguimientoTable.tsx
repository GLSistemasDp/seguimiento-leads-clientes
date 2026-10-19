"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { FichaCliente } from "@/components/seguimiento/FichaCliente";
import { RecomendacionRespuesta } from "@/components/seguimiento/RecomendacionRespuesta";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { alertasCliente, claveChat, separarCliente } from "@/lib/seguimiento/presentacion";
import type { Prioridad, ResumenChat } from "@/lib/seguimiento/presentacion";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import { formatearDiaCorto, formatearHora } from "@/lib/utils/dates";
import { normalizarEncabezado } from "@/lib/utils/strings";
import { ACCIONES } from "@/types/reclamo";
import type { Indicacion } from "@/types/reclamo";
import { RELACIONES, RESULTADOS } from "@/types/seguimiento";
import type { Consulta, EventoHistorial, Relacion, Resultado } from "@/types/seguimiento";

export type FilaConsulta = Consulta & {
  diasAbierta: number | null;
  prioridad: Prioridad;
  vencida: boolean;
  /** Ultimo cierre registrado desde la app (resultado y relacion). */
  cierre: Pick<EventoHistorial, "resultado" | "relacion" | "fecha"> | null;
  /** Si es un reclamo y la gerencia ya dijo como seguir. */
  indicacion: Indicacion | null;
};

/** Lo que manda la app al finalizar, reabrir o anotar. */
type Cambios = {
  respondida?: boolean;
  observaciones?: string;
  resultado?: Resultado;
  relacion?: Relacion;
};

const ESTILO_RELACION: Record<Relacion, string> = {
  BUENA: "border-emerald-300 bg-emerald-50 text-emerald-800",
  REGULAR: "border-amber-300 bg-amber-50 text-amber-800",
  EN_RIESGO: "border-red-300 bg-red-50 text-red-700",
};

/** Lo secundario (lista, vendedor, fecha, encargado) va dentro de estas columnas, en chico. */
const COLUMNAS = ["Cliente", "Consulta", "Demora", "Seguimiento", "Respondido"] as const;

const PRIORIDADES: Record<Prioridad, { etiqueta: string; estilo: string; borde: string }> = {
  ALTA: { etiqueta: "Alta", estilo: "bg-red-600 text-white", borde: "border-l-red-600" },
  MEDIA: { etiqueta: "Media", estilo: "bg-amber-100 text-amber-800", borde: "border-l-amber-400" },
  BAJA: { etiqueta: "Baja", estilo: "bg-slate-100 text-slate-600", borde: "border-l-slate-300" },
  RESUELTA: { etiqueta: "Resuelta", estilo: "bg-emerald-50 text-emerald-700", borde: "border-l-emerald-300" },
};

/** Colores de los hitos, como en la planilla: el reclamo resalta en rojo. */
function estiloHito(hito: string): string {
  switch (normalizarEncabezado(hito)) {
    case "reclamo":
      return "bg-red-600 font-semibold text-white";
    case "pedido nuevo":
      return "bg-blue-100 text-blue-800";
    case "estado de pedido":
      return "bg-sky-100 text-sky-800";
    case "enviar factura":
    case "estado de cuenta":
    case "informa pago":
      return "bg-violet-100 text-violet-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

/** Situacion de la cuenta, como en la planilla maestra: OK verde, deuda naranja, no responder violeta. */
function estiloEstado(estado: string): string {
  const texto = normalizarEncabezado(estado);
  if (texto === "ok") return "bg-emerald-600 text-white";
  if (texto.includes("deuda")) return "bg-orange-500 text-white";
  if (texto.includes("no responder")) return "bg-violet-100 text-violet-700";
  return "bg-amber-100 text-amber-800";
}

const CLASIFICACIONES: Record<string, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-sky-100 text-sky-800",
  C: "bg-slate-100 text-slate-600",
};

async function guardar(id: string, cambios: Cambios): Promise<string | null> {
  try {
    const respuesta = await fetch(`/api/seguimiento/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    if (respuesta.ok) return null;
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
    return cuerpo?.error ?? `Error ${respuesta.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export type SeguimientoTableProps = {
  consultas: readonly FilaConsulta[];
  /** Muestra un encabezado por chat (cliente + grupo de WhatsApp). */
  agrupado?: boolean;
  chats?: Record<string, ResumenChat>;
  /** Respuestas tipo de la planilla para las sugerencias. */
  catalogo?: readonly RespuestaTipo[];
  /** Aclara donde queda guardado lo que se marca (planilla o archivo local). */
  destino?: string;
};

export function SeguimientoTable({
  consultas,
  agrupado = false,
  chats = {},
  catalogo,
  destino = "la planilla",
}: SeguimientoTableProps) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  /** Cambios optimistas mientras la planilla confirma. */
  const [respondidas, setRespondidas] = useState<Record<string, boolean>>({});
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set());
  const [editando, setEditando] = useState<FilaConsulta | null>(null);
  const [borrador, setBorrador] = useState("");
  /** Consulta que se esta por dar por finalizada (con observacion opcional). */
  const [finalizando, setFinalizando] = useState<FilaConsulta | null>(null);
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState<Resultado | "">("");
  const [relacion, setRelacion] = useState<Relacion | null>(null);
  const [fichaAbierta, setFichaAbierta] = useState<FilaConsulta | null>(null);

  function marcarGuardando(id: string, activo: boolean) {
    setGuardando((previo) => {
      const nuevo = new Set(previo);
      if (activo) nuevo.add(id);
      else nuevo.delete(id);
      return nuevo;
    });
  }

  /** Tildar abre la confirmacion con observacion; destildar vuelve a la cola directo. */
  function pedirCambio(consulta: FilaConsulta) {
    if (respondidas[consulta.id] ?? consulta.respondida) {
      void cambiarRespondida(consulta, false);
      return;
    }
    setNota("");
    setResultado("");
    setRelacion(null);
    setFinalizando(consulta);
  }

  async function cambiarRespondida(consulta: FilaConsulta, valor: boolean, cierre?: Omit<Cambios, "respondida">) {
    setRespondidas((previo) => ({ ...previo, [consulta.id]: valor }));
    marcarGuardando(consulta.id, true);
    const error = await guardar(consulta.id, { respondida: valor, ...cierre });
    marcarGuardando(consulta.id, false);

    if (error) {
      setRespondidas((previo) => {
        const resto = { ...previo };
        delete resto[consulta.id];
        return resto;
      });
      mostrar(`No se pudo actualizar: ${error}`, "error");
      return;
    }
    mostrar(
      valor
        ? `Conversacion con ${separarCliente(consulta.cliente).nombre} finalizada.`
        : `${separarCliente(consulta.cliente).nombre} volvio a la cola.`,
      "exito",
    );
    startTransition(() => router.refresh());
  }

  async function guardarObservaciones() {
    if (!editando) return;
    const consulta = editando;
    setEditando(null);
    marcarGuardando(consulta.id, true);
    const error = await guardar(consulta.id, { observaciones: borrador.trim() });
    marcarGuardando(consulta.id, false);

    if (error) {
      mostrar(`No se pudieron guardar las observaciones: ${error}`, "error");
      return;
    }
    mostrar("Observaciones guardadas.", "exito");
    startTransition(() => router.refresh());
  }

  if (consultas.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-slate-600">No hay consultas que coincidan con el filtro.</p>
        <p className="mt-1 text-xs text-slate-500">
          Si estas en &quot;Sin responder&quot;, la cola esta al dia.
        </p>
      </div>
    );
  }

  return (
    <>
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[24%]" />
          <col />
          <col className="w-20" />
          <col className="w-[22%]" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-blue-50/50 text-left">
            {COLUMNAS.map((columna) => (
              <th
                key={columna}
                className="px-3 py-3 text-xs font-semibold tracking-wide text-slate-600 uppercase first:pl-5 last:pr-4 last:text-center"
              >
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {consultas.map((consulta, indice) => {
            const respondida = respondidas[consulta.id] ?? consulta.respondida;
            const ocupada = guardando.has(consulta.id);
            const { codigo, nombre } = separarCliente(consulta.cliente);
            const prioridad = PRIORIDADES[respondida ? "RESUELTA" : consulta.prioridad];
            const tachado = respondida ? "text-slate-400 line-through" : "";
            const chat = claveChat(consulta);
            const nuevoChat = agrupado && (indice === 0 || chat !== claveChat(consultas[indice - 1]));
            const resumen = chats[chat];
            const vendedor = consulta.grupoVendedor.replace(/^FILTRO GRUPO\s*/i, "");
            const alertas = respondida ? [] : alertasCliente(consulta);

            return (
              <Fragment key={consulta.id}>
                {nuevoChat ? (
                  <tr className="border-b border-slate-200 bg-slate-100/80">
                    <td colSpan={COLUMNAS.length} className="px-5 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <Icono nombre="chat" className="size-4 text-emerald-700" />
                        <span className="font-semibold text-slate-900">{nombre}</span>
                        {codigo ? <span className="text-xs text-slate-500">#{codigo}</span> : null}
                        <span className="truncate text-xs text-slate-500">{consulta.grupoWhatsapp || "Sin grupo de WhatsApp"}</span>
                        {resumen ? (
                          <span
                            className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              resumen.sinResponder > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {resumen.sinResponder > 0
                              ? `${resumen.sinResponder} sin responder de ${resumen.total}`
                              : `${resumen.total} respondida${resumen.total === 1 ? "" : "s"}`}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
                <tr
                  className={`border-b border-slate-100 align-top last:border-0 ${
                    respondida ? "bg-slate-50" : "hover:bg-blue-50/30"
                  }`}
                >
                  {/* Cliente: lo importante arriba, el resto en gris chico. */}
                  <td className={`border-l-4 py-3 pr-3 pl-4 ${prioridad.borde}`}>
                    <button
                      type="button"
                      onClick={() => setFichaAbierta(consulta)}
                      title="Ver ficha e historial del cliente"
                      className="group -m-1 flex max-w-full flex-col items-start rounded-md p-1 text-left hover:bg-blue-50"
                    >
                      <span
                        className={`line-clamp-2 text-sm font-semibold group-hover:text-blue-800 ${
                          respondida ? tachado : "text-slate-900"
                        }`}
                      >
                        {nombre}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        {codigo ? <span>#{codigo}</span> : null}
                        {consulta.clasificacion ? (
                          <span
                            className={`rounded px-1.5 font-semibold ${
                              CLASIFICACIONES[consulta.clasificacion.toUpperCase()] ?? "bg-slate-100 text-slate-600"
                            }`}
                            title="Clasificacion de venta"
                          >
                            {consulta.clasificacion}
                          </span>
                        ) : null}
                        {consulta.listaPrecio ? <span title="Lista de precio">{consulta.listaPrecio}</span> : null}
                        <Icono nombre="ojo" className="size-3.5 text-slate-400 group-hover:text-blue-700" />
                      </span>
                    </button>
                    {vendedor ? (
                      <p className="mt-1 truncate text-xs text-slate-500" title={consulta.grupoWhatsapp}>
                        {vendedor}
                      </p>
                    ) : null}
                    {alertas.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {alertas.map((alerta) => (
                          <span key={alerta} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${estiloEstado(alerta)}`}>
                            {alerta}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>

                  {/* Consulta: hito y prioridad, el mensaje y lo que indico gerencia. */}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {consulta.hito ? (
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs ${
                            respondida ? "bg-slate-100 text-slate-400" : estiloHito(consulta.hito)
                          }`}
                        >
                          {consulta.hito}
                        </span>
                      ) : null}
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${prioridad.estilo}`}>
                        {prioridad.etiqueta}
                      </span>
                    </div>
                    <p
                      title={consulta.consulta}
                      className={`mt-1 line-clamp-3 text-sm ${respondida ? tachado : "text-slate-800"}`}
                    >
                      {consulta.consulta}
                    </p>
                    {consulta.indicacion ? (
                      <p className="mt-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900">
                        <span className="font-semibold">Gerencia:</span> {ACCIONES[consulta.indicacion.accion]}
                        {consulta.indicacion.sustitutos.length > 0
                          ? ` → ${consulta.indicacion.sustitutos.map((sustituto) => sustituto.producto).join(", ")}`
                          : ""}
                        {consulta.indicacion.comentario ? ` · ${consulta.indicacion.comentario}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">
                      {formatearDiaCorto(consulta.fecha)}
                      {formatearHora(consulta.fecha) !== "00:00 hs" ? ` · ${formatearHora(consulta.fecha)}` : ""}
                      {` · ${consulta.encargado || "sin encargado"}`}
                    </p>
                  </td>

                  <td className="px-2 py-3 text-center">
                    {!respondida && consulta.diasAbierta !== null ? (
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                          consulta.vencida ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {consulta.diasAbierta === 0
                          ? "Hoy"
                          : `${consulta.diasAbierta} ${consulta.diasAbierta === 1 ? "dia" : "dias"}`}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>

                  {/* Seguimiento: como quedo / nota y la respuesta sugerida. */}
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={ocupada}
                      onClick={() => {
                        setBorrador(consulta.observaciones);
                        setEditando(consulta);
                      }}
                      className="group flex w-full items-start rounded-md p-1 text-left text-xs text-slate-600 hover:bg-slate-100"
                    >
                      <span className="line-clamp-3 flex-1">
                        {consulta.cierre?.resultado && respondida ? (
                          <span className="mb-1 flex flex-wrap gap-1">
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                              {consulta.cierre.resultado}
                            </span>
                            {consulta.cierre.relacion ? (
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${ESTILO_RELACION[consulta.cierre.relacion]}`}
                              >
                                {RELACIONES[consulta.cierre.relacion]}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        {consulta.observaciones || (
                          <span className="text-slate-400 group-hover:text-blue-700">+ Agregar nota</span>
                        )}
                      </span>
                    </button>
                    <div className="mt-1">
                      <RecomendacionRespuesta consulta={consulta} apagada={respondida} catalogo={catalogo} />
                    </div>
                  </td>

                  <td className="py-3 pr-4 pl-2 text-center">
                    <input
                      type="checkbox"
                      checked={respondida}
                      disabled={ocupada}
                      onChange={() => pedirCambio(consulta)}
                      aria-label={`Finalizar la conversacion con ${nombre}`}
                      title={respondida ? "Finalizada · destildar para volver a la cola" : "Finalizar conversacion"}
                      className="mt-1 size-5 cursor-pointer accent-emerald-600 disabled:cursor-wait"
                    />
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <Modal
        abierto={editando !== null}
        titulo={editando ? `Observaciones · ${separarCliente(editando.cliente).nombre}` : ""}
        onCerrar={() => setEditando(null)}
        acciones={
          <>
            <Button variante="secundario" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void guardarObservaciones()}>
              <Icono nombre="check" className="size-3.5" />
              Guardar en {destino}
            </Button>
          </>
        }
      >
        {editando ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{editando.consulta}</p>
            <Textarea
              label="Observaciones"
              rows={4}
              value={borrador}
              onChange={(evento) => setBorrador(evento.target.value)}
              placeholder="Que se le respondio, a quien se derivo, proximo paso…"
              autoFocus
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        abierto={finalizando !== null}
        titulo={finalizando ? `Finalizar conversacion · ${separarCliente(finalizando.cliente).nombre}` : ""}
        onCerrar={() => setFinalizando(null)}
        acciones={
          <>
            <Button variante="secundario" onClick={() => setFinalizando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!resultado}
              title={resultado ? undefined : "Elegí cómo quedó la conversación"}
              onClick={() => {
                const consulta = finalizando;
                if (!consulta || !resultado) return;
                setFinalizando(null);
                void cambiarRespondida(consulta, true, {
                  resultado,
                  relacion: relacion ?? undefined,
                  observaciones: nota.trim(),
                });
              }}
            >
              <Icono nombre="check" className="size-3.5" />
              Finalizar conversacion
            </Button>
          </>
        }
      >
        {finalizando ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {finalizando.hito || "Consulta"} · {formatearDiaCorto(finalizando.fecha)}
              </p>
              <p className="mt-1 text-sm text-slate-800">{finalizando.consulta}</p>
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">
                ¿Cómo quedó? <span className="text-red-600">*</span>
              </legend>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {RESULTADOS.map((opcion) => (
                  <label
                    key={opcion}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      resultado === opcion
                        ? "border-blue-400 bg-blue-50 text-blue-900"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="resultado"
                      value={opcion}
                      checked={resultado === opcion}
                      onChange={() => setResultado(opcion)}
                      className="accent-blue-700"
                    />
                    {opcion}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Relación con el cliente (opcional)</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(RELACIONES) as Relacion[]).map((clave) => (
                  <button
                    key={clave}
                    type="button"
                    aria-pressed={relacion === clave}
                    onClick={() => setRelacion(relacion === clave ? null : clave)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      relacion === clave ? ESTILO_RELACION[clave] : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {RELACIONES[clave]}
                  </button>
                ))}
              </div>
            </fieldset>
            <Textarea
              label="Observación (opcional)"
              rows={3}
              value={nota}
              onChange={(evento) => setNota(evento.target.value)}
              placeholder="Qué se le respondió, a quién se derivó, próximo paso…"
            />
            <p className="text-xs text-slate-500">
              Se tilda RESPUESTA; el resultado y la observación quedan en {destino} y en el historial del
              cliente. Si fue un error, destildá la casilla y la consulta vuelve a la cola.
            </p>
          </div>
        ) : null}
      </Modal>

      <FichaCliente
        consulta={fichaAbierta}
        resumen={fichaAbierta ? chats[claveChat(fichaAbierta)] : undefined}
        onCerrar={() => setFichaAbierta(null)}
      />
    </>
  );
}
