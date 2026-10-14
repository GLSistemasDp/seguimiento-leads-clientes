const ZONA = "America/Argentina/Buenos_Aires";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatearFecha(fecha: Date | string | null | undefined): string {
  if (!fecha) return "—";
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (Number.isNaN(valor.getTime())) return "—";
  return FORMATO_FECHA.format(valor);
}

export function formatearFechaHora(fecha: Date | string | null | undefined): string {
  if (!fecha) return "—";
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (Number.isNaN(valor.getTime())) return "—";
  return FORMATO_FECHA_HORA.format(valor);
}

const FORMATO_DIA_CORTO = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const FORMATO_HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function aFecha(fecha: Date | string | null | undefined): Date | null {
  if (!fecha) return null;
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  return Number.isNaN(valor.getTime()) ? null : valor;
}

/** "24 Oct 2024": el mes abreviado, con mayuscula y sin punto. */
export function formatearDiaCorto(fecha: Date | string | null | undefined): string {
  const valor = aFecha(fecha);
  if (!valor) return "—";
  const partes = FORMATO_DIA_CORTO.formatToParts(valor);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((item) => item.type === tipo)?.value ?? "";
  const mes = parte("month").replace(".", "");
  return `${parte("day")} ${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${parte("year")}`;
}

/** "09:30 hs". */
export function formatearHora(fecha: Date | string | null | undefined): string {
  const valor = aFecha(fecha);
  return valor ? `${FORMATO_HORA.format(valor)} hs` : "—";
}
