"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useState, useTransition } from "react";
import { BotonGrupoWhatsapp } from "@/components/seguimiento/BotonGrupoWhatsapp";
import { ModalFinalizar } from "@/components/seguimiento/ModalFinalizar";
import type { CierreConsulta } from "@/components/seguimiento/ModalFinalizar";
import { RecomendacionRespuesta } from "@/components/seguimiento/RecomendacionRespuesta";
import { VistaRapidaCliente } from "@/components/seguimiento/VistaRapidaCliente";
import { Icono } from "@/components/ui/Icono";
import { Pista } from "@/components/ui/Pista";
import { useToast } from "@/components/ui/Toast";
import { claveChat, estadoCliente, explicarEstado, rutaPerfil, separarCliente } from "@/lib/seguimiento/presentacion";
import type { CierreFrecuente, Prioridad, ResumenChat } from "@/lib/seguimiento/presentacion";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import { guardarConsulta, type CambiosConsulta } from "@/lib/seguimiento/guardar-consulta";
import { textoHorasHabiles } from "@/lib/utils/dias-habiles";
import { formatearDiaCorto, formatearHora } from "@/lib/utils/dates";
import { normalizarEncabezado } from "@/lib/utils/strings";
import { ACCIONES } from "@/types/reclamo";
import type { Indicacion } from "@/types/reclamo";
import { ICONO_RELACION, RELACIONES } from "@/types/seguimiento";
import type { Consulta, EventoHistorial, Relacion } from "@/types/seguimiento";

export type FilaConsulta = Consulta & {
  horasAbierta: number | null;
  prioridad: Prioridad;
  /** Por que tiene esa prioridad ("Reclamo", "Cliente A"…), para el tooltip. */
  motivosPrioridad: string[];
  vencida: boolean;
  /** Ultimo cierre registrado desde la app (resultado y relacion). */
  cierre: Pick<EventoHistorial, "resultado" | "relacion" | "fecha"> | null;
  /** Si es un reclamo y la gerencia ya dijo como seguir. */
  indicacion: Indicacion | null;
  /** N° del FOR-03 que se genero desde esta consulta (el reclamo ya escalo). */
  formularioReclamo: string | null;
  /** Relacion vigente y de donde sale (cierre, IA o reglas). */
  relacion: { relacion: Relacion; origen: "cierre" | "ia" | "reglas" };
  /** Ultimo cierre registrado con este cliente (cualquier consulta). */
  ultimaGestion: EventoHistorial | null;
  /** Ultima observacion escrita para el cliente (cierre o nota), aunque el ultimo cierre no tenga. */
  ultimaObservacion: Pick<EventoHistorial, "observacion" | "fecha"> | null;
};

const ORIGEN_RELACION = { cierre: "al cerrar", ia: "sugerida por IA", reglas: "según el mensaje" } as const;


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

/** El cliente va en el encabezado azul de cada chat; cada fila es una consulta. */
const COLUMNAS = ["Fecha · hito · prioridad · demora", "Mensaje", "Relación · última charla", "Resuelto"] as const;

/** Hasta este largo la observacion se ve entera; mas larga, se corta y se lee al pasar el mouse. */
const LARGO_OBSERVACION = 70;

/** La observacion automatica del cierre masivo no aporta: no se muestra. */
function observacionAMostrar(consulta: FilaConsulta): { texto: string; fecha: string | null } | null {
  const escrita = consulta.ultimaObservacion?.observacion.trim();
  if (escrita) return { texto: escrita, fecha: consulta.ultimaObservacion?.fecha ?? null };
  const planilla = consulta.observaciones.trim();
  return planilla && !planilla.includes("Cierre masivo:") ? { texto: planilla, fecha: null } : null;
}

function ObservacionBreve({ texto, fecha }: { texto: string; fecha: string | null }) {
  const larga = texto.length > LARGO_OBSERVACION;
  const breve = larga ? `${texto.slice(0, LARGO_OBSERVACION).trimEnd()}…` : texto;
  const contenido = (
    <span className="text-left">
      <span className="text-slate-400">Obs.:</span> <span className="text-slate-700">{breve}</span>
      {fecha ? <span className="text-slate-400"> · {formatearDiaCorto(new Date(fecha))}</span> : null}
    </span>
  );
  return <p className="mt-1 text-xs">{larga ? <Pista texto={texto}>{contenido}</Pista> : contenido}</p>;
}

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


