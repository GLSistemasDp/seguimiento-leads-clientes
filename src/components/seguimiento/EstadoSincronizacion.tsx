"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";

const HACE = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });

function hace(fecha: string, ahora: number): string {
  const minutos = Math.round((new Date(fecha).getTime() - ahora) / 60_000);
  if (Math.abs(minutos) < 60) return HACE.format(minutos, "minute");
  const horas = Math.round(minutos / 60);
  return Math.abs(horas) < 48 ? HACE.format(horas, "hour") : HACE.format(Math.round(horas / 24), "day");
}

/** Cada cuanto se fija si el bot cargo algo nuevo mientras la pantalla esta abierta. */
const INTERVALO_MS = 2 * 60_000;

type RespuestaSync = { error?: string; motivo?: string; nuevas?: number; finalizadas?: number; estado?: string };

/**
 * Cuando se sincronizo la planilla de la empresa con la base y un boton para
 * hacerlo en el momento. Ademas sincroniza sola: al abrir la pantalla y cada
 * 2 minutos mientras esta a la vista, sin frenar la carga. Si el bot cargo
 * mensajes nuevos (o se tildaron en la planilla), la lista se actualiza.
 */
export function EstadoSincronizacion({
  ultima,
  ahora,
}: {
  ultima: { fecha: string; estado: string; nuevas: number } | null;
  ahora: number;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  const [cargando, setCargando] = useState(false);
  const enCurso = useRef(false);

  useEffect(() => {
    async function automatica() {
      if (enCurso.current || document.visibilityState !== "visible") return;
      enCurso.current = true;
      try {
        const respuesta = await fetch("/api/seguimiento/sincronizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siHaceFalta: true }),
        });
        const cuerpo = (await respuesta.json().catch(() => ({}))) as RespuestaSync;
        const nuevas = cuerpo.nuevas ?? 0;
        if (respuesta.ok && cuerpo.estado === "ok" && (nuevas > 0 || (cuerpo.finalizadas ?? 0) > 0)) {
          if (nuevas > 0) mostrar(`Llegaron ${nuevas} consulta${nuevas === 1 ? "" : "s"} nueva${nuevas === 1 ? "" : "s"} del bot.`, "info");
          startTransition(() => router.refresh());
        }
      } catch {
        // Sin conexion: se reintenta en la proxima vuelta; el boton sigue disponible.
      } finally {
        enCurso.current = false;
      }
    }
    void automatica();
    const intervalo = window.setInterval(() => void automatica(), INTERVALO_MS);
    document.addEventListener("visibilitychange", automatica);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", automatica);
    };
  }, [mostrar, router]);

  async function sincronizar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setCargando(true);
    try {
      const respuesta = await fetch("/api/seguimiento/sincronizar", { method: "POST" });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as RespuestaSync;
      if (!respuesta.ok) throw new Error(cuerpo.error ?? cuerpo.motivo ?? `Error ${respuesta.status}`);
      mostrar(
        cuerpo.estado === "omitida"
          ? (cuerpo.motivo ?? "Sincronización omitida.")
          : `Planilla sincronizada: ${cuerpo.nuevas ?? 0} consultas nuevas, ${cuerpo.finalizadas ?? 0} tildadas.`,
        "exito",
      );
      startTransition(() => router.refresh());
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "No se pudo sincronizar.", "error");
    } finally {
      enCurso.current = false;
      setCargando(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
      <span className={`size-1.5 rounded-full ${ultima?.estado === "ok" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
      <span role={ultima?.estado === "error" ? "alert" : undefined}>
        {ultima?.estado === "error"
          ? "Hubo un problema con los datos de Sheets. Se muestran los datos guardados en la base."
          : ultima ? `Planilla sincronizada ${hace(ultima.fecha, ahora)}` : "Planilla sin sincronizar"}
      </span>
      <button
        type="button"
        onClick={() => void sincronizar()}
        disabled={cargando}
        className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-950 disabled:opacity-50"
      >
        <Icono nombre="restablecer" className={`size-3.5 ${cargando ? "animate-spin" : ""}`} />
        {cargando ? "Sincronizando…" : "Sincronizar ahora"}
      </button>
    </span>
  );
}
