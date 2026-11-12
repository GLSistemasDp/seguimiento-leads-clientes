import { leerDatos } from "@/lib/db/lectura";
import { ProblemaDatos } from "@/components/ui/ProblemaDatos";
import { Suspense } from "react";
import { ProximoEnvio } from "@/components/resumen/ProximoEnvio";
import { BotonTelegram } from "@/components/ui/BotonTelegram";
import { FiltrosSeguimiento } from "@/components/seguimiento/FiltrosSeguimiento";
import { EstadoSincronizacion } from "@/components/seguimiento/EstadoSincronizacion";
import { SimularBot } from "@/components/seguimiento/SimularBot";
import { SeguimientoTable } from "@/components/seguimiento/SeguimientoTable";
import { TriajeSeguimiento } from "@/components/seguimiento/TriajeSeguimiento";
import { AnalisisSeguimiento } from "@/components/seguimiento/AnalisisSeguimiento";
import { CierreMasivo } from "@/components/seguimiento/CierreMasivo";
import { Paginacion } from "@/components/solicitudes/Paginacion";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { porConsulta, ultimasGestiones, ultimasObservaciones } from "@/lib/db/historial";
import { formulariosPorConsulta, getIndicaciones, idWhatsapp } from "@/lib/db/reclamos";
import { avisoConfiguracion, backendSeguimiento, getAll, getParaTablero, getRespuestas } from "@/lib/db/seguimiento";
import { herramientasDePrueba } from "@/lib/herramientas-prueba";
import { PERIODO_ANALISIS_POR_DEFECTO, calcularAnalisis, esPeriodoAnalisis } from "@/lib/seguimiento/analisis";
import { inicioDelMes, nombreMes, pendientesAnteriores } from "@/lib/seguimiento/cierre-masivo";
import { claveCliente } from "@/lib/db/sheets/maestros";
import { telegramConfigurado } from "@/lib/notificaciones/telegram";
import { proximoEnvioCierre } from "@/lib/seguimiento/cierre-del-dia";
import { TRIAJES, calcularTriaje, enTriaje, esTriaje, type Triaje } from "@/lib/seguimiento/indicadores";
import { prepararFeriados } from "@/lib/utils/feriados";
import {
  agruparPorChat,
  cierreMasFrecuente,
  claveChat,
  horasAbierta,
  ORDEN_CONSULTA_POR_DEFECTO,
  type OrdenConsulta,
  esOrdenConsulta,
  filtrar,
  filtrarPorVista,
  opciones,
  ordenar,
  prioridad,
  resumirChats,
  senalesPrioridad,
  vencida,
} from "@/lib/seguimiento/presentacion";
import { relacionActual } from "@/lib/seguimiento/relacion";
import { sincronizacionConfigurada, ultimaSincronizacion } from "@/lib/sync/planilla";
import { RELACIONES, type Consulta, type EventoHistorial, type Relacion } from "@/types/seguimiento";

