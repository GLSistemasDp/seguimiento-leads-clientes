"use client";

import type { ReactNode } from "react";

export type Tab = {
  id: string;
  etiqueta: ReactNode;
};

export type TabsProps = {
  tabs: readonly Tab[];
  activo: string;
  onCambio: (id: string) => void;
};

export function Tabs({ tabs, activo, onCambio }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const seleccionado = tab.id === activo;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={seleccionado}
            onClick={() => onCambio(tab.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              seleccionado
                ? "border-blue-700 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
