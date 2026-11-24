"use client";

import { useCallback, useEffect, useState } from "react";
import { ProximoEnvio } from "@/components/resumen/ProximoEnvio";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";

type Tipo = "seguimiento" | "reclamos" | "altas";

const EXITO: Record<Tipo, string> = {
  seguimiento: "Seguimiento de chats enviado a Telegram.",
  reclamos: "Resumen de reclamos enviado a Telegram.",
  altas: "Altas pendientes enviadas a Telegram.",
};

/**
 * Fuerza el envio de la notificacion de la pantalla al grupo de Telegram, sin
 * esperar al horario programado, y permite pausar o reanudar su canal.
 */
export function BotonTelegram({
  tipo,
  listo,
  etiqueta = "Enviar a Telegram",
  className = "",
  programacion,
}: {
  tipo: Tipo;
  /** Si el bot y el chat de ese tipo estan configurados. */
  listo: boolean;
  etiqueta?: string;
  className?: string;
  programacion?: { proximo: string | null; ahora: number; compacto?: boolean };
}) {
  const { mostrar } = useToast();
  const [enviando, setEnviando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<"cargando" | "activo" | "pausado" | "error">("cargando");
  const pausado = estado === "pausado";

  const consultarEstado = useCallback(async (signal?: AbortSignal) => {
    try {
      const respuesta = await fetch(`/api/notificaciones/${tipo}`, { cache: "no-store", signal });
      const cuerpo = await respuesta.json() as { pausado?: boolean; error?: string };
      if (!respuesta.ok || typeof cuerpo.pausado !== "boolean") {
        throw new Error(cuerpo.error ?? "No se pudo consultar el estado del bot.");
      }
      if (!signal?.aborted) setEstado(cuerpo.pausado ? "pausado" : "activo");
    } catch (error) {
      if (signal?.aborted) return;
      setEstado("error");
      mostrar(error instanceof Error ? error.message : "No se pudo consultar el estado del bot.", "error");
    }
  }, [tipo, mostrar]);

  useEffect(() => {
    const controller = new AbortController();
    void consultarEstado(controller.signal);
    return () => controller.abort();
  }, [consultarEstado]);

  async function cambiarPausa() {
    if (estado === "error") {
      setEstado("cargando");
      await consultarEstado();
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/notificaciones/${tipo}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pausado: !pausado }),
      });
      const cuerpo = await respuesta.json() as { pausado?: boolean; error?: string };
      if (!respuesta.ok || typeof cuerpo.pausado !== "boolean") {
        throw new Error(cuerpo.error ?? "No se pudo guardar el estado del bot.");
      }
      setEstado(cuerpo.pausado ? "pausado" : "activo");
      mostrar(cuerpo.pausado ? "Bot pausado. Los envíos de esta sección quedan detenidos." : "Bot reanudado.", "exito");
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "No se pudo guardar el estado del bot.", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function enviar() {
    setEnviando(true);
    try {
      const respuesta = await fetch(`/api/notificaciones/${tipo}`, { method: "POST" });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string; mensajes?: number; pausado?: boolean };
      if (cuerpo.pausado) setEstado("pausado");
      if (!respuesta.ok) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);
      const mensajes = cuerpo.mensajes ?? 1;
      mostrar(mensajes > 1 ? `${EXITO[tipo]} (${mensajes} mensajes)` : EXITO[tipo], "exito");
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "No se pudo enviar.", "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      {programacion && (estado === "activo" || pausado) ? (
        <ProximoEnvio {...programacion} telegramListo={listo} pausado={pausado} />
      ) : pausado ? (
        <span role="status" className="text-sm font-medium text-amber-800">Bot pausado</span>
      ) : null}
      <Button
        disabled={!listo || enviando || guardando || estado !== "activo"}
        title={pausado ? "Reanudá el bot para enviar a Telegram" : listo ? "Manda el mensaje ahora, sin esperar el horario programado" : "Falta configurar el bot de Telegram (ver DEPLOY.md)"}
        onClick={() => void enviar()}
        className={`bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 ${className}`}
      >
        <Icono nombre="chat" className="size-4" />
        {enviando ? "Enviando…" : etiqueta}
      </Button>
      <Button
        variante="secundario"
        disabled={guardando || enviando || estado === "cargando"}
        aria-pressed={pausado}
        title={pausado ? "Reanuda los envíos de Telegram de esta sección" : "Detiene los envíos de Telegram de esta sección hasta que lo reanudes"}
        onClick={() => void cambiarPausa()}
        className={pausado ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" : ""}
      >
        <Icono nombre={pausado ? "reproducir" : "pausa"} className="size-4" />
        {guardando ? "Guardando…" : estado === "cargando" ? "Cargando bot…" : estado === "error" ? "Reintentar estado" : pausado ? "Reanudar bot" : "Pausar bot"}
      </Button>
    </div>
  );
}
