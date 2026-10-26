"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { BotonGrupoWhatsapp } from "@/components/seguimiento/BotonGrupoWhatsapp";
import { FichaCliente } from "@/components/seguimiento/FichaCliente";
import { RecomendacionRespuesta } from "@/components/seguimiento/RecomendacionRespuesta";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { claveChat, estadoCliente, rutaPerfil, separarCliente } from "@/lib/seguimiento/presentacion";
import type { Prioridad, ResumenChat } from "@/lib/seguimiento/presentacion";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import { formatearDiaCorto, formatearHora } from "@/lib/utils/dates";
import { normalizarEncabezado } from "@/lib/utils/strings";
import { ACCIONES } from "@/types/reclamo";
import type { Indicacion } from "@/types/reclamo";
import { ICONO_RELACION, RELACIONES, RESULTADOS } from "@/types/seguimiento";
import type { Consulta, EventoHistorial, Relacion, Resultado } from "@/types/seguimiento";

export type FilaConsulta = Consulta & {
  diasAbierta: number | null;
  prioridad: Prioridad;
  vencida: boolean;
  /** Ultimo cierre registrado desde la app (resultado y relacion). */
  cierre: Pick<EventoHistorial, "resultado" | "relacion" | "fecha"> | null;
  /** Si es un reclamo y la gerencia ya dijo como seguir. */
  indicacion: Indicacion | null;
  /** Relacion vigente y de donde sale (cierre, IA o reglas). */
  relacion: { relacion: Relacion; origen: "cierre" | "ia" | "reglas" };
  /** Ultimo cierre registrado con este cliente (cualquier consulta). */
  ultimaGestion: EventoHistorial | null;
};

const ORIGEN_RELACION = { cierre: "al cerrar", ia: "sugerida por IA", reglas: "según el mensaje" } as const;

/** Lo que manda la app al finalizar, reabrir o anotar. */
type Cambios = {
  respondida?: boolean;
  observaciones?: string;
  resultado?: Resultado;
  relacion?: Relacion;
};

const ESTILO_RELACION: Record<Relacion, string> = {
  BUENA: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REGULAR: "border-amber-200 bg-amber-50 text-amber-800",
  EN_RIESGO: "border-red-200 bg-red-50 text-red-700",
};

/** Etiqueta suave (fondo claro, borde fino), como los estados de la lista. */
const ETIQUETA = "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset";

const ESTILO_RELACION_BADGE: Record<Relacion, string> = {
  BUENA: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REGULAR: "bg-amber-50 text-amber-800 ring-amber-200",
  EN_RIESGO: "bg-red-50 text-red-700 ring-red-200",
};

/** Badge de la relacion: semaforo + texto, nunca solo color. */
function BadgeRelacion({ relacion }: { relacion: Relacion }) {
  return (
    <span className={`${ETIQUETA} gap-1 ${ESTILO_RELACION_BADGE[relacion]}`}>
      <span aria-hidden="true">{ICONO_RELACION[relacion]}</span>
      {RELACIONES[relacion]}
    </span>
  );
}

/** Lo secundario (lista, vendedor, fecha, encargado) va dentro de estas columnas, en chico. */
const COLUMNAS = ["Cliente", "Consulta", "Demora", "Relación · última gestión", "Respondido"] as const;

const PRIORIDADES: Record<Prioridad, { etiqueta: string; estilo: string; punto: string }> = {
  ALTA: { etiqueta: "Alta", estilo: "bg-red-50 text-red-700 ring-red-200", punto: "bg-red-500" },
  MEDIA: { etiqueta: "Media", estilo: "bg-amber-50 text-amber-800 ring-amber-200", punto: "bg-amber-500" },
  BAJA: { etiqueta: "Baja", estilo: "bg-slate-50 text-slate-600 ring-slate-200", punto: "bg-slate-400" },
  RESUELTA: { etiqueta: "Resuelta", estilo: "bg-emerald-50 text-emerald-700 ring-emerald-200", punto: "bg-emerald-500" },
};

