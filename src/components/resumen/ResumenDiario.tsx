"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/**
 * Cierre del dia para el grupo de Telegram de gerencia. Se puede mandar a
 * mano desde aca; el envio automatico lo hace el cron (/api/cron/resumen-diario).
 */
export function ResumenDiario({
  texto,
  telegramListo,
  datos,
}: {
  /** Formato WhatsApp/Telegram (*negrita*). */
  texto: string;
  /** Si estan TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID. */
  telegramListo: boolean;
  datos: { etiqueta: string; valor: number; color: string }[];
}) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      mostrar("Resumen copiado.", "exito");
    } catch {
      mostrar("No se pudo copiar: seleccioná el texto a mano.", "error");
    }
  }

  async function enviar() {
    setEnviando(true);
    try {
      const respuesta = await fetch("/api/resumen-diario/telegram", { method: "POST" });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);
      mostrar("Resumen enviado al grupo de Telegram.", "exito");
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "No se pudo enviar.", "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white">
          <Icono nombre="chat" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">Cierre del día por Telegram</h2>
          <p className="text-sm text-slate-600">Estado final de los chats y lo demorado, para el grupo de gerencia.</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {datos.map((dato) => (
          <div key={dato.etiqueta} className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{dato.etiqueta}</dt>
            <dd className={`text-xl font-semibold tabular-nums ${dato.color}`}>{dato.valor}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!telegramListo || enviando}
          title={telegramListo ? undefined : "Falta configurar TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID"}
          onClick={() => void enviar()}
          className="bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300"
        >
          <Icono nombre="flecha" className="size-4" />
          {enviando ? "Enviando…" : "Enviar a Telegram"}
        </Button>
        <Button variante="secundario" onClick={() => setAbierto(true)}>
          <Icono nombre="ojo" className="size-4" />
          Ver mensaje
        </Button>
        <Button variante="fantasma" onClick={() => void copiar()}>
          <Icono nombre="copiar" className="size-4" />
          Copiar
        </Button>
      </div>
      <p className="text-xs text-slate-400">
        {telegramListo
          ? "Además se envía solo a las 13:00 y 17:00, de lunes a viernes hábiles."
          : "Telegram todavía no está configurado: el mensaje se puede ver y copiar."}
      </p>

      <Modal
        abierto={abierto}
        ancho="lg"
        titulo="Mensaje de cierre del día"
        onCerrar={() => setAbierto(false)}
        acciones={
          <>
            <Button variante="secundario" onClick={() => setAbierto(false)}>
              Cerrar
            </Button>
            <Button onClick={() => void copiar()}>
              <Icono nombre="copiar" className="size-3.5" />
              Copiar
            </Button>
          </>
        }
      >
        <pre className="rounded-lg bg-sky-50 p-4 font-sans text-sm whitespace-pre-wrap text-slate-900">{texto}</pre>
      </Modal>
    </section>
  );
}
