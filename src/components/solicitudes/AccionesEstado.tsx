"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cambiarEstado } from "@/components/solicitudes/cambiar-estado";
import type { DatosRechazo } from "@/components/solicitudes/cambiar-estado";
import { etiquetaEstado } from "@/components/solicitudes/EstadoBadge";
import { ModalDecision, requiereConfirmacion } from "@/components/solicitudes/ModalDecision";
import { Button } from "@/components/ui/Button";
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

  async function aplicar(nuevoEstado: Estado, rechazo?: DatosRechazo) {
    setGuardando(true);
    const resultado = await cambiarEstado(id, nuevoEstado, rechazo);
    setGuardando(false);

    if (!resultado.ok) {
      mostrar(`No se pudo actualizar: ${resultado.error}`, "error");
      return;
    }
    mostrar(`${nombre} quedo como ${etiquetaEstado(nuevoEstado).toLowerCase()}.`, "exito");
    router.refresh();
  }

  function pedirCambio(nuevoEstado: Estado) {
    if (!requiereConfirmacion(estado, nuevoEstado)) {
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

      <ModalDecision
        cambio={pendiente ? { nombre, estadoActual: estado, nuevoEstado: pendiente } : null}
        onCancelar={() => setPendiente(null)}
        onConfirmar={(rechazo) => {
          if (!pendiente) return;
          const nuevoEstado = pendiente;
          setPendiente(null);
          void aplicar(nuevoEstado, rechazo);
        }}
      />
    </>
  );
}
