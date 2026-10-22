"use client";

import { useState } from "react";
import { ProximoEnvio } from "@/components/resumen/ProximoEnvio";
import { BotonTelegram } from "@/components/ui/BotonTelegram";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/**
 * Seguimiento de chats para el grupo de Telegram: un mensaje con el resumen y
 * uno por prioridad (reclamos, pedidos nuevos, refacturar, resto). Se puede
 * mandar a mano desde aca; el envio automatico lo hace /api/cron/cierre-del-dia.
 */
export function ResumenDiario({
  textos,
  telegramListo,
  datos,
  proximo,
  ahora,
}: {
  /** ISO del proximo envio automatico. */
  proximo: string | null;
  ahora: number;
  /** Mensajes tal como salen (formato *negrita* y [texto](link)). */
  textos: string[];
  /** Si estan el token del bot y el chat de seguimiento. */
  telegramListo: boolean;
  datos: { etiqueta: string; valor: number; color: string }[];
}) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const texto = textos.join("\n\n— — —\n\n");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      mostrar("Resumen copiado.", "exito");
    } catch {
      mostrar("No se pudo copiar: seleccioná el texto a mano.", "error");
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white">
          <Icono nombre="chat" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">Seguimiento de chats por Telegram</h2>
          <p className="text-sm text-slate-600">
            {textos.length > 1
              ? `${textos.length} mensajes priorizados: resumen, reclamos, pedidos nuevos, refacturar y el resto.`
              : "Sin consultas pendientes en este corte."}
          </p>
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
        <BotonTelegram tipo="seguimiento" listo={telegramListo} />
        <Button variante="secundario" onClick={() => setAbierto(true)}>
          <Icono nombre="ojo" className="size-4" />
          Ver mensajes
        </Button>
        <Button variante="fantasma" onClick={() => void copiar()}>
          <Icono nombre="copiar" className="size-4" />
          Copiar
        </Button>
      </div>
      <ProximoEnvio proximo={proximo} ahora={ahora} telegramListo={telegramListo} compacto />

      <Modal
        abierto={abierto}
        ancho="lg"
        titulo="Mensajes del seguimiento de chats"
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
        <div className="flex flex-col gap-3">
          {textos.map((mensaje, indice) => (
            <pre key={indice} className="rounded-lg bg-sky-50 p-4 font-sans text-sm whitespace-pre-wrap text-slate-900">
              {mensaje}
            </pre>
          ))}
        </div>
      </Modal>
    </section>
  );
}
