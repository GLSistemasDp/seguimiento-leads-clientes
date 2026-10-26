import { after } from "next/server";
import { Suspense } from "react";
import { ProximoEnvio } from "@/components/resumen/ProximoEnvio";
import { BotonTelegram } from "@/components/ui/BotonTelegram";
import { FiltrosSeguimiento } from "@/components/seguimiento/FiltrosSeguimiento";
import { EstadoSincronizacion } from "@/components/seguimiento/EstadoSincronizacion";
import { SimularBot } from "@/components/seguimiento/SimularBot";
import { SeguimientoTable } from "@/components/seguimiento/SeguimientoTable";
import { TriajeSeguimiento } from "@/components/seguimiento/TriajeSeguimiento";
import { Paginacion } from "@/components/solicitudes/Paginacion";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { porConsulta, ultimasGestiones } from "@/lib/db/historial";
import { getIndicaciones, idWhatsapp } from "@/lib/db/reclamos";
import { avisoConfiguracion, backendSeguimiento, getAll, getRespuestas } from "@/lib/db/seguimiento";
import { claveCliente } from "@/lib/db/sheets/maestros";
import { telegramConfigurado } from "@/lib/notificaciones/telegram";
import { proximoEnvioCierre } from "@/lib/seguimiento/cierre-del-dia";
import { TRIAJES, calcularTriaje, enTriaje, esTriaje, type Triaje } from "@/lib/seguimiento/indicadores";
import {
  agruparPorChat,
  diasAbierta,
  ORDEN_CONSULTA_POR_DEFECTO,
  esOrdenConsulta,
  esVista,
  filtrar,
  filtrarPorVista,
  opciones,
  ordenar,
  prioridad,
  resumirChats,
  vencida,
} from "@/lib/seguimiento/presentacion";
import { relacionActual } from "@/lib/seguimiento/relacion";
import { sincronizacionConfigurada, sincronizarSiHaceFalta, ultimaSincronizacion } from "@/lib/sync/planilla";
import type { Consulta, EventoHistorial } from "@/types/seguimiento";

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
  const vistaParam = texto(params.vista);
  // Por defecto se ve la cola de trabajo: lo que falta responder. Las tarjetas
  // de triaje son todas sobre lo pendiente.
  const vista = triaje ? "pendientes" : esVista(vistaParam) ? vistaParam : "pendientes";
  const ordenParam = texto(params.orden);
  const orden = esOrdenConsulta(ordenParam) ? ordenParam : ORDEN_CONSULTA_POR_DEFECTO;
  // Agrupado: cada chat (cliente + grupo de WhatsApp) junto, para ver quien quedo sin respuesta.
  const agrupado = texto(params.agrupar) === "chat";
  const filtros = {
    busqueda: texto(params.q) ?? "",
    hito: texto(params.hito) ?? "",
    encargado: texto(params.encargado) ?? "",
    grupoVendedor: texto(params.vendedor) ?? "",
  };

  const ahora = new Date();
  // Con la base, la planilla de la empresa se trae en segundo plano si hace mas de 2 minutos que no se sincroniza.
  const sincroniza = backendSeguimiento() === "postgres" && sincronizacionConfigurada();
  if (sincroniza) after(() => sincronizarSiHaceFalta(2));
  const [todas, catalogo, historial, gestiones, indicaciones, proximo, ultimaSync] = await Promise.all([
    getAll(),
    getRespuestas(),
    porConsulta(),
    ultimasGestiones(),
    getIndicaciones(),
    proximoEnvioCierre(ahora).catch(() => null),
    sincroniza ? ultimaSincronizacion().catch(() => null) : Promise.resolve(null),
  ]);

  // Relacion vigente de cada consulta: la del cierre si ya se respondio, si no
  // la que sugiere el ultimo mensaje (IA o reglas).
  const cierreDe = (consulta: Consulta): EventoHistorial | null =>
    (historial[consulta.id] ?? []).findLast((evento) => evento.tipo === "finalizada") ?? null;
  const relaciones = new Map(todas.map((consulta) => [consulta.id, relacionActual(consulta, cierreDe(consulta))]));
  const relacionDe = (consulta: Consulta) => relaciones.get(consulta.id)?.relacion ?? "BUENA";

  // Las pestanas cuentan sobre los filtros de columna (y la tarjeta activa),
  // para que el numero de cada una coincida con lo que se ve al tocarla.
  const enTarjeta = triaje ? todas.filter((consulta) => enTriaje(triaje, consulta, relacionDe(consulta), ahora)) : todas;
  const filtradasSinVista = filtrar(enTarjeta, filtros);
  const conteos = {
    pendientes: filtrarPorVista(filtradasSinVista, "pendientes").length,
    respondidas: filtrarPorVista(filtradasSinVista, "respondidas").length,
    todas: filtradasSinVista.length,
  };
  const ordenadas = ordenar(filtrarPorVista(filtradasSinVista, vista), orden, ahora);
  const filtradas = agrupado ? agruparPorChat(ordenadas) : ordenadas;

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaPedida = Number.parseInt(texto(params.pagina) ?? "1", 10);
  const pagina = Number.isFinite(paginaPedida)
    ? Math.min(Math.max(paginaPedida, 1), totalPaginas)
    : 1;
  const visibles = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const paramsActuales: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(params)) {
    if (typeof valor === "string") paramsActuales[clave] = valor;
  }
  // Cada tarjeta filtra (o, si ya esta activa, quita el filtro) sin perder el resto.
  const enlaces = Object.fromEntries(
    (Object.keys(TRIAJES) as Triaje[]).map((clave) => {
      const query = new URLSearchParams(paramsActuales);
      query.delete("pagina");
      query.delete("vista");
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
        descripcion="Las consultas de los grupos de WhatsApp, ordenadas por clasificación del cliente (A, B, C) y, dentro de cada una, por prioridad. Al finalizar una conversación indicá cómo quedó y la relación con el cliente: pasa a su historial."
        acciones={
          <>
            <ProximoEnvio proximo={proximo?.toISOString() ?? null} ahora={ahora.getTime()} telegramListo={telegramConfigurado()} />
            <BotonTelegram tipo="seguimiento" listo={telegramConfigurado()} />
            {sincroniza ? <EstadoSincronizacion ultima={ultimaSync} ahora={ahora.getTime()} /> : null}
            {backendSeguimiento() === "postgres" && !sincroniza ? <SimularBot /> : null}
          </>
        }
      />

      {avisoConfiguracion() ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">{avisoConfiguracion()}</p>
      ) : null}

      <TriajeSeguimiento datos={calcularTriaje(todas, relacionDe, ahora)} activo={triaje} enlaces={enlaces} />

      <Suspense fallback={null}>
        <FiltrosSeguimiento
          vista={vista}
          orden={orden}
          agrupado={agrupado}
          filtros={filtros}
          conteos={conteos}
          opciones={{
            hito: opciones(todas, "hito"),
            encargado: opciones(todas, "encargado"),
            grupoVendedor: opciones(todas, "grupoVendedor"),
          }}
        />
      </Suspense>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <SeguimientoTable
          agrupado={agrupado}
          vista={vista}
          chats={resumirChats(filtradasSinVista)}
          catalogo={catalogo}
          consultas={visibles.map((consulta) => ({
            ...consulta,
            diasAbierta: diasAbierta(consulta, ahora),
            prioridad: prioridad(consulta, ahora),
            vencida: vencida(consulta, ahora),
            cierre: cierreDe(consulta),
            indicacion: indicaciones[idWhatsapp(consulta.id)] ?? null,
            relacion: relaciones.get(consulta.id) ?? { relacion: "BUENA", origen: "reglas" },
            ultimaGestion: gestiones[claveCliente(consulta.cliente)] ?? null,
          }))}
        />
        <Paginacion
          pagina={pagina}
          totalPaginas={totalPaginas}
          mostrando={visibles.length}
          filtradas={filtradas.length}
          total={todas.length}
          ruta="/seguimiento"
          sustantivo="consultas"
          params={paramsActuales}
        />
      </div>
    </div>
  );
}
