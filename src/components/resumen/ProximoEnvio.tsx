"use client";

import { useEffect, useState } from "react";
import { Icono } from "@/components/ui/Icono";

const FORMATO = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

function faltan(ms: number): string {
  const minutos = Math.max(0, Math.round(ms / 60_000));
  if (minutos < 1) return "en instantes";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas >= 24) return `en ${Math.floor(horas / 24)} d ${horas % 24} h`;
  return horas > 0 ? `en ${horas} h ${String(resto).padStart(2, "0")} min` : `en ${resto} min`;
}

/**
 * Cuenta regresiva hasta el proximo envio automatico del resumen al grupo de
 * Telegram. `ahora` llega del servidor para que el primer render coincida.
 */
export function ProximoEnvio({
  proximo,
  ahora: ahoraInicial,
  telegramListo,
  compacto = false,
}: {
  /** ISO del proximo envio, o null si no hay uno programado. */
  proximo: string | null;
  ahora: number;
  telegramListo: boolean;
  compacto?: boolean;
}) {
  const [ahora, setAhora] = useState(ahoraInicial);

  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(intervalo);
  }, []);

  if (!telegramListo) {
    return <p className="text-xs text-slate-400">Envío automático a Telegram: sin configurar.</p>;
  }
  if (!proximo) return <p className="text-xs text-slate-400">No hay envíos programados en los próximos días.</p>;

  const destino = new Date(proximo);
  const restante = destino.getTime() - ahora;
  const esHoy = DIA.format(destino) === DIA.format(new Date(ahora));
  const cuando = FORMATO.format(destino);
  const etiqueta = esHoy ? `hoy ${cuando.split(" ").pop()}` : cuando;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 text-sky-900 ${
        compacto ? "px-2.5 py-1 text-xs" : "px-3 py-2 text-sm"
      }`}
      title="El cron de Vercel puede demorar hasta unos minutos (en el plan Hobby, hasta 59 min)."
    >
      <Icono nombre="reloj" className="size-4 shrink-0 text-sky-600" />
      <span>
        Próximo resumen al grupo: <strong className="font-semibold">{etiqueta} hs</strong>
        <span className="text-sky-700"> · {restante > 0 ? faltan(restante) : "enviándose"}</span>
      </span>
    </div>
  );
}
