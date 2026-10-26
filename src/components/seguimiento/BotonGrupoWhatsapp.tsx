"use client";

import { useToast } from "@/components/ui/Toast";
import { linkGrupoValido } from "@/lib/seguimiento/presentacion";

/**
 * Abre el grupo de WhatsApp del cliente. Con el link de invitacion de la
 * planilla va directo al grupo; sin link, WhatsApp no permite abrir un grupo
 * por su nombre: se copia el nombre y se abre WhatsApp Web para buscarlo.
 */
export function BotonGrupoWhatsapp({ grupo, link }: { grupo: string; link: string }) {
  const { mostrar } = useToast();
  const directo = linkGrupoValido(link);
  const clase =
    "inline-flex max-w-full items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 ring-inset hover:bg-slate-50";

  if (directo) {
    return (
      <a href={directo} target="_blank" rel="noopener noreferrer" title={`Abrir el grupo ${grupo}`} className={clase}>
        <span aria-hidden="true" className="text-emerald-500">●</span>
        <span className="truncate">Abrir grupo</span>
      </a>
    );
  }
  if (!grupo) return null;

  async function buscar() {
    try {
      await navigator.clipboard.writeText(grupo);
      mostrar("Nombre del grupo copiado: pegalo en el buscador de WhatsApp.", "info");
    } catch {
      mostrar(`Buscá el grupo "${grupo}" en WhatsApp.`, "info");
    }
    window.open("https://web.whatsapp.com/", "_blank", "noopener");
  }

  return (
    <button type="button" onClick={() => void buscar()} title={`${grupo} · copia el nombre y abre WhatsApp Web`} className={clase}>
      <span aria-hidden="true" className="text-emerald-500">●</span>
      <span className="truncate">{grupo}</span>
    </button>
  );
}
