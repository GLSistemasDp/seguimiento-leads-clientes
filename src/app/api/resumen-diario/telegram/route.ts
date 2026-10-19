import { NextResponse } from "next/server";
import { ErrorTelegram, enviarTelegram } from "@/lib/notificaciones/telegram";
import { resumenDeHoy } from "@/lib/seguimiento/resumen-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/resumen-diario/telegram — manda ahora el cierre del dia al grupo de Telegram (boton del Resumen). */
export const POST = async () => {
  try {
    const resumen = await resumenDeHoy();
    await enviarTelegram(resumen.texto);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar" },
      { status: error instanceof ErrorTelegram ? 503 : 500 },
    );
  }
};
