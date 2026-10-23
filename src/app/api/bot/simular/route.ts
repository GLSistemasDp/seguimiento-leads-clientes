import { NextResponse } from "next/server";
import { simularMensajes } from "@/lib/bot/simulador";
import { backendSeguimiento } from "@/lib/db/seguimiento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/simular — boton "Simular bot" del Seguimiento (prototipo):
 * genera mensajes de clientes al azar y los carga por el mismo camino que el
 * bot real (`ingresarConsulta`). Cuerpo opcional: { cantidad: 1..20 }.
 */
export const POST = async (request: Request) => {
  if (backendSeguimiento() !== "postgres") {
    return NextResponse.json({ error: 'El simulador necesita SEGUIMIENTO_BACKEND="postgres".' }, { status: 409 });
  }
  const cuerpo = (await request.json().catch(() => ({}))) as { cantidad?: unknown };
  const cantidad = Math.min(20, Math.max(1, Math.round(Number(cuerpo.cantidad) || 5)));

  const { consultar } = await import("@/lib/db/postgres/pg");
  const { ingresarConsulta } = await import("@/lib/db/postgres/seguimiento");
  const clientes = await consultar<{ codigo: string; nombre: string; grupo_whatsapp: string }>(
    "SELECT codigo, nombre, grupo_whatsapp FROM clientes WHERE codigo IS NOT NULL",
  );
  if (clientes.length === 0) {
    return NextResponse.json({ error: "No hay clientes cargados para simular mensajes." }, { status: 409 });
  }

  const mensajes = simularMensajes(
    clientes.map((fila) => ({ codigo: fila.codigo, nombre: fila.nombre, grupoWhatsapp: fila.grupo_whatsapp })),
    cantidad,
  );
  for (const mensaje of mensajes) await ingresarConsulta(mensaje);
  return NextResponse.json({ insertadas: mensajes.length, hitos: mensajes.map((mensaje) => mensaje.hito) }, { status: 201 });
};
