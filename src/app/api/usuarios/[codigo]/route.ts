import { NextResponse } from "next/server";
import { getUsuario, guardarGestionUsuario } from "@/lib/db/usuarios";
import { validarCambioUsuario } from "@/lib/usuarios/validacion";

export const runtime = "nodejs";
type Contexto = { params: Promise<{ codigo: string }> };

export async function GET(_request: Request, { params }: Contexto) {
  const ficha = await getUsuario((await params).codigo);
  return ficha ? NextResponse.json({ ficha }) : NextResponse.json({ error: "Cliente USUARIO no encontrado." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Contexto) {
  let cambio;
  try {
    cambio = validarCambioUsuario(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos." }, { status: 400 });
  }
  try {
    const autor = process.env.PORTAL_USUARIO || process.env.INTRANET_USUARIO || "Equipo comercial";
    const ficha = await guardarGestionUsuario((await params).codigo, cambio, autor);
    return ficha ? NextResponse.json({ ficha }) : NextResponse.json({ error: "Cliente USUARIO no encontrado." }, { status: 404 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "No se pudo guardar la gestión.";
    const invalido = mensaje.includes("no pertenece") || mensaje.includes("saldo pendiente") || mensaje.includes("Falta el motivo");
    return NextResponse.json({ error: mensaje }, { status: invalido ? 400 : 500 });
  }
}
