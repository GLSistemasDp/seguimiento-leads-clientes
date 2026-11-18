import { redirect } from "next/navigation";
import { getUsuario } from "@/lib/db/usuarios";

export const dynamic = "force-dynamic";

/**
 * Los links a una cuenta (por ejemplo desde Mailing) abren el CRM con esa
 * cuenta elegida; si el codigo ya no existe, el resumen de la cartera.
 */
export default async function FichaUsuarioPage({ params }: PageProps<"/usuarios/[codigo]">) {
  const ficha = await getUsuario(decodeURIComponent((await params).codigo));
  redirect(ficha ? `/usuarios?cliente=${encodeURIComponent(ficha.codigo)}` : "/usuarios");
}
