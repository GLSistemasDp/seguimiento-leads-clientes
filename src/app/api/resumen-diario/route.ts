import { NextResponse } from "next/server";
import { numeroResumen, resumenDeHoy } from "@/lib/seguimiento/resumen-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/resumen-diario — el mensaje de cierre del dia y el link de
 * WhatsApp para mandarlo. Pensado para que la tarea programada de la PC
 * interna (la misma que corre el bot) lo pida al final del dia y lo envie.
 */
export const GET = async () => {
  try {
    const resumen = await resumenDeHoy();
    const numero = numeroResumen();
    const whatsapp = `https://wa.me/${numero}?text=${encodeURIComponent(resumen.texto)}`;
    return NextResponse.json({ ...resumen, whatsapp });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo armar el resumen" },
      { status: 500 },
    );
  }
};
