import Link from "next/link";
import { Suspense } from "react";
import { EncabezadoAltas } from "@/components/solicitudes/EncabezadoAltas";
import { EvaluarPendientes } from "@/components/solicitudes/Evaluacion";
import { FiltrosSolicitudes } from "@/components/solicitudes/FiltrosSolicitudes";
import { MetricasAlta } from "@/components/solicitudes/MetricasAlta";
import { Paginacion } from "@/components/solicitudes/Paginacion";
import { SolicitudesTable } from "@/components/solicitudes/SolicitudesTable";
import { Icono } from "@/components/ui/Icono";
import { contarLista } from "@/lib/db/repositorio";
import { getAll } from "@/lib/db/solicitudes";
import { contarDocumentos } from "@/lib/solicitudes/documentos";
import { evaluacionVigente, getEvaluaciones } from "@/lib/solicitudes/evaluacion-ia";
import {
  ORDEN_POR_DEFECTO,
  RANGO_POR_DEFECTO,
  buscar,
  calcularMetricas,
  completitud,
  cuitValido,
  esOrden,
  esRango,
  etiquetaRango,
  filtrarPorRango,
  leerCampo,
  ordenar,
} from "@/lib/solicitudes/presentacion";
import { esEstado } from "@/types/solicitud";

export const metadata = { title: "Solicitudes de alta · CRM De Pascale" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 10;

function texto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

export default async function SolicitudesPage({ searchParams }: PageProps<"/solicitudes">) {
  const params = await searchParams;
  const estadoParam = texto(params.estado);
  const estado = esEstado(estadoParam) ? estadoParam : undefined;
  const busqueda = texto(params.q) ?? "";
  const rangoParam = texto(params.rango);
  const rango = esRango(rangoParam) ? rangoParam : RANGO_POR_DEFECTO;
  const ordenParam = texto(params.orden);
  const orden = esOrden(ordenParam) ? ordenParam : ORDEN_POR_DEFECTO;

  const ahora = new Date();
  const [todas, guardadas] = await Promise.all([getAll(), getEvaluaciones()]);
  const evaluaciones = new Map(todas.map((solicitud) => [solicitud.id, evaluacionVigente(solicitud, guardadas)]));
  const puntaje = (id: string) => evaluaciones.get(id)?.puntaje ?? 0;
  const sinEvaluarIA = todas.filter(
    (solicitud) => solicitud.estado === "PENDIENTE" && evaluaciones.get(solicitud.id)?.fuente !== "ia",
  ).length;

  // El rango define el universo: metricas y pestanas cuentan sobre el. La
  // pestana y la busqueda solo recortan lo que se ve en la tabla.
  const enRango = filtrarPorRango(todas, rango, ahora);
  const conteos = contarLista(enRango);
  const metricas = calcularMetricas(enRango, todas, ahora);
  const ordenadas = ordenar(
    buscar(
      estado ? enRango.filter((solicitud) => solicitud.estado === estado) : enRango,
      busqueda,
    ),
    orden,
  );
  // Mas aptas primero, pero las pendientes antes que las ya decididas.
  const filtradas =
    orden === "aptitud"
      ? ordenadas.sort(
          (a, b) =>
            Number(b.estado === "PENDIENTE") - Number(a.estado === "PENDIENTE") || puntaje(b.id) - puntaje(a.id),
        )
      : ordenadas;

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
            Formularios de empresas que quieren ser clientes. Cada uno tiene un puntaje de aptitud (0 a 100) para
            resolver primero los más prometedores; con <span className="font-medium">Evaluar con IA</span> Claude
            lee el formulario completo y justifica el puntaje. Al decidir, se arma el mail de respuesta.
          </>
        }
        acciones={
          <>
            <EvaluarPendientes sinEvaluar={sinEvaluarIA} />
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

      <MetricasAlta metricas={metricas} filtroActivo={etiquetaRango(rango, ahora)} />

      <Suspense fallback={null}>
        <FiltrosSolicitudes
          estado={estado}
          busqueda={busqueda}
          rango={rango}
          orden={orden}
          etiquetasRango={{
            "7": etiquetaRango("7", ahora),
            "30": etiquetaRango("30", ahora),
            "90": etiquetaRango("90", ahora),
            todo: etiquetaRango("todo", ahora),
          }}
          conteos={conteos}
        />
      </Suspense>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SolicitudesTable
          // Al cambiar de pagina o de filtro se arranca con la seleccion vacia.
          key={JSON.stringify(paramsActuales)}
          solicitudes={visibles.map((solicitud) => {
            const cuit = leerCampo(solicitud.datos, "cuit");
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
