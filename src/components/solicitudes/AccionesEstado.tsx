"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cambiarEstado } from "@/components/solicitudes/cambiar-estado";
import { etiquetaEstado } from "@/components/solicitudes/EstadoBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { Estado } from "@/types/solicitud";

export type AccionesEstadoProps = {
  id: string;
  nombre: string;
  estado: Estado;
};

export function AccionesEstado({ id, nombre, estado }: AccionesEstadoProps) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pendiente, setPendiente] = useState<Estado | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function aplicar(nuevoEstado: Estado) {
    setGuardando(true);
    const resultado = await cambiarEstado(id, nuevoEstado);
    setGuardando(false);

    if (!resultado.ok) {
      mostrar(`No se pudo actualizar: ${resultado.error}`, "error");
      return;
    }
    mostrar(`${nombre} quedo como ${etiquetaEstado(nuevoEstado).toLowerCase()}.`, "exito");
    router.refresh();
  }

  function pedirCambio(nuevoEstado: Estado) {
    if (estado === "PENDIENTE") {
      void aplicar(nuevoEstado);
      return;
    }
    setPendiente(nuevoEstado);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={guardando || estado === "APROBADO"}
          onClick={() => pedirCambio("APROBADO")}
        >
          Aprobar
        </Button>
        <Button
          variante="peligro"
          disabled={guardando || estado === "RECHAZADO"}
          onClick={() => pedirCambio("RECHAZADO")}
        >
          Rechazar
        </Button>
        {estado !== "PENDIENTE" ? (
          <Button
            variante="secundario"
            disabled={guardando}
            onClick={() => pedirCambio("PENDIENTE")}
          >
            Volver a pendiente
          </Button>
        ) : null}
      </div>

      <Modal
        abierto={pendiente !== null}
        titulo="Cambiar el estado"
        onCerrar={() => setPendiente(null)}
        acciones={
          <>
            <Button variante="secundario" onClick={() => setPendiente(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!pendiente) return;
                const nuevoEstado = pendiente;
                setPendiente(null);
                void aplicar(nuevoEstado);
              }}
            >
              Si, cambiar
            </Button>
          </>
        }
      >
        {pendiente ? (
          <p>
            Esta solicitud ya figura como {etiquetaEstado(estado).toLowerCase()}. Queres pasarla a{" "}
            {etiquetaEstado(pendiente).toLowerCase()}?
          </p>
        ) : null}
      </Modal>
    </>
  );
}
