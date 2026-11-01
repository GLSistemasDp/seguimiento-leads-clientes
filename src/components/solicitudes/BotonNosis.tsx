"use client";

import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";
import { linkNosis } from "@/lib/solicitudes/evaluacion";

/**
 * Abre la cuenta de Nosis Manager de la empresa en otra pestaña y deja el
 * CUIT copiado para pegarlo en el buscador. El login lo guarda el navegador:
 * con la sesion abierta entra directo.
 */
export function BotonNosis({ cuit, compacto = false }: { cuit: string; compacto?: boolean }) {
  const { mostrar } = useToast();
  const destino = linkNosis(cuit);
  if (!destino) return null;
  const digitos = cuit.replace(/\D/g, "");

  return (
    <a
      href={destino.url}
      target="_blank"
      rel="noopener noreferrer"
      title={destino.conBusqueda ? `Buscar el CUIT ${cuit} en Nosis` : `Abrir Nosis Manager con el CUIT ${cuit} copiado`}
      onClick={(evento) => {
        evento.stopPropagation();
        if (destino.conBusqueda) return;
        navigator.clipboard
          ?.writeText(digitos)
          .then(() => mostrar(`CUIT ${digitos} copiado: pegalo en el buscador de Nosis Manager (Ctrl+V).`, "info"))
          .catch(() => mostrar(`Buscá el CUIT ${digitos} en Nosis Manager.`, "info"));
      }}
      className={
        compacto
          ? "inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
          : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      }
    >
      {compacto ? "Nosis" : "Ver en Nosis Manager"}
      <Icono nombre="externo" className={compacto ? "size-3" : "size-3.5"} />
    </a>
  );
}
