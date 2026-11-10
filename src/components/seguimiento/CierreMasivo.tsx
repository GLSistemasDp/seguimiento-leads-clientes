"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/**
 * Da por finalizadas de una vez las consultas pendientes de meses anteriores,
 * para que la cola quede solo con lo del mes en curso. Pide confirmacion.
 */
export function CierreMasivo({ cantidad, corte, mes }: { cantidad: number; corte: string; mes: string }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  async function cerrar() {
    setCerrando(true);
    try {
      const respuesta = await fetch("/api/seguimiento/cierre-masivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corte }),
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string; cerradas?: number };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);
      setAbierto(false);
      mostrar(
        `${cuerpo.cerradas ?? 0} consulta${cuerpo.cerradas === 1 ? "" : "s"} anterior${cuerpo.cerradas === 1 ? "" : "es"} a ${mes} quedaron finalizadas.`,
        "exito",
      );
      startTransition(() => router.refresh());
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "No se pudo hacer el cierre masivo.", "error");
    } finally {
      setCerrando(false);
    }
  }

  if (cantidad === 0) return null;

  return (
    <>
      <Button
        variante="secundario"
        onClick={() => setAbierto(true)}
        title={`Finaliza las ${cantidad} consultas pendientes que entraron antes de ${mes}`}
      >
        Cerrar anteriores a {mes.replace(/ de \d{4}$/, "")} ({cantidad})
      </Button>
      <Modal
        abierto={abierto}
        titulo="Cerrar consultas de meses anteriores"
        onCerrar={() => (cerrando ? undefined : setAbierto(false))}
        acciones={
          <>
            <Button variante="secundario" disabled={cerrando} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button disabled={cerrando} onClick={() => void cerrar()}>
              {cerrando ? "Cerrando…" : `Finalizar ${cantidad}`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 text-sm text-slate-700">
          <p>
            Se van a dar por finalizadas las <strong>{cantidad}</strong> consultas pendientes que entraron antes del 1 de{" "}
            {mes}. En la cola quedan solo las de {mes}.
          </p>
          <p>
            Cada una queda como <strong>Resuelto</strong>, con la relación que ya tenía asignada y la observación
            &quot;Cierre masivo&quot;, y pasa al historial del cliente. Si alguna hacía falta, se puede reabrir destildándola
            en la vista Respondidas.
          </p>
        </div>
      </Modal>
    </>
  );
}
