"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { copiarCodigoFuente, copiarEmail } from "@/lib/email/clipboard";

export type CopyButtonProps = {
  html: string;
};

const MENSAJE_METODO: Record<string, string> = {
  "clipboard-api": "Mail copiado. Pegalo en el compose de tu cliente de correo.",
  execCommand: "Mail copiado (modo compatibilidad). Pegalo en el compose.",
  "texto-plano": "Solo se pudo copiar el texto plano: se perdio el formato.",
};

export function CopyButton({ html }: CopyButtonProps) {
  const { mostrar } = useToast();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const resultado = await copiarEmail(html);

    if (!resultado.ok) {
      mostrar(`No se pudo copiar: ${resultado.error ?? "error desconocido"}`, "error");
      return;
    }

    mostrar(
      MENSAJE_METODO[resultado.metodo] ?? "Mail copiado.",
      resultado.metodo === "texto-plano" ? "info" : "exito",
    );
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  async function copiarFuente() {
    const resultado = await copiarCodigoFuente(html);
    mostrar(
      resultado.ok ? "Codigo HTML copiado." : `No se pudo copiar: ${resultado.error}`,
      resultado.ok ? "exito" : "error",
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => void copiar()}>
        {copiado ? "✓ Copiado" : "Copiar mail para pegar"}
      </Button>
      <Button variante="secundario" onClick={() => void copiarFuente()}>
        Copiar codigo HTML
      </Button>
    </div>
  );
}
