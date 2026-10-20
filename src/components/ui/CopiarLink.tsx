"use client";

import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";

/**
 * Copia el link de un formulario publico para mandarselo al cliente. La URL
 * se arma al hacer clic con el dominio desde donde se usa la intranet.
 */
export function CopiarLink({
  ruta,
  etiqueta,
  variante = "boton",
}: {
  /** "/formularios/reclamo?razon=...". */
  ruta: string;
  etiqueta: string;
  variante?: "boton" | "enlace";
}) {
  const { mostrar } = useToast();

  async function copiar() {
    const url = `${window.location.origin}${ruta}`;
    try {
      await navigator.clipboard.writeText(url);
      mostrar("Link copiado. Pegalo en el chat o el mail del cliente.", "exito");
    } catch {
      window.prompt("Copiá el link para el cliente:", url);
    }
  }

  if (variante === "enlace") {
    return (
      <button type="button" onClick={() => void copiar()} className="text-left text-xs font-medium text-blue-700 hover:underline">
        {etiqueta}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void copiar()}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <Icono nombre="copiar" />
      {etiqueta}
    </button>
  );
}
