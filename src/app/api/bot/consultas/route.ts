import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { backendSeguimiento } from "@/lib/db/seguimiento";
import type { EntradaBot } from "@/lib/db/postgres/seguimiento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAXIMO = 200;

function autorizado(request: Request): boolean {
  const token = process.env.BOT_TOKEN;
  if (!token) return false;
  const esperado = Buffer.from(`Bearer ${token}`);
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

function texto(valor: unknown, maximo: number): string | undefined {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, maximo) : undefined;
}

/**
 * POST /api/bot/consultas — destino del bot de WhatsApp: cada mensaje que
 * detecta en un grupo entra a la cola `consultas_seguimiento`.
 *
 * Authorization: Bearer <BOT_TOKEN>
 * Cuerpo: { consultas: [{ cliente, consulta, hito?, fecha?, encargado?, grupoWhatsapp?, mensajeId? }] }
 * (o un solo objeto). `mensajeId` evita duplicados si el bot reintenta.
 */
export const POST = async (request: Request) => {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (backendSeguimiento() !== "postgres") {
    return NextResponse.json({ error: 'El seguimiento no está en Postgres (SEGUIMIENTO_BACKEND="postgres").' }, { status: 409 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const lista = Array.isArray((cuerpo as { consultas?: unknown })?.consultas)
    ? ((cuerpo as { consultas: unknown[] }).consultas)
    : [cuerpo];
  if (lista.length === 0 || lista.length > MAXIMO) {
    return NextResponse.json({ error: `Mandá entre 1 y ${MAXIMO} consultas.` }, { status: 400 });
  }

  const entradas: EntradaBot[] = [];
  for (const [indice, item] of lista.entries()) {
    const datos = (item ?? {}) as Record<string, unknown>;
    const cliente = texto(datos.cliente, 200);
    const consulta = texto(datos.consulta, 4000);
    const fecha = texto(datos.fecha, 40);
    if (!cliente || !consulta) {
      return NextResponse.json({ error: `Consulta ${indice + 1}: faltan cliente o consulta.` }, { status: 400 });
    }
    if (fecha && Number.isNaN(Date.parse(fecha))) {
      return NextResponse.json({ error: `Consulta ${indice + 1}: fecha inválida.` }, { status: 400 });
    }
    entradas.push({
      cliente,
      consulta,
      fecha,
      hito: texto(datos.hito, 60),
      encargado: texto(datos.encargado, 60),
      grupoWhatsapp: texto(datos.grupoWhatsapp, 200),
      mensajeId: texto(datos.mensajeId, 200),
    });
  }

  // Cada mensaje pasa por el clasificador (IA o reglas) antes de entrar a la cola.
  const { clasificarVarios } = await import("@/lib/ia/clasificador");
  const clasificaciones = await clasificarVarios(entradas.map((entrada) => ({ texto: entrada.consulta, hito: entrada.hito })));
  const { ingresarConsulta } = await import("@/lib/db/postgres/seguimiento");
  const ids: string[] = [];
  let duplicadas = 0;
  for (const [indice, entrada] of entradas.entries()) {
    const id = await ingresarConsulta({ ...entrada, ia: clasificaciones[indice] });
    if (id) ids.push(id);
    else duplicadas += 1;
  }
  return NextResponse.json({ insertadas: ids.length, duplicadas, ids }, { status: 201 });
};
