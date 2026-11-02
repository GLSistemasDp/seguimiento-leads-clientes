import type { ReactNode } from "react";

/**
 * Explicacion de una linea al pasar el mouse o al llegar con el teclado (Tab).
 * A diferencia de `title`, aparece al instante y con el estilo del panel.
 * `lado` elige si se abre arriba o abajo, segun cuanto lugar haya.
 */
export function Pista({ texto, children, lado = "arriba" }: { texto: string; children: ReactNode; lado?: "arriba" | "abajo" }) {
  return (
    <span tabIndex={0} className="group/pista relative inline-flex cursor-help rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
      {children}
      <span className="sr-only">: {texto}</span>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 z-30 w-max max-w-64 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs leading-snug font-normal text-white normal-case opacity-0 shadow-lg transition-opacity duration-100 group-hover/pista:opacity-100 group-focus-visible/pista:opacity-100 ${
          lado === "arriba" ? "bottom-full mb-1.5" : "top-full mt-1.5"
        }`}
      >
        {texto}
      </span>
    </span>
  );
}
