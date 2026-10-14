import type { Estado } from "@/types/solicitud";

const ESTILOS: Record<Estado, string> = {
  PENDIENTE: "border-amber-200 bg-amber-50 text-amber-800",
  APROBADO: "border-emerald-200 bg-emerald-50 text-emerald-800",
  RECHAZADO: "border-red-200 bg-red-50 text-red-700",
};

const PUNTOS: Record<Estado, string> = {
  PENDIENTE: "bg-amber-500",
  APROBADO: "bg-emerald-600",
  RECHAZADO: "bg-red-500",
};

const ETIQUETAS: Record<Estado, string> = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
};

export function EstadoBadge({ estado }: { estado: Estado }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${ESTILOS[estado]}`}
    >
      <span className={`size-1.5 rounded-full ${PUNTOS[estado]}`} />
      {ETIQUETAS[estado]}
    </span>
  );
}

export function etiquetaEstado(estado: Estado): string {
  return ETIQUETAS[estado];
}
