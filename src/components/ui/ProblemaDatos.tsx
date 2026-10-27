"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function ProblemaDatos({ fuente }: { fuente: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <div>
        <p className="font-semibold">Hubo un problema al leer los datos de {fuente}.</p>
        <p>Los datos de esta sección no están disponibles. Revisá el acceso y el formato de la planilla e intentá nuevamente.</p>
      </div>
      <Button variante="secundario" tamano="sm" disabled={pendiente} onClick={() => iniciar(() => router.refresh())}>
        {pendiente ? "Reintentando…" : "Reintentar"}
      </Button>
    </div>
  );
}
