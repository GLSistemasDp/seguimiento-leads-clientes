"use client";

import { useState } from "react";
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
 * esperar al horario programado (POST /api/notificaciones/:tipo).
 */
export function BotonTelegram({
  tipo,
  listo,
  etiqueta = "Enviar a Telegram",
  className = "",
}: {
  tipo: Tipo;
  /** Si el bot y el chat de ese tipo estan configurados. */
  listo: boolean;
  etiqueta?: string;
  className?: string;
}) {
  const { mostrar } = useToast();
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    try {
      const respuesta = await fetch(`/api/notificaciones/${tipo}`, { method: "POST" });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string; mensajes?: number };
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
    <Button
      disabled={!listo || enviando}
      title={listo ? "Manda el mensaje ahora, sin esperar el horario programado" : "Falta configurar el bot de Telegram (ver DEPLOY.md)"}
      onClick={() => void enviar()}
      className={`bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 ${className}`}
    >
      <Icono nombre="flecha" className="size-4" />
      {enviando ? "Enviando…" : etiqueta}
    </Button>
  );
}
