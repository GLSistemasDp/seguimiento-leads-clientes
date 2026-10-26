"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";

const HACE = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });

function hace(fecha: string, ahora: number): string {
  const minutos = Math.round((new Date(fecha).getTime() - ahora) / 60_000);
  if (Math.abs(minutos) < 60) return HACE.format(minutos, "minute");
  const horas = Math.round(minutos / 60);
  return Math.abs(horas) < 48 ? HACE.format(horas, "hour") : HACE.format(Math.round(horas / 24), "day");
}

/**
 * Cuando se sincronizo la planilla de la empresa con la base y un boton para
 * hacerlo en el momento (ademas del activador automatico).
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

  async function sincronizar() {
    setCargando(true);
    try {
      const respuesta = await fetch("/api/seguimiento/sincronizar", { method: "POST" });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string; motivo?: string; nuevas?: number; finalizadas?: number; estado?: string };
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
      setCargando(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
      <span className={`size-1.5 rounded-full ${ultima?.estado === "ok" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
      {ultima ? `Planilla sincronizada ${hace(ultima.fecha, ahora)}` : "Planilla sin sincronizar"}
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
