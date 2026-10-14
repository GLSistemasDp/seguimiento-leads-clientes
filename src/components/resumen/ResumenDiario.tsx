"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/**
 * Cierre del dia para WhatsApp. En el MVP se abre WhatsApp con el mensaje
 * escrito (wa.me) y alguien lo envia; el envio automatico al terminar el dia
 * queda para cuando la tarea programada de la PC interna llame a
 * /api/resumen-diario.
 */
export function ResumenDiario({
  texto,
  numero,
  datos,
}: {
  texto: string;
  /** Solo digitos con codigo de pais; vacio = WhatsApp pregunta a quien. */
  numero: string;
  datos: { etiqueta: string; valor: number; color: string }[];
}) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const enlace = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      mostrar("Resumen copiado. Pegalo en el grupo de WhatsApp.", "exito");
    } catch {
      mostrar("No se pudo copiar: seleccioná el texto a mano.", "error");
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <Icono nombre="chat" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">Cierre del día por WhatsApp</h2>
          <p className="text-sm text-slate-600">
            Estado final de los chats y las consultas con un día o más de demora, listo para mandar.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {datos.map((dato) => (
          <div key={dato.etiqueta} className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{dato.etiqueta}</dt>
            <dd className={`text-xl font-semibold tabular-nums ${dato.color}`}>{dato.valor}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button variante="secundario" onClick={() => setAbierto(true)}>
          <Icono nombre="ojo" className="size-4" />
          Ver mensaje
        </Button>
        <Button variante="secundario" onClick={() => void copiar()}>
          <Icono nombre="copiar" className="size-4" />
          Copiar
        </Button>
        <a
          href={enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Icono nombre="externo" className="size-4" />
          Enviar por WhatsApp
        </a>
      </div>

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
        <pre className="rounded-lg bg-[#e7ffdb] p-4 font-sans text-sm whitespace-pre-wrap text-slate-900">{texto}</pre>
      </Modal>
    </section>
  );
}
