"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FormularioIndicacion } from "@/components/reclamos/FormularioIndicacion";
import { useToast } from "@/components/ui/Toast";
import type { Indicacion } from "@/types/reclamo";

/** La indicacion del gerente al pie del detalle de un formulario FOR-03. */
export function AccionReclamo({ id, inicial }: { id: string; inicial: Indicacion | null }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();

  return (
    <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold tracking-wide text-blue-700 uppercase">Definición del gerente</p>
      <h2 className="mt-1 text-lg font-semibold">Acción para el vendedor</h2>
      <p className="mt-1 mb-5 text-sm text-slate-500">Indicá cómo debe continuar la gestión de este reclamo.</p>
      <FormularioIndicacion
        reclamoId={id}
        inicial={inicial}
        onGuardado={() => {
          mostrar("Indicación guardada para el vendedor.", "exito");
          startTransition(() => router.refresh());
        }}
      />
    </section>
  );
}
