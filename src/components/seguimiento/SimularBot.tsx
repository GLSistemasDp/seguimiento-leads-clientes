"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";

/**
 * Prototipo: carga mensajes inventados por el mismo camino que el bot de
 * WhatsApp, para probar la cola mientras el bot real sigue en la planilla.
 */
export function SimularBot() {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  const [cargando, setCargando] = useState(false);

  async function simular() {
    setCargando(true);
    try {
      const respuesta = await fetch("/api/bot/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad: 5 }),
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string; insertadas?: number };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);
      mostrar(`El bot simulado cargó ${cuerpo.insertadas} mensajes nuevos.`, "exito");
      startTransition(() => router.refresh());
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "No se pudo simular.", "error");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Button variante="secundario" disabled={cargando} onClick={() => void simular()} title="Prototipo: genera 5 mensajes como si llegaran del bot de WhatsApp">
      <Icono nombre="chispa" className="size-4" />
      {cargando ? "Simulando…" : "Simular bot"}
    </Button>
  );
}
