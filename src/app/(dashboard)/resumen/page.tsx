import Link from "next/link";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { ResumenDiario } from "@/components/resumen/ResumenDiario";
import { FiltrosTablero } from "@/components/tablero/FiltrosTablero";
import { BarrasApiladas, ColumnasPorDia, Leyenda } from "@/components/tablero/Graficos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Icono } from "@/components/ui/Icono";
import type { NombreIcono } from "@/components/ui/Icono";
import { delDia } from "@/lib/db/historial";
import { getPanel } from "@/lib/db/reclamos";
import { getAll } from "@/lib/db/seguimiento";
import { getAll as getSolicitudes } from "@/lib/db/solicitudes";
import { CATEGORIAS } from "@/lib/solicitudes/evaluacion";
import { evaluacionVigente, getEvaluaciones } from "@/lib/solicitudes/evaluacion-ia";
import { opciones } from "@/lib/seguimiento/presentacion";
import { textoCierre } from "@/lib/seguimiento/cierre-del-dia";
import { armarResumenDiario } from "@/lib/seguimiento/resumen-diario";
import { telegramConfigurado } from "@/lib/notificaciones/telegram";
import { PERIODOS, calcularTablero, diaLocal, esPeriodo, vendedorCorto } from "@/lib/seguimiento/tablero";
import { formatearDiaCorto } from "@/lib/utils/dates";
import { ACCIONES } from "@/types/reclamo";

export const metadata = { title: "Resumen · CRM De Pascale" };
export const dynamic = "force-dynamic";

const MAX_LISTA = 5;

function texto(valor: string | string[] | undefined): string {
  return typeof valor === "string" ? valor : "";
}

