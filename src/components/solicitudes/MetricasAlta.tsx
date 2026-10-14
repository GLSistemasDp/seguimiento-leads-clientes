import type { ReactNode } from "react";
import { Icono } from "@/components/ui/Icono";
import type { NombreIcono } from "@/components/ui/Icono";
import { formatearDuracion } from "@/lib/solicitudes/presentacion";
import type { Metricas } from "@/lib/solicitudes/presentacion";

type TarjetaProps = {
  titulo: string;
  icono: NombreIcono;
  colorIcono: string;
  valor: number;
  colorValor: string;
  descripcion: string;
  pie: ReactNode;
};

function Tarjeta({ titulo, icono, colorIcono, valor, colorValor, descripcion, pie }: TarjetaProps) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-700">{titulo}</h3>
        <span className={`flex size-9 items-center justify-center rounded-lg ${colorIcono}`}>
          <Icono nombre={icono} className="size-5" />
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-700">
        <span className={`mr-1.5 font-semibold ${colorValor}`}>{valor}</span>
        {descripcion}
      </p>
      <div className="mt-3 text-sm">{pie}</div>
    </div>
  );
}

export function MetricasAlta({
  metricas,
  filtroActivo,
}: {
  metricas: Metricas;
  filtroActivo: string;
}) {
  const variacion = metricas.variacionAprobadas;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-medium text-slate-900">
          <Icono nombre="grafico" className="size-5 text-blue-700" />
          Metricas de flujo de alta
        </h2>
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-slate-700">
          <Icono nombre="calendario" className="size-3.5 text-blue-700" />
          Filtro activo: <span className="font-mono text-blue-800">{filtroActivo}</span>
          <span className="size-1.5 rounded-full bg-emerald-600" />
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Tarjeta
          titulo="Solicitudes pendientes"
          icono="portapapeles"
          colorIcono="bg-blue-100 text-blue-700"
          valor={metricas.pendientes}
          colorValor="text-slate-900"
          descripcion="empresas en cola"
          pie={
            <span className="flex items-center gap-1.5 text-blue-700">
              <Icono nombre="reloj" className="size-3.5" />
              Tiempo de resolucion prom.:{" "}
              {metricas.horasResolucion === null
                ? "sin datos"
                : formatearDuracion(metricas.horasResolucion)}
            </span>
          }
        />
        <Tarjeta
          titulo="Aprobados"
          icono="check"
          colorIcono="bg-emerald-200 text-emerald-800"
          valor={metricas.aprobadas}
          colorValor="text-emerald-700"
          descripcion="activaciones exitosas"
          pie={
            <span className="flex items-center gap-1.5 text-emerald-700">
              <Icono nombre="tendencia" className="size-3.5" />
              {variacion === null
                ? `${metricas.aprobadasUltimos30} aprobadas en los ultimos 30 dias`
                : `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}% respecto al mes anterior`}
            </span>
          }
        />
        <Tarjeta
          titulo="Descartados"
          icono="cruz"
          colorIcono="bg-red-100 text-red-600"
          valor={metricas.rechazadas}
          colorValor="text-red-600"
          descripcion="inconsistencia o spam"
          pie={
            <span className="flex items-center gap-1.5 text-red-600">
              <Icono nombre="escudo" className="size-3.5" />
              {metricas.rechazadasSinCuit} sin CUIT valido / datos incompletos
            </span>
          }
        />
      </div>
    </section>
  );
}
