import { Icono } from "@/components/ui/Icono";
import type { NombreIcono } from "@/components/ui/Icono";
import { formatearDuracion, nombreMes } from "@/lib/solicitudes/presentacion";
import type { Comparacion, Metricas } from "@/lib/solicitudes/presentacion";

type TarjetaProps = {
  titulo: string;
  icono: NombreIcono;
  colorIcono: string;
  colorValor: string;
  comparacion: Comparacion;
  /** Texto de la comparacion: "vs octubre", "al cierre de octubre". */
  referencia: string;
  /** true si que suba es bueno (aprobadas); false si es malo (pendientes, descartadas). */
  subirEsBueno: boolean;
  pie?: string;
};

function Tarjeta({ titulo, icono, colorIcono, colorValor, comparacion, referencia, subirEsBueno, pie }: TarjetaProps) {
  const { actual, anterior } = comparacion;
  const diferencia = actual - anterior;
  const bien = diferencia === 0 ? null : diferencia > 0 === subirEsBueno;
  const estilo = bien === null ? "bg-slate-100 text-slate-600" : bien ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-600">{titulo}</h3>
        <span className={`flex size-9 items-center justify-center rounded-lg ${colorIcono}`}>
          <Icono nombre={icono} className="size-5" />
        </span>
      </div>
      <p className={`mt-2 text-5xl leading-none font-bold tracking-tight tabular-nums ${colorValor}`}>{actual}</p>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${estilo}`}>
          {diferencia > 0 ? "▲" : diferencia < 0 ? "▼" : "="} {diferencia === 0 ? "igual" : Math.abs(diferencia)}
        </span>
        <span>
          {referencia}: <span className="font-medium text-slate-700 tabular-nums">{anterior}</span>
        </span>
      </p>
      {pie ? <p className="mt-1 text-xs text-slate-400">{pie}</p> : null}
    </div>
  );
}

/** Tres numeros grandes del mes, cada uno contra el mes anterior. */
export function MetricasAlta({ metricas }: { metricas: Metricas }) {
  const mes = nombreMes(metricas.mes);
  const anterior = nombreMes(metricas.mesAnterior);

  return (
    <section className="grid gap-4 md:grid-cols-3">
      <Tarjeta
        titulo={`Altas aprobadas en ${mes}`}
        icono="check"
        colorIcono="bg-emerald-100 text-emerald-700"
        colorValor="text-emerald-700"
        comparacion={metricas.aprobadas}
        referencia={`vs ${anterior}`}
        subirEsBueno
      />
      <Tarjeta
        titulo="Pendientes de revisar"
        icono="portapapeles"
        colorIcono="bg-blue-100 text-blue-700"
        colorValor="text-[#1b2b5e]"
        comparacion={metricas.pendientes}
        referencia={`al cierre de ${anterior}`}
        subirEsBueno={false}
        pie={
          metricas.horasResolucion === null
            ? undefined
            : `Se resuelven en ${formatearDuracion(metricas.horasResolucion)} en promedio`
        }
      />
      <Tarjeta
        titulo={`Descartadas en ${mes}`}
        icono="cruz"
        colorIcono="bg-red-100 text-red-600"
        colorValor="text-red-600"
        comparacion={metricas.rechazadas}
        referencia={`vs ${anterior}`}
        subirEsBueno={false}
      />
    </section>
  );
}