type FilaProps = {
  consulta: FilaConsulta;
  respondida: boolean;
  ocupada: boolean;
  saliendo: boolean;
  /** Primera fila de su chat (o distinta de la anterior): lleva el encabezado con el cliente. */
  nuevoChat: boolean;
  resumen: ResumenChat | undefined;
  catalogo: readonly RespuestaTipo[] | undefined;
  onAlternar: (consulta: FilaConsulta, respondida: boolean) => void;
};

/**
 * Una consulta de la tabla. Memorizada: abrir el modal de cierre o tildar una
 * fila solo vuelve a dibujar la fila que cambio, no todas.
 */
const FilaSeguimiento = memo(function FilaSeguimiento({
  consulta,
  respondida,
  ocupada,
  saliendo,
  nuevoChat,
  resumen,
  catalogo,
  onAlternar,
}: FilaProps) {
  const { codigo, nombre } = separarCliente(consulta.cliente);
  const prioridad = PRIORIDADES[respondida ? "RESUELTA" : consulta.prioridad];
  const tachado = respondida ? "text-slate-400 line-through" : "";
  const vendedor = consulta.grupoVendedor.replace(/^FILTRO GRUPO\s*/i, "");
  const estados = estadoCliente(consulta);
  const hora = formatearHora(consulta.fecha);

  return (
    <>
    {nuevoChat ? (
      // Encabezado de cada chat (azul de la marca): cliente, estado de cuenta,
      // acceso al chat y cuantos mensajes quedan sin responder.
      <tr className="bg-[#1b2b5e]">
        <td colSpan={COLUMNAS.length} className="px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {/* Al pasar el mouse, vista rapida de la ficha; clic, el perfil completo. */}
              <VistaRapidaCliente consulta={consulta} resumen={resumen}>
                <Link
                  href={rutaPerfil(consulta.cliente)}
                  className="font-semibold underline decoration-white/40 decoration-dotted underline-offset-4 hover:decoration-white"
                >
                  {nombre}
                </Link>
              </VistaRapidaCliente>
              {codigo ? <span className="text-xs text-white/75">#{codigo}</span> : null}
              {consulta.clasificacion ? (
                <span
                  className="rounded bg-white/15 px-1.5 text-[11px] font-semibold text-white ring-1 ring-white/30 ring-inset"
                  title="Clasificacion de venta"
                >
                  {consulta.clasificacion}
                </span>
              ) : null}
              {vendedor || consulta.listaPrecio ? (
                <span className="text-xs text-white/60">
                  {[vendedor, consulta.listaPrecio].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {estados.length > 0 ? (
                estados.map((estado) => {
                  const etiqueta = <span className={`${ETIQUETA} ${estiloEstado(estado)}`}>{estado}</span>;
                  const explicacion = explicarEstado(estado);
                  return explicacion ? (
                    <Pista key={estado} texto={explicacion} lado="abajo">
                      {etiqueta}
                    </Pista>
                  ) : (
                    <span key={estado}>{etiqueta}</span>
                  );
                })
              ) : (
                <span className="text-xs text-white/60">Sin estado de cuenta</span>
              )}
            </div>

            <BotonGrupoWhatsapp
              grupo={consulta.grupoWhatsapp}
              link={consulta.linkWhatsapp}
              etiqueta="Ir al chat"
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-[#1b2b5e] hover:bg-slate-100"
            />

            {resumen ? (
              <span
                className={`ml-auto ${ETIQUETA} ${
                  resumen.sinResponder > 0 ? "bg-red-600 text-white ring-red-400" : "bg-emerald-600 text-white ring-emerald-400"
                }`}
              >
                {`${resumen.sinResponder} pendiente${resumen.sinResponder === 1 ? "" : "s"}`}
              </span>
            ) : null}
          </div>
        </td>
      </tr>
    ) : null}
    <tr
      className={`border-b border-slate-100 align-top transition-opacity duration-300 last:border-0 ${
        respondida ? "bg-slate-50/60" : "hover:bg-slate-50"
      } ${saliendo ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      {/* Fecha, hito, prioridad y demora: los cuatro datos, uno por renglon. */}
      <td className="py-3 pr-3 pl-5">
        <div className="flex flex-col items-start gap-1.5">
        <p className="text-xs font-medium text-slate-600 tabular-nums">
          {formatearDiaCorto(consulta.fecha)}
          {hora !== "00:00 hs" ? <span className="font-normal text-slate-400"> · {hora}</span> : null}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {consulta.hito ? (
            <span className={`${ETIQUETA} ${respondida ? "bg-slate-50 text-slate-400 ring-slate-200" : estiloHito(consulta.hito)}`}>
              {consulta.hito}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Sin hito</span>
          )}
          {consulta.formularioReclamo ? (
            <Link
              href={`/reclamos/${encodeURIComponent(consulta.formularioReclamo)}`}
              title="Este reclamo ya se cargó en el formulario formal FOR-03"
              className={`${ETIQUETA} gap-1 bg-blue-50 text-blue-800 ring-blue-200 hover:bg-blue-100`}
            >
              <Icono nombre="portapapeles" className="size-3" />
              FOR-03 · {consulta.formularioReclamo}
            </Link>
          ) : null}
        </div>
          <Pista
            lado="abajo"
            texto={
              respondida
                ? "Conversación finalizada."
                : consulta.motivosPrioridad.length > 0
                  ? `${prioridad.etiqueta}: ${consulta.motivosPrioridad.join(" + ")}`
                  : `${prioridad.etiqueta}: sin señales de urgencia.`
            }
          >
            <span className={`${ETIQUETA} gap-1 ${prioridad.estilo}`}>
              <span className={`size-1.5 rounded-full ${prioridad.punto}`} aria-hidden="true" />
              {prioridad.etiqueta}
            </span>
          </Pista>
        {respondida ? null : (
        <div>
          {consulta.horasAbierta !== null ? (
            <span
              title="Días hábiles que lleva sin resolverse (sin fines de semana ni feriados)"
              className={`${ETIQUETA} tabular-nums ${
                consulta.vencida ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-600 ring-slate-200"
              }`}
            >
              Demora: {textoHorasHabiles(consulta.horasAbierta)}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Demora: —</span>
          )}
        </div>
        )}
        </div>
      </td>

      {/* Descripcion del mensaje, lo que indico gerencia y la respuesta sugerida. */}
      <td className="px-3 py-3">
        <p title={consulta.consulta} className={`line-clamp-4 text-sm ${respondida ? tachado : "text-slate-700"}`}>
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
        <div className="mt-1.5">
          <RecomendacionRespuesta
            consulta={consulta}
            relacion={consulta.relacion.relacion}
            horasHabiles={consulta.horasAbierta}
            estadoCuenta={estados.join(" · ")}
            confianza={consulta.ia?.confianza}
            apagada={respondida}
            catalogo={catalogo}
          />
        </div>
      </td>

      {/* Estado de la relacion (semaforo) y la informacion de la ultima charla. */}
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <BadgeRelacion relacion={consulta.relacion.relacion} />
          <span className="text-[11px] text-slate-400">{ORIGEN_RELACION[consulta.relacion.origen]}</span>
        </div>
        {consulta.ultimaGestion?.resultado ? (
          <p className="mt-1.5 text-xs text-slate-600">
            <span className="text-slate-400">Última charla:</span>{" "}
            <span className="font-medium text-slate-800">{consulta.ultimaGestion.resultado}</span>
            {" · "}
            {formatearDiaCorto(new Date(consulta.ultimaGestion.fecha))}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-400">Sin charlas previas registradas</p>
        )}
        {(() => {
          const observacion = observacionAMostrar(consulta);
          return observacion ? <ObservacionBreve texto={observacion.texto} fecha={observacion.fecha} /> : null;
        })()}
      </td>

      <td className="py-3 pr-4 pl-2 text-center">
        <input
          type="checkbox"
          checked={respondida}
          disabled={ocupada}
          onChange={() => onAlternar(consulta, respondida)}
          aria-label={`Marcar como resuelta la consulta de ${nombre}`}
          title={respondida ? "Resuelta · destildar para volver a la cola" : "Marcar como resuelta"}
          className="mt-1 size-4 cursor-pointer rounded accent-slate-900 disabled:cursor-wait"
        />
      </td>
    </tr>
    </>
  );
});

export type SeguimientoTableProps = {
  consultas: readonly FilaConsulta[];
  chats?: Record<string, ResumenChat>;
  /** Respuestas tipo de la planilla para las sugerencias. */
  catalogo?: readonly RespuestaTipo[];
  /** Cierre mas usado en el historial, para el boton de un click del modal. */
  atajo?: CierreFrecuente;
};

const SIN_CHATS: Record<string, ResumenChat> = {};
const ATAJO_POR_DEFECTO: CierreFrecuente = { resultado: "Resuelto", relacion: "BUENA", veces: 0, total: 0 };

export function SeguimientoTable({
  consultas,
  chats = SIN_CHATS,
  catalogo,
  atajo = ATAJO_POR_DEFECTO,
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
  /** Consulta que se esta por dar por finalizada (el modal tiene su propio estado). */
  const [finalizando, setFinalizando] = useState<FilaConsulta | null>(null);

  // Las funciones que reciben las filas son estables (useCallback): si no, cada
  // render de la tabla haria que todas las filas memorizadas se vuelvan a dibujar.
  const cambiarRespondida = useCallback(
    async (consulta: FilaConsulta, valor: boolean, cierre?: Omit<CambiosConsulta, "respondida">) => {
      const marcarGuardando = (activo: boolean) =>
        setGuardando((previo) => {
          const nuevo = new Set(previo);
          if (activo) nuevo.add(consulta.id);
          else nuevo.delete(consulta.id);
          return nuevo;
        });
      setRespondidas((previo) => ({ ...previo, [consulta.id]: valor }));
      marcarGuardando(true);
      const error = await guardarConsulta(consulta.id, { respondida: valor, ...cierre });
      marcarGuardando(false);

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
      if (valor) {
        // Inbox zero: la fila se desvanece y se va antes de recargar la lista.
        setSaliendo((previo) => new Set(previo).add(consulta.id));
        setTimeout(() => {
          setOcultas((previo) => new Set(previo).add(consulta.id));
          startTransition(() => router.refresh());
        }, 350);
        return;
      }
      startTransition(() => router.refresh());
    },
    [mostrar, router],
  );

  /** Tildar abre la confirmacion con observacion; destildar vuelve a la cola directo. */
  const alternar = useCallback(
    (consulta: FilaConsulta, respondida: boolean) => {
      if (respondida) void cambiarRespondida(consulta, false);
      else setFinalizando(consulta);
    },
    [cambiarRespondida],
  );
  const cancelarCierre = useCallback(() => setFinalizando(null), []);
  const finalizar = useCallback(
    (consulta: FilaConsulta, cierre: CierreConsulta) => {
      setFinalizando(null);
      void cambiarRespondida(consulta, true, cierre);
    },
    [cambiarRespondida],
  );

  // Recalcular sobre las filas que quedan también hace que la siguiente
  // pendiente herede el encabezado del chat cuando se cierra la primera.
  const visibles = consultas.filter((consulta) => !consulta.respondida && !ocultas.has(consulta.id));

  if (visibles.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-slate-600">No hay consultas pendientes que coincidan con el filtro.</p>
        <p className="mt-1 text-xs text-slate-500">
          Las conversaciones realizadas quedaron en el historial de cada cliente.
        </p>
      </div>
    );
  }

  return (
    <>
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-52" />
          <col />
          <col className="w-[28%]" />
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
          {visibles.map((consulta, indice) => {
            const chat = claveChat(consulta);
            return (
              <FilaSeguimiento
                key={consulta.id}
                consulta={consulta}
                respondida={respondidas[consulta.id] ?? consulta.respondida}
                ocupada={guardando.has(consulta.id) || saliendo.has(consulta.id)}
                saliendo={saliendo.has(consulta.id)}
                nuevoChat={indice === 0 || chat !== claveChat(visibles[indice - 1])}
                resumen={chats[chat]}
                catalogo={catalogo}
                onAlternar={alternar}
              />
            );
          })}
        </tbody>
      </table>

      <ModalFinalizar consulta={finalizando} atajo={atajo} onCancelar={cancelarCierre} onFinalizar={finalizar} />
    </>
  );
}
