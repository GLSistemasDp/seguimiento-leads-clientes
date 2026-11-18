import { CuentasClave } from "@/components/usuarios/CuentasClave";
import { getPlantillas } from "@/lib/db/mailing";
import { getUsuarios } from "@/lib/db/usuarios";
import { hoyArgentina } from "@/lib/usuarios/analisis";

export const metadata = { title: "Cuentas clave · CRM De Pascale" };
export const dynamic = "force-dynamic";

/**
 * CRM de cuentas clave (clientes USUARIOS): resumen de la cartera y la ficha
 * del cliente elegido en el menu desplegable. `?cliente=<codigo>` abre un
 * cliente directo.
 */
export default async function UsuariosPage({ searchParams }: PageProps<"/usuarios">) {
  const cliente = (await searchParams).cliente;
  const [fichas, plantillas] = await Promise.all([getUsuarios(), getPlantillas()]);
  return <CuentasClave fichas={fichas} plantillas={plantillas} hoy={hoyArgentina()} inicial={typeof cliente === "string" ? cliente : undefined} />;
}
