import { Suspense } from "react";
import { FiltrosSeguimiento } from "@/components/seguimiento/FiltrosSeguimiento";
import { MetricasSeguimiento } from "@/components/seguimiento/MetricasSeguimiento";
import { SeguimientoTable } from "@/components/seguimiento/SeguimientoTable";
import { Paginacion } from "@/components/solicitudes/Paginacion";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { porConsulta } from "@/lib/db/historial";
import { getIndicaciones, idWhatsapp } from "@/lib/db/reclamos";
import { getAll, getRespuestas, origenSeguimiento } from "@/lib/db/seguimiento";
import {
  agruparPorChat,
  calcularMetricas,
  diasAbierta,
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

export const metadata = { title: "Seguimiento de clientes · CRM De Pascale" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 15;

function texto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

export default async function SeguimientoPage({ searchParams }: PageProps<"/seguimiento">) {
  const params = await searchParams;
  const vistaParam = texto(params.vista);
  // Por defecto se ve la cola de trabajo: lo que falta responder.
  const vista = esVista(vistaParam) ? vistaParam : "pendientes";
  const ordenParam = texto(params.orden);
  const orden = esOrdenConsulta(ordenParam) ? ordenParam : "prioridad";
  // Agrupado: cada chat (cliente + grupo de WhatsApp) junto, para ver quien quedo sin respuesta.
  const agrupado = texto(params.agrupar) === "chat";
  const filtros = {
    busqueda: texto(params.q) ?? "",
    hito: texto(params.hito) ?? "",
    encargado: texto(params.encargado) ?? "",
    grupoVendedor: texto(params.vendedor) ?? "",
  };

  const ahora = new Date();
  const [todas, catalogo, historial, indicaciones] = await Promise.all([
    getAll(),
    getRespuestas(),
    porConsulta(),
    getIndicaciones(),
  ]);
  const origen = origenSeguimiento();

  // Las pestanas cuentan sobre los filtros de columna, para que el numero de
  // cada una coincida con lo que se ve al tocarla.
  const filtradasSinVista = filtrar(todas, filtros);
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

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Seguimiento de clientes"
        etiqueta="EQUIPO COMERCIAL"
        descripcion="Lo que el bot levanta de los grupos de WhatsApp, priorizado: primero los reclamos y lo que más espera. Al marcar una consulta como respondida, indicá cómo quedó; queda en el historial del cliente."
      />

      {origen.aviso ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
          {origen.aviso}
        </p>
      ) : null}

      <MetricasSeguimiento metricas={calcularMetricas(todas, ahora)} />

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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SeguimientoTable
          agrupado={agrupado}
          chats={resumirChats(filtradasSinVista)}
          catalogo={catalogo}
          destino={origen.destino}
          consultas={visibles.map((consulta) => ({
            ...consulta,
            diasAbierta: diasAbierta(consulta, ahora),
            prioridad: prioridad(consulta, ahora),
            vencida: vencida(consulta, ahora),
            cierre:
              (historial[consulta.id] ?? []).findLast((evento) => evento.tipo === "finalizada") ?? null,
            indicacion: indicaciones[idWhatsapp(consulta.id)] ?? null,
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
