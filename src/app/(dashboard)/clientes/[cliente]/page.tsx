import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LineaDeTiempoCliente, type EventoLinea } from "@/components/clientes/LineaDeTiempoCliente";
import { porCliente } from "@/lib/db/historial";
import { fichaDeCliente, getParaTablero } from "@/lib/db/seguimiento";
import { claveCliente } from "@/lib/db/sheets/maestros";
import { historialSimulado } from "@/lib/seguimiento/historial-simulado";
import { estadoCliente, separarCliente } from "@/lib/seguimiento/presentacion";
import { clasificacionDe } from "@/lib/seguimiento/relacion";
import { normalizarEncabezado } from "@/lib/utils/strings";
import { ICONO_RELACION, RELACIONES, type Consulta, type Relacion } from "@/types/seguimiento";

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

export default async function PerfilClientePage({ params, searchParams }: PageProps<"/clientes/[cliente]">) {
  const clave = decodeURIComponent((await params).cliente).trim();
  // ?simulacion=1: un año de historial inventado para este cliente (prototipo, no se guarda).
  const simulacion = (await searchParams).simulacion === "1";
  const buscada = claveCliente(clave);
  const [ficha, todas] = await Promise.all([fichaDeCliente(clave), getParaTablero()]);
  const consultas = todas.filter((consulta) => claveCliente(consulta.cliente) === buscada);

  const texto = consultas[0]?.cliente ?? (ficha?.codigo ? `${ficha.codigo} - ${ficha.nombre}` : clave);
  const reales = await porCliente(texto);
  if (!ficha && consultas.length === 0 && reales.length === 0) notFound();
  const eventos = simulacion ? historialSimulado(texto, new Date()) : reales;

  const { codigo, nombre } = separarCliente(texto);
  const porId = new Map(consultas.map((consulta) => [consulta.id, consulta]));
  const cerradas = eventos
    .filter((evento) => evento.tipo === "finalizada")
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  // Lo que muestra la linea de tiempo: mensaje (o resumen) y agente ya resueltos.
  const linea: EventoLinea[] = eventos.map((evento) => {
    const origen = porId.get(evento.consultaId);
    const agente = evento.encargado || origen?.encargado || "";
    return {
      ...evento,
      mensaje: evento.resumen || evento.consulta || origen?.ia?.resumen || origen?.consulta || "",
      agente: agente && agente.toLowerCase() !== "bot" ? agente : "Equipo comercial",
    };
  });
  const pendientes = consultas.filter((consulta) => !consulta.respondida);
  const conFicha: Consulta | undefined = consultas.find((consulta) => consulta.ficha) ?? consultas[0];
  const estados = conFicha ? estadoCliente(conFicha) : [ficha?.situacion, ficha?.deuda].filter((valor): valor is string => Boolean(valor));
  const clasificacion = (ficha?.clasificacion || conFicha?.clasificacion || "").toUpperCase();
  const responsable = (ficha?.grupoVendedor || conFicha?.grupoVendedor || "").replace(/^FILTRO GRUPO\s*/i, "");
  const ultimoEncargado = [...consultas].reverse().find((consulta) => consulta.encargado && consulta.encargado !== "bot")?.encargado;

  // Relacion de hoy: lo que sugiere el mensaje pendiente mas reciente o, si no hay, el ultimo cierre.
  const ultimoPendiente = [...pendientes].sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0))[0];
  const relacionHoy: Relacion | null = ultimoPendiente && !simulacion
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Historial del cliente</h2>
              <p className="text-xs text-slate-400">Del más viejo al más nuevo · los episodios en riesgo quedan resaltados</p>
            </div>
            <Link
              href={simulacion ? `/clientes/${encodeURIComponent(clave)}` : `/clientes/${encodeURIComponent(clave)}?simulacion=1`}
              scroll={false}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                simulacion ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {simulacion ? "Ver historial real" : "Simular historial"}
            </Link>
          </div>

          {simulacion ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Simulación: un año de conversaciones inventadas para este cliente, para ver cómo se lee el historial. No
              se guarda ni afecta los datos reales ({reales.length} {reales.length === 1 ? "evento real" : "eventos reales"}).
            </p>
          ) : null}

          <LineaDeTiempoCliente key={simulacion ? "simulado" : "real"} eventos={linea} />
        </section>
      </div>
    </div>
  );
}
