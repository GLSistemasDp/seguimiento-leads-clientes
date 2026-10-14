"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type ModalProps = {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  /** Botonera del pie (confirmar / cancelar). */
  acciones?: ReactNode;
  /** Ancho del panel: "md" para confirmaciones, "xl" para visores con contenido. */
  ancho?: "md" | "lg" | "xl";
};

const ANCHOS = {
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
} as const;

export function Modal({ abierto, titulo, onCerrar, children, acciones, ancho = "md" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    function alPresionar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alPresionar);
    panelRef.current?.focus();

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", alPresionar);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) onCerrar();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full ${ANCHOS[ancho]} flex-col rounded-lg bg-white p-5 shadow-xl focus:outline-none`}
      >
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        <div className="mt-3 min-h-0 overflow-y-auto text-sm text-slate-600">{children}</div>
        {acciones ? <div className="mt-5 flex justify-end gap-2">{acciones}</div> : null}
      </div>
    </div>
  );
}
