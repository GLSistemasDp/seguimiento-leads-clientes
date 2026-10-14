import { Icono } from "@/components/ui/Icono";
import type { NombreIcono } from "@/components/ui/Icono";
import type { MetricasSeguimiento as Metricas } from "@/lib/seguimiento/presentacion";

type Tarjeta = {
  titulo: string;
  valor: number;
  detalle: string;
  icono: NombreIcono;
  colorIcono: string;
  colorValor: string;
};

export function MetricasSeguimiento({ metricas }: { metricas: Metricas }) {
  const tarjetas: Tarjeta[] = [
    {
      titulo: "Sin responder",
      valor: metricas.sinResponder,
      detalle:
        metricas.esperaPromedio === null
          ? "consultas en cola"
          : `esperan ${metricas.esperaPromedio.toFixed(1)} dias en promedio`,
      icono: "portapapeles",
      colorIcono: "bg-blue-100 text-blue-700",
      colorValor: "text-slate-900",
    },
    {
      titulo: "Reclamos abiertos",
      valor: metricas.reclamosAbiertos,
      detalle: "responder primero",
      icono: "alerta",
      colorIcono: "bg-red-100 text-red-600",
      colorValor: "text-red-600",
    },
    {
      titulo: "Vencidas",
      valor: metricas.vencidas,
      detalle: "con 2 dias o mas sin respuesta",
      icono: "reloj",
      colorIcono: "bg-amber-100 text-amber-700",
      colorValor: "text-amber-700",
    },
    {
      titulo: "Respondidas",
      valor: metricas.respondidas,
      detalle: "cerradas en la planilla",
      icono: "check",
      colorIcono: "bg-emerald-200 text-emerald-800",
      colorValor: "text-emerald-700",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tarjetas.map((tarjeta) => (
        <div
          key={tarjeta.titulo}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-medium text-slate-700">{tarjeta.titulo}</h2>
            <span className={`flex size-9 items-center justify-center rounded-lg ${tarjeta.colorIcono}`}>
              <Icono nombre={tarjeta.icono} className="size-5" />
            </span>
          </div>
          <p className={`mt-2 text-3xl font-semibold ${tarjeta.colorValor}`}>{tarjeta.valor}</p>
          <p className="mt-1 text-sm text-slate-500">{tarjeta.detalle}</p>
        </div>
      ))}
    </section>
  );
}
