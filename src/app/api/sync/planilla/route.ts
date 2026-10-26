import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sincronizarPlanilla } from "@/lib/sync/planilla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La primera carga puede traer todo el historico de la planilla.
export const maxDuration = 300;

/** Acepta SYNC_TOKEN (activador de Google Apps Script) o CRON_SECRET (cron de Vercel). */
function autorizado(request: Request): boolean {
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  return [process.env.SYNC_TOKEN, process.env.CRON_SECRET].some((clave) => {
    if (!clave) return false;
    const esperado = Buffer.from(`Bearer ${clave}`);
    return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
  });
}

async function sincronizar(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const resultado = await sincronizarPlanilla();
    return NextResponse.json(resultado, { status: resultado.estado === "ok" || resultado.estado === "omitida" ? 200 : 500 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(`[sync-planilla] ${mensaje}`);
    return NextResponse.json({ estado: "error", motivo: mensaje }, { status: 500 });
  }
}

/**
 * POST /api/sync/planilla — trae lo nuevo de la planilla de la empresa a
 * Postgres (clientes, consultas nuevas y tildes). Lo llama el activador de
 * Google Apps Script cada pocos minutos; GET es para el cron de Vercel.
 * Authorization: Bearer <SYNC_TOKEN o CRON_SECRET>
 */
export const POST = sincronizar;
export const GET = sincronizar;