function Tarjeta({ titulo, children, extra }: { titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Indicador({
  titulo,
  valor,
  detalle,
  icono,
  colorIcono,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  icono: NombreIcono;
  colorIcono: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm text-slate-600">{titulo}</h3>
        <span className={`flex size-8 items-center justify-center rounded-lg ${colorIcono}`}>
          <Icono nombre={icono} className="size-4" />
        </span>
      </div>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

/** Tarjeta grande de "para resolver hoy", que lleva a la seccion. */
function Pendiente({
  href,
  titulo,
  valor,
  detalle,
  icono,
  tono,
}: {
  href: string;
  titulo: string;
  valor: number;
  detalle: string;
  icono: NombreIcono;
  tono: "azul" | "ambar" | "rojo" | "verde";
}) {
  const tonos = {
    azul: "bg-blue-700 text-white",
    ambar: "bg-amber-500 text-white",
    rojo: "bg-red-600 text-white",
    verde: "bg-emerald-600 text-white",
  } as const;
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-700 uppercase">{titulo}</h3>
        <span className={`flex size-9 items-center justify-center rounded-xl ${tonos[tono]}`}>
          <Icono nombre={icono} className="size-4" />
        </span>
      </div>
      <p className="text-4xl font-semibold text-slate-900 tabular-nums">{valor}</p>
      <p className="flex items-center justify-between gap-2 text-xs text-slate-500">
        {detalle}
        <Icono nombre="flecha" className="size-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-700" />
      </p>
    </Link>
  );
}

function Dias({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums ${
        dias >= 2 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
      }`}
    >
      {dias === 0 ? "Hoy" : `${dias} ${dias === 1 ? "dia" : "dias"}`}
    </span>
  );
}

function enlaceCola(cliente: string): string {
  return `/seguimiento?agrupar=chat&q=${encodeURIComponent(cliente)}`;
}

export default async function ResumenPage({ searchParams }: PageProps<"/resumen">) {
  const params = await searchParams;
  const periodoParam = texto(params.periodo);
  const periodo = esPeriodo(periodoParam) ? periodoParam : "14";
  const encargado = texto(params.encargado);
  const vendedor = texto(params.vendedor);

  const ahora = new Date();
  const [todas, panel, pendientesAlta, evaluaciones, eventosHoy] = await Promise.all([
    getAll(),
    getPanel(ahora),
    getSolicitudes({ estado: "PENDIENTE" }).catch(() => []),
    getEvaluaciones(),
    delDia(diaLocal(ahora), diaLocal),
  ]);

  // --- Para resolver hoy (no dependen de los filtros) ---
  const reclamosGerencia = panel.reclamos.filter((reclamo) => reclamo.estado === "SIN_DEFINIR");
  const reclamosEnGestion = panel.reclamos.filter((reclamo) => reclamo.estado === "EN_GESTION");
  const altas = pendientesAlta
    .map((solicitud) => ({ solicitud, evaluacion: evaluacionVigente(solicitud, evaluaciones) }))
    .sort((a, b) => b.evaluacion.puntaje - a.evaluacion.puntaje);
  const muyAptas = altas.filter(({ evaluacion }) => evaluacion.categoria === "A").length;
  const resumen = armarResumenDiario({ consultas: todas, eventosHoy, reclamos: panel.reclamos, ahora });

  // --- Tablero de conversaciones (con filtros) ---
  const filtradas = todas.filter(
    (consulta) =>
      (!encargado || consulta.encargado === encargado) &&
      (!vendedor || vendedorCorto(consulta.grupoVendedor) === vendedor),
  );
  const tablero = calcularTablero(filtradas, periodo, ahora);
  const nombrePeriodo = periodo === "todo" ? "todo el historial" : `ultimos ${PERIODOS[periodo]}`;
  const tasa = tablero.entradas > 0 ? Math.round((tablero.respondidasPeriodo / tablero.entradas) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Resumen"
        etiqueta="GERENCIA Y ENCARGADOS"
        descripcion={
          <>
            Lo pendiente con clientes en un solo lugar: chats sin responder, reclamos sin indicación y altas por
            resolver.
            <span className="mt-1 block text-xs text-slate-400">
              Última consulta cargada por el bot:{" "}
              {tablero.ultimaCarga ? formatearDiaCorto(`${tablero.ultimaCarga}T12:00:00Z`) : "—"}
            </span>
          </>
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Para resolver hoy</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Pendiente
            href="/seguimiento?agrupar=chat"
            titulo="Chats sin responder"
            valor={tablero.chatsPendientes}
            detalle={`${tablero.sinResponder} consultas en la cola`}
            icono="chat"
            tono="azul"
          />
          <Pendiente
            href="/seguimiento?orden=antiguas"
            titulo="Con demora"
            valor={resumen.demoradas}
            detalle="1 día o más sin respuesta"
            icono="reloj"
            tono="ambar"
          />
          <Pendiente
            href="/reclamos?estado=SIN_DEFINIR"
            titulo="Reclamos para gerencia"
            valor={reclamosGerencia.length}
            detalle={`${reclamosEnGestion.length} ya indicados, en gestión`}
            icono="alerta"
            tono="rojo"
          />
          <Pendiente
            href="/solicitudes?estado=PENDIENTE&orden=aptitud"
            titulo="Altas pendientes"
            valor={pendientesAlta.length}
            detalle={`${muyAptas} muy aptas para priorizar`}
            icono="documento"
            tono="verde"
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Tarjeta
          titulo="Reclamos esperando a la gerencia"
          extra={
            <Link href="/reclamos" className="text-xs text-blue-700 hover:underline">
              Ir a reclamos →
            </Link>
          }
        >
          {panel.error ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{panel.error}</p>
          ) : reclamosGerencia.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No hay reclamos sin indicación. {reclamosEnGestion.length > 0 ? `${reclamosEnGestion.length} en gestión.` : ""}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {reclamosGerencia.slice(0, MAX_LISTA).map((reclamo) => (
                <li key={reclamo.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{reclamo.cliente}</p>
                    <p className="line-clamp-2 text-xs text-slate-600">{reclamo.detalle}</p>
                  </div>
                  <Dias dias={reclamo.dias} />
                </li>
              ))}
              {reclamosGerencia.length > MAX_LISTA ? (
                <li className="pt-2 text-xs text-slate-500">y {reclamosGerencia.length - MAX_LISTA} más</li>
              ) : null}
            </ul>
          )}
          {reclamosEnGestion.length > 0 && reclamosGerencia.length > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Última indicación: {ACCIONES[reclamosEnGestion[0].indicacion!.accion]} · {reclamosEnGestion[0].cliente}
            </p>
          ) : null}
        </Tarjeta>

        <Tarjeta
          titulo="Altas para resolver primero"
          extra={
            <Link href="/solicitudes?estado=PENDIENTE&orden=aptitud" className="text-xs text-blue-700 hover:underline">
              Ir a solicitudes →
            </Link>
          }
        >
          {altas.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No hay solicitudes de alta pendientes.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {altas.slice(0, MAX_LISTA).map(({ solicitud, evaluacion }) => (
                <li key={solicitud.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/solicitudes/${solicitud.id}`}
                      className="block truncate text-sm font-medium text-slate-900 hover:text-blue-700"
                    >
                      {solicitud.nombre}
                    </Link>
                    <p className="line-clamp-1 text-xs text-slate-600">{evaluacion.resumen}</p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      CATEGORIAS[evaluacion.categoria].estilo
                    }`}
                    title={`${CATEGORIAS[evaluacion.categoria].etiqueta} · ${evaluacion.fuente === "ia" ? "evaluado con IA" : "por reglas"}`}
                  >
                    {evaluacion.fuente === "ia" ? <Icono nombre="chispa" className="size-3" /> : null}
                    {evaluacion.puntaje}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <ResumenDiario
          texto={textoCierre(resumen, ahora)}
          telegramListo={telegramConfigurado()}
          datos={[
            { etiqueta: "Finalizadas hoy", valor: resumen.finalizadasHoy, color: "text-emerald-700" },
            { etiqueta: "Sin responder", valor: resumen.sinResponder, color: "text-slate-900" },
            { etiqueta: "Demoradas", valor: resumen.demoradas, color: "text-amber-700" },
            { etiqueta: "Reclamos sin indicar", valor: resumen.reclamosSinIndicacion, color: "text-red-600" },
          ]}
        />
      </div>

      {/* --- Tablero de conversaciones --- */}
      <div className="flex flex-col gap-3 pt-2">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Tablero de conversaciones de WhatsApp</h2>
        <Suspense fallback={null}>
          <FiltrosTablero
            periodo={periodo}
            encargado={encargado}
            vendedor={vendedor}
            opciones={{
              encargado: opciones(todas, "encargado"),
              vendedor: [...new Set(todas.map((consulta) => vendedorCorto(consulta.grupoVendedor)).filter(Boolean))].sort(
                (a, b) => a.localeCompare(b, "es"),
              ),
            }}
          />
        </Suspense>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="Consultas sin responder"
          valor={String(tablero.sinResponder)}
          detalle="en todos los chats"
          icono="portapapeles"
          colorIcono="bg-blue-100 text-blue-700"
        />
        <Indicador
          titulo="Reclamos abiertos"
          valor={String(tablero.reclamosAbiertos)}
          detalle="hito Reclamo sin responder"
          icono="alerta"
          colorIcono="bg-red-100 text-red-600"
        />
        <Indicador
          titulo="Vencidas"
          valor={String(tablero.vencidas)}
          detalle="2 dias o mas sin respuesta"
          icono="reloj"
          colorIcono="bg-amber-100 text-amber-700"
        />
        <Indicador
          titulo="Espera promedio"
          valor={tablero.esperaPromedio === null ? "—" : `${tablero.esperaPromedio.toFixed(1)} d`}
          detalle="de las que siguen sin respuesta"
          icono="calendario"
          colorIcono="bg-slate-100 text-slate-700"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Tarjeta
          titulo="Chats con mas pendientes"
          extra={
            <Link href="/seguimiento?agrupar=chat" className="text-xs text-blue-700 hover:underline">
              Ver cola completa →
            </Link>
          }
        >
          {tablero.chats.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No hay chats pendientes. La cola esta al dia.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 font-medium">Cliente / grupo</th>
                  <th className="py-2 font-medium">Hitos</th>
                  <th className="py-2 text-right font-medium">Pend.</th>
                  <th className="py-2 text-right font-medium">Espera</th>
                </tr>
              </thead>
              <tbody>
                {tablero.chats.map((chat) => (
                  <tr key={chat.clave} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-2 pr-2">
                      <Link href={enlaceCola(chat.cliente)} className="font-medium text-slate-900 hover:text-blue-700">
                        {chat.cliente}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {chat.codigo ? `#${chat.codigo} · ` : ""}
                        {chat.grupoWhatsapp || "Sin grupo de WhatsApp"}
                      </p>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-1">
                        {chat.hitos.map((hito) => (
                          <span
                            key={hito}
                            className={`rounded px-1.5 py-0.5 text-[11px] ${
                              hito.toLowerCase() === "reclamo" ? "bg-red-600 font-semibold text-white" : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {hito}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {chat.pendientes}
                      <span className="font-normal text-slate-400">/{chat.total}</span>
                    </td>
                    <td className="py-2 text-right">
                      <Dias dias={chat.esperaMaxima} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>

        <Tarjeta titulo="Clientes a revisar antes de responder">
          {tablero.delicados.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Ningun cliente con deuda o situacion distinta de OK espera respuesta.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 font-medium">Cliente</th>
                  <th className="py-2 font-medium">Situacion</th>
                  <th className="py-2 text-right font-medium">Pend.</th>
                  <th className="py-2 text-right font-medium">Espera</th>
                </tr>
              </thead>
              <tbody>
                {tablero.delicados.map((fila) => (
                  <tr key={fila.codigo || fila.cliente} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-2 pr-2">
                      <Link href={enlaceCola(fila.cliente)} className="font-medium text-slate-900 hover:text-blue-700">
                        {fila.cliente}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {fila.codigo ? `#${fila.codigo}` : ""}
                        {fila.condicionPago ? ` · ${fila.condicionPago}` : ""}
                      </p>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-1">
                        {fila.alertas.map((alerta) => (
                          <span
                            key={alerta}
                            className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-semibold text-orange-800"
                          >
                            <Icono nombre="alerta" className="size-3" />
                            {alerta}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{fila.pendientes}</td>
                    <td className="py-2 text-right">
                      <Dias dias={fila.esperaMaxima} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
      </div>

      {/* --- Actividad del periodo --- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Actividad · {nombrePeriodo}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Indicador
            titulo="Consultas recibidas"
            valor={String(tablero.entradas)}
            detalle={`ingresadas en ${nombrePeriodo}`}
            icono="chat"
            colorIcono="bg-blue-100 text-blue-700"
          />
          <Indicador
            titulo="Respondidas"
            valor={tasa === null ? "—" : `${tasa}%`}
            detalle={`${tablero.respondidasPeriodo} de ${tablero.entradas} ya tienen respuesta`}
            icono="check"
            colorIcono="bg-emerald-100 text-emerald-700"
          />
          <Indicador
            titulo="Reclamos recibidos"
            valor={String(tablero.reclamosPeriodo)}
            detalle="consultas con hito Reclamo"
            icono="alerta"
            colorIcono="bg-red-100 text-red-600"
          />
        </div>
      </section>

      <Tarjeta titulo="Consultas por dia" extra={<Leyenda />}>
        <ColumnasPorDia barras={tablero.porDia} />
      </Tarjeta>

      <div className="grid gap-5 xl:grid-cols-3">
        <Tarjeta titulo="Por hito" extra={<Leyenda />}>
          <BarrasApiladas barras={tablero.porHito} encabezado="Hito" />
        </Tarjeta>
        <Tarjeta titulo="Por encargado" extra={<Leyenda />}>
          <BarrasApiladas barras={tablero.porEncargado} encabezado="Encargado" />
        </Tarjeta>
        <Tarjeta titulo="Por grupo vendedor" extra={<Leyenda />}>
          <BarrasApiladas barras={tablero.porVendedor} encabezado="Grupo vendedor" />
        </Tarjeta>
      </div>
    </div>
  );
}
