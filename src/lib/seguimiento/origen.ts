import "server-only";
import { backendSeguimiento } from "@/lib/db/seguimiento";
import { huella } from "@/lib/seguimiento/huella";

/** Una prueba o una planilla anterior no debe aportar gestiones a la fuente actual. */
export function clavePorOrigen(clave: string): string {
  const backend = backendSeguimiento();
  if (backend === "sheets") {
    return `${clave}-sheets-${huella(process.env.SEGUIMIENTO_SHEETS_ID ?? "")}`;
  }
  return backend === "demo" ? `${clave}-demo` : clave;
}
