"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type TipoToast = "exito" | "error" | "info";

type Toast = {
  id: number;
  tipo: TipoToast;
  mensaje: string;
};

type ContextoToast = {
  mostrar: (mensaje: string, tipo?: TipoToast) => void;
};

const Contexto = createContext<ContextoToast | null>(null);

const ESTILOS: Record<TipoToast, string> = {
  exito: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-slate-200 bg-white text-slate-700",
};

const DURACION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const mostrar = useCallback((mensaje: string, tipo: TipoToast = "info") => {
    const id = Date.now() + Math.random();
    setToasts((previos) => [...previos, { id, tipo, mensaje }]);
    setTimeout(() => {
      setToasts((previos) => previos.filter((toast) => toast.id !== id));
    }, DURACION_MS);
  }, []);

  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-md ${ESTILOS[toast.tipo]}`}
          >
            {toast.mensaje}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useToast(): ContextoToast {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error("useToast tiene que usarse dentro de <ToastProvider>");
  }
  return contexto;
}
