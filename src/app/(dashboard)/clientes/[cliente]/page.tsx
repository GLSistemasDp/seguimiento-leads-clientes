import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { porCliente } from "@/lib/db/historial";
import { fichaDeCliente, getParaTablero } from "@/lib/db/seguimiento";
import { claveCliente } from "@/lib/db/sheets/maestros";
import { estadoCliente, separarCliente } from "@/lib/seguimiento/presentacion";
import { clasificacionDe } from "@/lib/seguimiento/relacion";
import { formatearFechaHora } from "@/lib/utils/dates";
import { normalizarEncabezado } from "@/lib/utils/strings";
import { ICONO_RELACION, RELACIONES, type Consulta, type EventoHistorial, type Relacion } from "@/types/seguimiento";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/clientes/[cliente]">) {
  const { cliente } = await params;
  return { title: `Cliente ${decodeURIComponent(cliente)} · CRM De Pascale` };
}

const ESTILO_RELACION: Record<Relacion, string> = {
  BUENA: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REGULAR: "bg-amber-50 text-amber-800 ring-amber-200",
  EN_RIESGO: "bg-red-50 text-red-700 ring-red-200",
};
const PUNTO_RELACION: Record<Relacion, string> = { BUENA: "bg-emerald-500", REGULAR: "bg-amber-500", EN_RIESGO: "bg-red-500" };

