import "server-only";
import { delDia } from "@/lib/db/historial";
import { getPanel } from "@/lib/db/reclamos";
import { getAll } from "@/lib/db/seguimiento";
import { armarResumenDiario } from "@/lib/seguimiento/resumen-diario";
import type { ResumenDiario } from "@/lib/seguimiento/resumen-diario";
import { diaLocal } from "@/lib/seguimiento/tablero";

/** Junta los datos del dia y arma el mensaje. Lo usan la pantalla y /api/resumen-diario. */
export async function resumenDeHoy(ahora = new Date()): Promise<ResumenDiario> {
  const [consultas, eventosHoy, panel] = await Promise.all([
    getAll(),
    delDia(diaLocal(ahora), diaLocal),
    getPanel(ahora),
  ]);
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return armarResumenDiario({
    consultas,
    eventosHoy,
    reclamos: panel.reclamos,
    ahora,
    enlace: base ? `${base}/seguimiento` : undefined,
  });
}

/** Numero (solo digitos, con codigo de pais) al que abre WhatsApp; vacio = elegir contacto. */
export function numeroResumen(): string {
  return (process.env.RESUMEN_WHATSAPP_NUMERO ?? "").replace(/\D/g, "");
}
