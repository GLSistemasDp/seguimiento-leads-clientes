"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Selector } from "@/components/ui/Selector";
import { PERIODOS } from "@/lib/seguimiento/tablero";
import type { Periodo } from "@/lib/seguimiento/tablero";

function conTodos(etiqueta: string, valores: string[]): Record<string, string> {
  return Object.fromEntries([["", etiqueta], ...valores.map((valor) => [valor, valor])]);
}

/** Periodo, encargado y grupo vendedor: una sola fila arriba de todo el tablero. */
export function FiltrosTablero({
  periodo,
  encargado,
  vendedor,
  opciones,
}: {
  periodo: Periodo;
  encargado: string;
  vendedor: string;
  opciones: { encargado: string[]; vendedor: string[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navegar(clave: "periodo" | "encargado" | "vendedor", valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    const consulta = params.toString();
    router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Periodo">
        {(Object.keys(PERIODOS) as Periodo[]).map((clave) => (
          <button
            key={clave}
            type="button"
            aria-pressed={clave === periodo}
            onClick={() => navegar("periodo", clave === "14" ? "" : clave)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              clave === periodo ? "bg-blue-700 font-medium text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {PERIODOS[clave]}
          </button>
        ))}
      </div>
      <div className="min-w-48">
        <Selector
          icono="usuario"
          etiqueta="Encargado"
          valor={encargado}
          opciones={conTodos("Todos los encargados", opciones.encargado)}
          onCambiar={(valor) => navegar("encargado", valor)}
        />
      </div>
      <div className="min-w-56">
        <Selector
          icono="lista"
          etiqueta="Grupo vendedor"
          valor={vendedor}
          opciones={conTodos("Todos los grupos vendedores", opciones.vendedor)}
          onCambiar={(valor) => navegar("vendedor", valor)}
        />
      </div>
    </div>
  );
}
