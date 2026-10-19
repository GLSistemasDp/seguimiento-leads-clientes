import { NextResponse } from "next/server";
import { ErrorTelegram, enviarTelegram } from "@/lib/notificaciones/telegram";
import { resumenDeHoy } from "@/lib/seguimiento/resumen-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/resumen-diario — envio automatico del cierre del dia a Telegram.
 * Lo dispara el cron de Vercel (vercel.json) o la tarea programada de la PC
 * interna. Exige `Authorization: Bearer <CRON_SECRET>`: Vercel lo agrega solo
 * cuando la variable CRON_SECRET esta configurada.
 */
export const GET = async (request: Request) => {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resumen = await resumenDeHoy();
    await enviarTelegram(resumen.texto);
    return NextResponse.json({ ok: true, sinResponder: resumen.sinResponder, demoradas: resumen.demoradas });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar" },
      { status: error instanceof ErrorTelegram ? 503 : 500 },
    );
  }
};
