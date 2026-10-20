import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protege la intranet con usuario y contrasena (HTTP Basic) cuando estan
 * INTRANET_USUARIO e INTRANET_PASSWORD. Sin esas variables no pide nada
 * (como la demo actual).
 *
 * Quedan afuera, por el `matcher`: los formularios publicos que completan los
 * clientes (/formularios/* y /api/publico/*), el cron (que tiene su propia
 * clave) y los archivos estaticos de Next.
 *
 * Es una proteccion simple hasta tener el login del portal con roles.
 */

function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i += 1) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

export function proxy(request: NextRequest) {
  const usuario = process.env.INTRANET_USUARIO;
  const password = process.env.INTRANET_PASSWORD;
  if (!usuario || !password) return NextResponse.next();

  const encabezado = request.headers.get("authorization") ?? "";
  if (encabezado.startsWith("Basic ")) {
    try {
      const [recibido, ...resto] = atob(encabezado.slice(6)).split(":");
      if (iguales(recibido, usuario) && iguales(resto.join(":"), password)) return NextResponse.next();
    } catch {
      // Encabezado mal formado: se vuelve a pedir.
    }
  }

  return new NextResponse("Acceso restringido a la intranet de De Pascale.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Intranet De Pascale", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!formularios|api/publico|api/cron|_next/static|_next/image|favicon\\.ico).*)"],
};
