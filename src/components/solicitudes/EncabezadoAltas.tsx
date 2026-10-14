import type { ReactNode } from "react";
import { SubmenuAltas } from "@/components/solicitudes/SubmenuAltas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

/** Encabezado comun de Solicitudes de alta, con el submenu Solicitudes / Importar / Plantillas. */
export function EncabezadoAltas({ descripcion, acciones }: { descripcion: ReactNode; acciones?: ReactNode }) {
  return (
    <EncabezadoPagina titulo="Solicitudes de alta" etiqueta="EQUIPO COMERCIAL" descripcion={descripcion} acciones={acciones}>
      <SubmenuAltas />
    </EncabezadoPagina>
  );
}