function BadgeRelacion({ relacion }: { relacion: Relacion }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ESTILO_RELACION[relacion]}`}>
      <span aria-hidden="true">{ICONO_RELACION[relacion]}</span>
      {RELACIONES[relacion]}
    </span>
  );
}

function estiloEstado(estado: string): string {
  const texto = normalizarEncabezado(estado);
  if (texto === "ok") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (texto.includes("judicial")) return "bg-red-50 text-red-700 ring-red-200";
  if (texto.includes("no responder")) return "bg-slate-100 text-slate-500 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-slate-100 py-3 first:border-0 first:pt-0">
      <dt className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">{etiqueta}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export default async function PerfilClientePage({ params }: PageProps<"/clientes/[cliente]">) {
  const clave = decodeURIComponent((await params).cliente).trim();
  const buscada = claveCliente(clave);
  const [ficha, todas] = await Promise.all([fichaDeCliente(clave), getParaTablero()]);
  const consultas = todas.filter((consulta) => claveCliente(consulta.cliente) === buscada);

  const texto = consultas[0]?.cliente ?? (ficha?.codigo ? `${ficha.codigo} - ${ficha.nombre}` : clave);
  const eventos = await porCliente(texto);
  if (!ficha && consultas.length === 0 && eventos.length === 0) notFound();

  const { codigo, nombre } = separarCliente(texto);
  const porId = new Map(consultas.map((consulta) => [consulta.id, consulta]));
  const cerradas = eventos.filter((evento) => evento.tipo === "finalizada");
  const pendientes = consultas.filter((consulta) => !consulta.respondida);
  const conFicha: Consulta | undefined = consultas.find((consulta) => consulta.ficha) ?? consultas[0];
  const estados = conFicha ? estadoCliente(conFicha) : [ficha?.situacion, ficha?.deuda].filter((valor): valor is string => Boolean(valor));
  const clasificacion = (ficha?.clasificacion || conFicha?.clasificacion || "").toUpperCase();
  const responsable = (ficha?.grupoVendedor || conFicha?.grupoVendedor || "").replace(/^FILTRO GRUPO\s*/i, "");
  const ultimoEncargado = [...consultas].reverse().find((consulta) => consulta.encargado && consulta.encargado !== "bot")?.encargado;

  // Relacion de hoy: lo que sugiere el mensaje pendiente mas reciente o, si no hay, el ultimo cierre.
  const ultimoPendiente = [...pendientes].sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0))[0];
  const relacionHoy: Relacion | null = ultimoPendiente
    ? clasificacionDe(ultimoPendiente).relacion
    : (cerradas.find((evento) => evento.relacion)?.relacion ?? null);

  return (
    <div className="flex flex-col gap-5 pb-10">
      <Link href="/seguimiento" className="text-sm text-slate-500 hover:text-slate-900">
        ← Volver al seguimiento
      </Link>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
        {/* --- Columna izquierda: datos del cliente (30%) --- */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
                {nombre
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((palabra) => palabra[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <h1 className="text-lg leading-tight font-semibold text-slate-900">{ficha?.nombre || nombre}</h1>
                <p className="mt-0.5 text-xs text-slate-400">{codigo ? `Cliente #${codigo}` : "Sin código de cliente"}</p>
              </div>
            </div>
            {relacionHoy ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                Relación hoy <BadgeRelacion relacion={relacionHoy} />
              </p>
            ) : null}

            <dl className="mt-4">
              <Dato etiqueta="Tier">
                {clasificacion ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="rounded bg-slate-900 px-1.5 text-xs font-semibold text-white">{clasificacion}</span>
                    Clasificación de venta {clasificacion}
                  </span>
                ) : (
                  <span className="text-slate-400">Sin clasificación</span>
                )}
              </Dato>
              <Dato etiqueta="CUIT">{ficha?.cuit ? <span className="font-mono">{ficha.cuit}</span> : <span className="text-slate-400">Sin CUIT cargado</span>}</Dato>
              <Dato etiqueta="Estado financiero">
                {estados.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {estados.map((estado) => (
                      <span key={estado} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${estiloEstado(estado)}`}>
                        {estado}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-slate-400">Sin datos de la cuenta</span>
                )}
                {ficha?.condicionPago || ficha?.limiteCredito ? (
                  <span className="mt-1.5 block text-xs text-slate-500">
                    {ficha.condicionPago ? `Condición de pago: ${ficha.condicionPago}` : ""}
                    {ficha.condicionPago && ficha.limiteCredito ? " · " : ""}
                    {ficha.limiteCredito ? `Límite de crédito: ${ficha.limiteCredito}` : ""}
                  </span>
                ) : null}
              </Dato>
              <Dato etiqueta="Responsable asignado">
                {responsable || <span className="text-slate-400">Sin grupo vendedor</span>}
                {ultimoEncargado ? <span className="mt-0.5 block text-xs text-slate-500">Atendió por última vez: {ultimoEncargado}</span> : null}
              </Dato>
              {ficha?.grupoWhatsapp || conFicha?.grupoWhatsapp ? (
                <Dato etiqueta="Grupo de WhatsApp">{ficha?.grupoWhatsapp || conFicha?.grupoWhatsapp}</Dato>
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">En la bandeja</p>
            <p className="mt-1 text-[28px] leading-none font-medium text-slate-900 tabular-nums">{pendientes.length}</p>
            <p className="mt-1 text-xs text-slate-400">{pendientes.length === 1 ? "consulta pendiente" : "consultas pendientes"}</p>
            {pendientes.length > 0 ? (
              <Link
                href={`/seguimiento?agrupar=chat&q=${encodeURIComponent(nombre)}`}
                className="mt-3 inline-flex text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
              >
                Ver en el seguimiento →
              </Link>
            ) : null}
          </section>
        </aside>

        {/* --- Columna derecha: linea de tiempo (70%) --- */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Historial de chats resueltos</h2>
            <p className="text-xs text-slate-400">
              {cerradas.length} {cerradas.length === 1 ? "cierre" : "cierres"} · lo más reciente arriba
            </p>
          </div>

          {cerradas.length === 0 ? (
            <p className="mt-6 rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Todavía no hay conversaciones finalizadas con este cliente.
            </p>
          ) : (
            <ol className="relative mt-6 ml-2 border-l border-slate-200">
              {cerradas.map((evento: EventoHistorial) => {
                const origen = porId.get(evento.consultaId);
                const mensaje = evento.resumen || evento.consulta || origen?.ia?.resumen || origen?.consulta || "";
                const agente = evento.encargado || origen?.encargado || "";
                return (
                  <li key={evento.id} className="relative pb-6 pl-6 last:pb-0">
                    <span
                      aria-hidden="true"
                      className={`absolute top-1.5 -left-[5px] size-2.5 rounded-full ring-4 ring-white ${
                        evento.relacion ? PUNTO_RELACION[evento.relacion] : "bg-slate-300"
                      }`}
                    />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <time dateTime={evento.fecha} className="font-medium text-slate-700">
                        {formatearFechaHora(new Date(evento.fecha))}
                      </time>
                      <span aria-hidden="true">·</span>
                      <span>{agente && agente.toLowerCase() !== "bot" ? agente : "Equipo comercial"}</span>
                      {evento.hito ? (
                        <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 ring-inset">
                          {evento.hito}
                        </span>
                      ) : null}
                      {evento.relacion ? (
                        <span className="ml-auto">
                          <BadgeRelacion relacion={evento.relacion} />
                        </span>
                      ) : null}
                    </div>
                    {mensaje ? <p className="mt-1.5 text-sm text-slate-800">{mensaje}</p> : null}
                    <p className="mt-1.5 text-sm text-slate-600">
                      <span className="text-slate-400">Resolución:</span>{" "}
                      <span className="font-medium text-slate-800">{evento.resultado ?? "Sin resultado"}</span>
                      {evento.observacion ? ` — ${evento.observacion}` : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
