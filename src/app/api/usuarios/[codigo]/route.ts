import { NextResponse } from "next/server";
import { getUsuario, guardarGestionUsuario } from "@/lib/db/usuarios";
import { ErrorGestion } from "@/lib/usuarios/gestion";
import { validarCambioUsuario } from "@/lib/usuarios/validacion";

export const runtime = "nodejs";
type Contexto = { params: Promise<{ codigo: string }> };

export async function GET(_request: Request, { params }: Contexto) {
  const ficha = await getUsuario((await params).codigo);
  return ficha ? NextResponse.json({ ficha }) : NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
}

/**
 * Registra una gestion de la cuenta: `perfil`, `parte`, `pago`, `pedido`,
 * `cotizacion` o `estado-cotizacion`. Devuelve la ficha actualizada. El autor
 * lo pone el servidor con la identidad de la intranet.
 */
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
    return ficha ? NextResponse.json({ ficha }) : NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  } catch (error) {
    if (error instanceof ErrorGestion) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[usuarios] no se pudo guardar la gestión:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No se pudo guardar la gestión." }, { status: 500 });
  }
}