export const metadata = { title: "Seguimiento de clientes · CRM De Pascale" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 15;

function texto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

export default async function SeguimientoPage({ searchParams }: PageProps<"/seguimiento">) {
  const params = await searchParams;
  const triajeParam = texto(params.triaje);
  const triaje: Triaje | null = esTriaje(triajeParam) ? triajeParam : null;
  // Cada tarjeta trae su orden: pendientes y demora, de la mas antigua a la mas
  // reciente; clientes a cuidar, las rojas primero. Elegir otro orden lo pisa.
  const ordenPorDefecto: OrdenConsulta = triaje === "riesgo" ? "relacion" : triaje ? "antiguas" : ORDEN_CONSULTA_POR_DEFECTO;
  const ordenParam = texto(params.orden);
  const orden = esOrdenConsulta(ordenParam) ? ordenParam : ordenPorDefecto;
  const relacionParam = texto(params.relacion);
  const filtroRelacion: Relacion | null = relacionParam && Object.hasOwn(RELACIONES, relacionParam) ? (relacionParam as Relacion) : null;
  // Agrupado (por defecto): cada chat (cliente + grupo de WhatsApp) junto, para
  // ver quien quedo sin respuesta. "agrupar=no" muestra la lista suelta.
  const agrupado = texto(params.agrupar) !== "no";
  const filtros = {
    busqueda: texto(params.q) ?? "",
    hito: texto(params.hito) ?? "",
    grupoVendedor: texto(params.vendedor) ?? "",
  };

  const ahora = new Date();
  // Con la base, la planilla de la empresa la trae la propia pantalla (EstadoSincronizacion):
  // al abrirse y cada 2 minutos, sin frenar la carga.
  const sincroniza = backendSeguimiento() === "postgres" && sincronizacionConfigurada();
  const lectura = await leerDatos("seguimiento y datos relacionados", () => Promise.all([
    getAll(),
    // El analisis mira tambien lo ya archivado (con Postgres la cola solo guarda lo reciente).
    getParaTablero(),
    getRespuestas(),
    porConsulta(),
    ultimasGestiones(),
    // Sin esto la tabla anda igual, solo sin la ultima observacion del cliente.
    ultimasObservaciones().catch((): Record<string, EventoHistorial> => ({})),
    getIndicaciones(),
    // Sin los FOR-03 la tabla anda igual, solo sin la referencia al reclamo formal.
    formulariosPorConsulta().catch((): Record<string, string> => ({})),
    proximoEnvioCierre(ahora).catch(() => null),
    sincroniza ? ultimaSincronizacion().catch(() => null) : Promise.resolve(null),
    // Feriados de la API para los dias habiles; si no responde queda el respaldo.
    prepararFeriados(ahora).catch(() => undefined),
  ]));
  if (lectura.error) {
    return (
      <div className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Seguimiento de clientes" etiqueta="EQUIPO COMERCIAL" descripcion="Consultas y conversaciones de clientes." />
        <ProblemaDatos fuente="seguimiento de clientes" />
      </div>
    );
  }
  const [todas, historico, catalogo, historial, gestiones, observaciones, indicaciones, formulariosReclamo, proximo, ultimaSync] = lectura.datos;
  // La bandeja principal siempre contiene solo pendientes, incluso si se abre
  // un enlace antiguo con vista=todas o vista=respondidas. El historial conserva los cierres.
  const pendientes = filtrarPorVista(todas, "pendientes");

  // Relacion vigente de cada consulta: la del cierre si ya se respondio, si no
  // la que sugiere el ultimo mensaje (IA o reglas).
  const cierreDe = (consulta: Consulta): EventoHistorial | null =>
    (historial[consulta.id] ?? []).findLast((evento) => evento.tipo === "finalizada") ?? null;
  const relaciones = new Map(todas.map((consulta) => [consulta.id, relacionActual(consulta, cierreDe(consulta))]));
  const relacionDe = (consulta: Consulta) => relaciones.get(consulta.id)?.relacion ?? "BUENA";
  const cerradaEn = (consulta: Consulta) => {
    const cierre = cierreDe(consulta);
    return cierre ? new Date(cierre.fecha) : null;
  };

  const enTarjeta = triaje
    ? pendientes.filter((consulta) => enTriaje(triaje, consulta, relacionDe(consulta), ahora))
    : pendientes;
  const filtradasPendientes = filtrar(enTarjeta, filtros).filter(
    (consulta) => !filtroRelacion || relacionDe(consulta) === filtroRelacion,
  );
  const ordenadas = ordenar(filtradasPendientes, orden, ahora, relacionDe);
  const filtradas = agrupado ? agruparPorChat(ordenadas) : ordenadas;

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaPedida = Number.parseInt(texto(params.pagina) ?? "1", 10);
  const pagina = Number.isFinite(paginaPedida)
    ? Math.min(Math.max(paginaPedida, 1), totalPaginas)
    : 1;
  const visibles = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  // Al cliente solo viaja el resumen de los chats que se ven en esta pagina.
  const resumenes = resumirChats(filtradasPendientes);
  const chatsVisibles = Object.fromEntries(
    visibles.map(claveChat).filter((clave) => resumenes[clave]).map((clave) => [clave, resumenes[clave]]),
  );
  const corteMes = inicioDelMes(ahora);
  const anteriores = pendientesAnteriores(todas, corteMes, ahora).length;

  const paramsActuales: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(params)) {
    if (clave !== "vista" && typeof valor === "string") paramsActuales[clave] = valor;
  }
  // Cada tarjeta filtra (o, si ya esta activa, quita el filtro) sin perder el resto.
  const enlaces = Object.fromEntries(
    (Object.keys(TRIAJES) as Triaje[]).map((clave) => {
      const query = new URLSearchParams(paramsActuales);
      query.delete("pagina");
      query.delete("vista");
      // El orden de la tarjeta manda (mas antiguas primero, o las rojas primero).
      query.delete("orden");
      if (triaje === clave) query.delete("triaje");
      else query.set("triaje", clave);
      const cadena = query.toString();
      return [clave, cadena ? `/seguimiento?${cadena}` : "/seguimiento"];
    }),
  ) as Record<Triaje, string>;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Seguimiento de clientes"
        etiqueta="EQUIPO COMERCIAL"
        descripcion="Solo consultas pendientes de los grupos de WhatsApp, ordenadas por clasificación del cliente (A, B, C) y prioridad. Al finalizar una conversación con su resultado y relación, desaparece de esta bandeja y queda en el historial del cliente."
        acciones={
          <>
            <ProximoEnvio proximo={proximo?.toISOString() ?? null} ahora={ahora.getTime()} telegramListo={telegramConfigurado()} />
            <BotonTelegram tipo="seguimiento" listo={telegramConfigurado()} />
            <CierreMasivo cantidad={anteriores} corte={corteMes.toISOString()} mes={nombreMes(corteMes)} />
            {sincroniza ? <EstadoSincronizacion ultima={ultimaSync} ahora={ahora.getTime()} /> : null}
            {backendSeguimiento() === "postgres" && !sincroniza && herramientasDePrueba() ? <SimularBot /> : null}
          </>
        }
      />

      {avisoConfiguracion() ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">{avisoConfiguracion()}</p>
      ) : null}

      <TriajeSeguimiento datos={calcularTriaje(todas, relacionDe, ahora, cerradaEn)} activo={triaje} enlaces={enlaces} />

      <AnalisisSeguimiento
        analisis={calcularAnalisis(historico, ahora, esPeriodoAnalisis(params.periodoAnalisis) ? params.periodoAnalisis : PERIODO_ANALISIS_POR_DEFECTO)}
        abierto={params.analisis === "1"}
        parametros={Object.fromEntries(
          Object.entries(paramsActuales).filter(([clave]) => clave !== "analisis" && clave !== "periodoAnalisis"),
        )}
      />

      <Suspense fallback={null}>
        <FiltrosSeguimiento
          orden={orden}
          ordenPorDefecto={ordenPorDefecto}
          agrupado={agrupado}
          filtros={{ ...filtros, relacion: filtroRelacion ?? "" }}
          pendientes={filtradasPendientes.length}
          opciones={{
            hito: opciones(pendientes, "hito"),
            grupoVendedor: opciones(pendientes, "grupoVendedor"),
          }}
        />
      </Suspense>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <SeguimientoTable
          atajo={cierreMasFrecuente(Object.values(historial).flat())}
          chats={chatsVisibles}
          catalogo={catalogo}
          consultas={visibles.map((consulta) => ({
            ...consulta,
            horasAbierta: horasAbierta(consulta, ahora),
            prioridad: prioridad(consulta, ahora),
            motivosPrioridad: senalesPrioridad(consulta, ahora).map((senal) => senal.etiqueta),
            vencida: vencida(consulta, ahora),
            cierre: cierreDe(consulta),
            indicacion: indicaciones[idWhatsapp(consulta.id)] ?? null,
            formularioReclamo: formulariosReclamo[consulta.id] ?? null,
            relacion: relaciones.get(consulta.id) ?? { relacion: "BUENA", origen: "reglas" },
            ultimaGestion: gestiones[claveCliente(consulta.cliente)] ?? null,
            ultimaObservacion: observaciones[claveCliente(consulta.cliente)] ?? null,
          }))}
        />
        <Paginacion
          pagina={pagina}
          totalPaginas={totalPaginas}
          mostrando={visibles.length}
          filtradas={filtradas.length}
          total={pendientes.length}
          ruta="/seguimiento"
          sustantivo="consultas"
          params={paramsActuales}
        />
      </div>
    </div>
  );
}