/** Colores de los hitos: el reclamo resalta, el resto en tonos suaves. */
function estiloHito(hito: string): string {
  switch (normalizarEncabezado(hito)) {
    case "reclamo":
      return "bg-red-50 text-red-700 ring-red-200";
    case "pedido nuevo":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "estado de pedido":
      return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "enviar factura":
    case "estado de cuenta":
    case "informa pago":
      return "bg-violet-50 text-violet-700 ring-violet-200";
    default:
      return "bg-slate-50 text-slate-600 ring-slate-200";
  }
}

/** Situacion de la cuenta: OK verde, deuda amarilla, judicializado rojo, no responder gris. */
function estiloEstado(estado: string): string {
  const texto = normalizarEncabezado(estado);
  if (texto === "ok") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (texto.includes("judicial")) return "bg-red-50 text-red-700 ring-red-200";
  if (texto.includes("deud")) return "bg-amber-50 text-amber-800 ring-amber-200";
  if (texto.includes("no responder")) return "bg-slate-100 text-slate-500 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

const CLASIFICACIONES: Record<string, string> = {
  A: "bg-slate-900 text-white ring-slate-900",
  B: "bg-slate-100 text-slate-700 ring-slate-200",
  C: "bg-white text-slate-500 ring-slate-200",
};

/** "BULONERIA BELGRANO" -> "BB", para el circulo del cliente. */
function iniciales(nombre: string): string {
  const palabras = nombre.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return ((palabras[0]?.[0] ?? "") + (palabras[1]?.[0] ?? "")).toUpperCase() || "?";
}

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
  /** En "pendientes" la fila finalizada se va de la tabla con una transicion. */
  vista?: "pendientes" | "respondidas" | "todas";
};

