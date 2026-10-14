import { NextResponse } from "next/server";
import { porCliente } from "@/lib/db/historial";

export const runtime = "nodejs";

/** GET /api/seguimiento/historial?cliente=... — la historia del cliente, lo mas nuevo primero. */
export const GET = async (request: Request) => {
  const cliente = new URL(request.url).searchParams.get("cliente")?.trim();
  if (!cliente) {
    return NextResponse.json({ error: "Falta el parametro cliente" }, { status: 400 });
  }
  return NextResponse.json({ eventos: await porCliente(cliente) });
};
