"use client";

import { Button } from "@/components/ui/Button";

/** Mantiene la navegacion del dashboard ante errores no controlados de una seccion. */
export default function ErrorPagina({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <h1 className="font-semibold">No pudimos cargar esta sección.</h1>
      <p className="mt-2 text-sm">Hubo un problema al obtener los datos. Podés reintentar o continuar en otra sección.</p>
      <Button className="mt-4" variante="secundario" onClick={() => retry()}>Reintentar</Button>
    </section>
  );
}
