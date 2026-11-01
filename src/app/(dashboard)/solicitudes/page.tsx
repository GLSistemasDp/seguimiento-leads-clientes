import { leerDatos } from "@/lib/db/lectura";
import { ProblemaDatos } from "@/components/ui/ProblemaDatos";
import Link from "next/link";
import { EncabezadoAltas } from "@/components/solicitudes/EncabezadoAltas";
import { InformeAltas } from "@/components/solicitudes/InformeAltas";
import { MetricasAlta } from "@/components/solicitudes/MetricasAlta";
import { Paginacion } from "@/components/solicitudes/Paginacion";
import { SolicitudesTable } from "@/components/solicitudes/SolicitudesTable";
import { BotonTelegram } from "@/components/ui/BotonTelegram";
import { CopiarLink } from "@/components/ui/CopiarLink";
import { Icono } from "@/components/ui/Icono";
import { ultimasDecisiones } from "@/lib/db/decisiones-alta";
import { getAll } from "@/lib/db/solicitudes";
import { telegramConfigurado } from "@/lib/notificaciones/telegram";
import { contarDocumentos } from "@/lib/solicitudes/documentos";
import { evaluarPorReglas } from "@/lib/solicitudes/evaluacion";
import { calcularInformeAltas, esPeriodoInformeAltas } from "@/lib/solicitudes/informe";
import {
  VISTAS,
  calcularMetricas,
  completitud,
  cuitValido,
  esVista,
  fechaDecidida,
  leerCampo,
} from "@/lib/solicitudes/presentacion";
import type { Vista } from "@/lib/solicitudes/presentacion";
import type { DecisionAlta } from "@/types/solicitud";

export const metadata = { title: "Solicitudes de alta · CRM De Pascale" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 10;

function texto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

export default async function SolicitudesPage({ searchParams }: PageProps<"/solicitudes">) {
  const params = await searchParams;
  const vistaParam = texto(params.vista);
  const vista: Vista = esVista(vistaParam) ? vistaParam : "pendientes";

  const ahora = new Date();
  const [lectura, decisiones] = await Promise.all([
    leerDatos("solicitudes", getAll),
    // Sin el historial de decisiones la pantalla anda igual, solo sin motivos de rechazo.
    ultimasDecisiones().catch((): Record<string, DecisionAlta> => ({})),
  ]);
  if (lectura.error) {
    return (
      <div className="flex flex-col gap-6">
        <EncabezadoAltas descripcion="Formularios de empresas que quieren ser clientes." />
        <ProblemaDatos fuente="solicitudes de alta" />
      </div>
    );
  }
  const todas = lectura.datos;
  const evaluaciones = new Map(todas.map((solicitud) => [solicitud.id, evaluarPorReglas(solicitud)]));
  const puntaje = (id: string) => evaluaciones.get(id)?.puntaje ?? 0;

  const pendientes = todas.filter((solicitud) => solicitud.estado === "PENDIENTE");
  const decididas = todas.filter((solicitud) => solicitud.estado !== "PENDIENTE");
  const conteos: Record<Vista, number> = { pendientes: pendientes.length, historial: decididas.length };
  // Pendientes: las mas completas primero (son las que se pueden resolver ya).
  // Historial: la ultima decision arriba.
  const filtradas =
    vista === "pendientes"
      ? [...pendientes].sort((a, b) => puntaje(b.id) - puntaje(a.id) || b.fechaImportacion.getTime() - a.fechaImportacion.getTime())
      : [...decididas].sort((a, b) => fechaDecidida(b).getTime() - fechaDecidida(a).getTime());

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
    <div className="flex flex-col gap-6 pb-24">
      <EncabezadoAltas
        descripcion={
          <>
            Formularios de empresas que quieren ser clientes. La clasificación sale de cuánto completaron: datos,
            direcciones, referencias, los 8 documentos y la firma. Cuanto más completo, más arriba. Al decidir, se
            arma el mail de respuesta.
          </>
        }
        acciones={
          <>
            <BotonTelegram tipo="altas" listo={telegramConfigurado("altas")} etiqueta="Pendientes a Telegram" />
            <CopiarLink ruta="/formularios/alta" etiqueta="Link del formulario de alta" />
            <Link
              href="/solicitudes/importar"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800"
            >
              <Icono nombre="subir" />
              Importar Excel
            </Link>
          </>
        }
      />

      <MetricasAlta metricas={calcularMetricas(todas, ahora)} />

      <InformeAltas
        informe={calcularInformeAltas(todas, decisiones, ahora, esPeriodoInformeAltas(params.periodoInforme) ? params.periodoInforme : "todo")}
        abierto={params.informe === "1"}
        parametros={Object.fromEntries(
          Object.entries(paramsActuales).filter(([clave]) => clave !== "informe" && clave !== "periodoInforme" && clave !== "pagina"),
        )}
      />

      <nav aria-label="Vista" className="flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
        {(Object.keys(VISTAS) as Vista[]).map((clave) => (
          <Link
            key={clave}
            href={clave === "pendientes" ? "/solicitudes" : `/solicitudes?vista=${clave}`}
            aria-current={vista === clave ? "page" : undefined}
            className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
              vista === clave ? "bg-white font-semibold text-blue-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {VISTAS[clave]} ({conteos[clave]})
          </Link>
        ))}
      </nav>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SolicitudesTable
          // Al cambiar de pagina o de filtro se arranca con la seleccion vacia.
          key={JSON.stringify(paramsActuales)}
          vista={vista}
          solicitudes={visibles.map((solicitud) => {
            const cuit = leerCampo(solicitud.datos, "cuit");
            const decision = decisiones[solicitud.id];
            return {
              id: solicitud.id,
              nombre: solicitud.nombre,
              email: solicitud.email,
              estado: solicitud.estado,
              fechaImportacion: solicitud.fechaImportacion,
              cuit,
              cuitValido: cuitValido(cuit),
              rubro: leerCampo(solicitud.datos, "rubro"),
              provincia: leerCampo(solicitud.datos, "provincia"),
              completitud: completitud(solicitud.datos),
              datos: solicitud.datos,
              documentos: contarDocumentos(solicitud.datos),
              evaluacion: evaluaciones.get(solicitud.id)!,
              fechaDecision: solicitud.estado === "PENDIENTE" ? null : fechaDecidida(solicitud),
              motivoRechazo: solicitud.estado === "RECHAZADO" && decision?.estado === "RECHAZADO" ? decision.motivo : null,
              comentarioDecision: decision?.estado === solicitud.estado ? decision.comentario : "",
            };
          })}
        />
        <Paginacion
          pagina={pagina}
          totalPaginas={totalPaginas}
          mostrando={visibles.length}
          filtradas={filtradas.length}
          total={todas.length}
          ruta="/solicitudes"
          params={paramsActuales}
        />
      </div>
    </div>
  );
}