export function SeguimientoTable({
  consultas,
  agrupado = false,
  chats = {},
  catalogo,
  vista = "pendientes",
}: SeguimientoTableProps) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  /** Cambios optimistas mientras la planilla confirma. */
  const [respondidas, setRespondidas] = useState<Record<string, boolean>>({});
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set());
  /** Filas finalizadas que se estan yendo (fade-out) y las que ya se fueron. */
  const [saliendo, setSaliendo] = useState<ReadonlySet<string>>(new Set());
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(new Set());
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
    // Pre-cargada con lo que sugirio el clasificador (IA o reglas); se puede cambiar.
    setRelacion(consulta.relacion.relacion);
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
        ? `Conversacion con ${separarCliente(consulta.cliente).nombre} finalizada: pasó a su historial.`
        : `${separarCliente(consulta.cliente).nombre} volvio a la cola.`,
      "exito",
    );
    if (valor && vista === "pendientes") {
      // Inbox zero: la fila se desvanece y se va antes de recargar la lista.
      setSaliendo((previo) => new Set(previo).add(consulta.id));
      setTimeout(() => {
        setOcultas((previo) => new Set(previo).add(consulta.id));
        startTransition(() => router.refresh());
      }, 350);
      return;
    }
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
          <tr className="border-b border-slate-100 text-left">
            {COLUMNAS.map((columna) => (
              <th
                key={columna}
                className="px-3 py-3 text-[11px] font-medium tracking-wider text-slate-400 uppercase first:pl-5 last:pr-4 last:text-center"
              >
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {consultas.map((consulta, indice) => {
            if (ocultas.has(consulta.id)) return null;
            const respondida = respondidas[consulta.id] ?? consulta.respondida;
            const ocupada = guardando.has(consulta.id);
            const { codigo, nombre } = separarCliente(consulta.cliente);
            const prioridad = PRIORIDADES[respondida ? "RESUELTA" : consulta.prioridad];
            const tachado = respondida ? "text-slate-400 line-through" : "";
            const chat = claveChat(consulta);
            const nuevoChat = agrupado && (indice === 0 || chat !== claveChat(consultas[indice - 1]));
            const resumen = chats[chat];
            const vendedor = consulta.grupoVendedor.replace(/^FILTRO GRUPO\s*/i, "");
            const estados = estadoCliente(consulta);

            return (
              <Fragment key={consulta.id}>
                {nuevoChat ? (
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <td colSpan={COLUMNAS.length} className="px-5 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <Icono nombre="chat" className="size-4 text-slate-500" />
                        <span className="font-semibold text-slate-900">{nombre}</span>
                        {codigo ? <span className="text-xs text-slate-500">#{codigo}</span> : null}
                        <span className="truncate text-xs text-slate-500">{consulta.grupoWhatsapp || "Sin grupo de WhatsApp"}</span>
                        {resumen ? (
                          <span
                            className={`ml-auto ${ETIQUETA} ${
                              resumen.sinResponder > 0 ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
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
                  className={`border-b border-slate-100 align-top transition-opacity duration-300 last:border-0 ${
                    respondida ? "bg-slate-50/60" : "hover:bg-slate-50"
                  } ${saliendo.has(consulta.id) ? "pointer-events-none opacity-0" : "opacity-100"}`}
                >
                  {/* Cliente: circulo con iniciales, nombre y el resto en gris chico. */}
                  <td className="py-3 pr-3 pl-5">
                    <button
                      type="button"
                      onClick={() => setFichaAbierta(consulta)}
                      title="Ver ficha e historial del cliente"
                      className="group -m-1 flex max-w-full items-start gap-2.5 rounded-md p-1 text-left hover:bg-slate-100/70"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-500"
                      >
                        {iniciales(nombre)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span
                          className={`line-clamp-2 text-sm font-medium ${
                            respondida ? tachado : "text-slate-800 group-hover:text-slate-950"
                          }`}
                        >
                          {nombre}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                          {codigo ? <span>#{codigo}</span> : null}
                          {consulta.clasificacion ? (
                            <span
                              className={`rounded px-1.5 text-[11px] font-semibold ring-1 ring-inset ${
                                CLASIFICACIONES[consulta.clasificacion.toUpperCase()] ?? "bg-white text-slate-500 ring-slate-200"
                              }`}
                              title="Clasificacion de venta"
                            >
                              {consulta.clasificacion}
                            </span>
                          ) : null}
                          {consulta.listaPrecio ? <span title="Lista de precio">{consulta.listaPrecio}</span> : null}
                          <Icono nombre="ojo" className="size-3.5 text-slate-300 group-hover:text-slate-600" />
                        </span>
                      </span>
                    </button>
                    <div className="mt-1 pl-[2.375rem]">
                      {vendedor ? <p className="truncate text-xs text-slate-400">{vendedor}</p> : null}
                      {estados.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1" title="Estado de cuenta">
                          {estados.map((estado) => (
                            <span key={estado} className={`${ETIQUETA} ${estiloEstado(estado)}`}>
                              {estado}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <BotonGrupoWhatsapp grupo={consulta.grupoWhatsapp} link={consulta.linkWhatsapp} />
                        <Link
                          href={rutaPerfil(consulta.cliente)}
                          className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                        >
                          Perfil e historial →
                        </Link>
                      </div>
                    </div>
                  </td>

                  {/* Consulta: hito y prioridad, el mensaje y lo que indico gerencia. */}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {consulta.hito ? (
                        <span className={`${ETIQUETA} ${respondida ? "bg-slate-50 text-slate-400 ring-slate-200" : estiloHito(consulta.hito)}`}>
                          {consulta.hito}
                        </span>
                      ) : null}
                      <span className={`${ETIQUETA} gap-1 ${prioridad.estilo}`}>
                        <span className={`size-1.5 rounded-full ${prioridad.punto}`} aria-hidden="true" />
                        {prioridad.etiqueta}
                      </span>
                    </div>
                    <p
                      title={consulta.consulta}
                      className={`mt-1 line-clamp-3 text-sm ${respondida ? tachado : "text-slate-700"}`}
                    >
                      {consulta.consulta}
                    </p>
                    {consulta.indicacion ? (
                      <p className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                        <span className="font-semibold">Gerencia:</span> {ACCIONES[consulta.indicacion.accion]}
                        {consulta.indicacion.sustitutos.length > 0
                          ? ` → ${consulta.indicacion.sustitutos.map((sustituto) => sustituto.producto).join(", ")}`
                          : ""}
                        {consulta.indicacion.comentario ? ` · ${consulta.indicacion.comentario}` : ""}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-xs text-slate-400">
                        {formatearDiaCorto(consulta.fecha)}
                        {formatearHora(consulta.fecha) !== "00:00 hs" ? ` · ${formatearHora(consulta.fecha)}` : ""}
                        {consulta.encargado && consulta.encargado.toLowerCase() !== "bot" ? ` · ${consulta.encargado}` : ""}
                      </p>
                      <RecomendacionRespuesta consulta={consulta} apagada={respondida} catalogo={catalogo} />
                    </div>
                  </td>

                  <td className="px-2 py-3 text-center">
                    {!respondida && consulta.diasAbierta !== null ? (
                      <span
                        className={`${ETIQUETA} tabular-nums ${
                          consulta.vencida ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-600 ring-slate-200"
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

                  {/* Relacion vigente (semaforo) y la ultima gestion con el cliente, en texto. */}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <BadgeRelacion relacion={consulta.relacion.relacion} />
                      <span className="text-[11px] text-slate-400">{ORIGEN_RELACION[consulta.relacion.origen]}</span>
                    </div>
                    {consulta.ultimaGestion?.resultado ? (
                      <p className="mt-1.5 text-xs text-slate-600">
                        <span className="text-slate-400">Última gestión:</span>{" "}
                        <span className="font-medium text-slate-800">{consulta.ultimaGestion.resultado}</span>
                        {" · "}
                        {formatearDiaCorto(new Date(consulta.ultimaGestion.fecha))}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-slate-400">Sin gestiones previas registradas</p>
                    )}
                    {consulta.ultimaGestion?.observacion ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500" title={consulta.ultimaGestion.observacion}>
                        {consulta.ultimaGestion.observacion}
                      </p>
                    ) : consulta.observaciones ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500" title={consulta.observaciones}>
                        {consulta.observaciones}
                      </p>
                    ) : null}
                  </td>

                  <td className="py-3 pr-4 pl-2 text-center">
                    <input
                      type="checkbox"
                      checked={respondida}
                      disabled={ocupada}
                      onChange={() => pedirCambio(consulta)}
                      aria-label={`Finalizar la conversacion con ${nombre}`}
                      title={respondida ? "Finalizada · destildar para volver a la cola" : "Finalizar conversacion"}
                      className="mt-1 size-4 cursor-pointer rounded accent-slate-900 disabled:cursor-wait"
                    />
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

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
              disabled={!resultado || !relacion}
              title={resultado && relacion ? undefined : "Elegí cómo quedó la conversación y la relación con el cliente"}
              onClick={() => {
                const consulta = finalizando;
                if (!consulta || !resultado || !relacion) return;
                setFinalizando(null);
                void cambiarRespondida(consulta, true, {
                  resultado,
                  relacion,
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
              <legend className="text-sm font-medium text-slate-700">
                Relación con el cliente <span className="text-red-600">*</span>
              </legend>
              <p className="mt-0.5 text-xs text-slate-500">
                {finalizando.relacion.origen === "ia"
                  ? "Pre-cargada con lo que detectó la IA en el último mensaje. Cambiala si no coincide."
                  : "Pre-cargada según el último mensaje. Cambiala si no coincide."}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Relación con el cliente">
                {(Object.keys(RELACIONES) as Relacion[]).map((clave) => (
                  <button
                    key={clave}
                    type="button"
                    role="radio"
                    aria-checked={relacion === clave}
                    onClick={() => setRelacion(clave)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                      relacion === clave ? ESTILO_RELACION[clave] : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span aria-hidden="true">{ICONO_RELACION[clave]}</span>
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
              La conversación sale de la bandeja y el cierre (resultado, relación y observación) queda en el
              historial del cliente. Si fue un error, en &quot;Respondidas&quot; destildá la casilla y vuelve a la cola.
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
