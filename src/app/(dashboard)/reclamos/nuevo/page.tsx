import { redirect } from "next/navigation";
import { formularioDeConsulta } from "@/lib/db/reclamos";
import { getById } from "@/lib/db/seguimiento";
import { separarCliente } from "@/lib/seguimiento/presentacion";

export const dynamic = "force-dynamic";

/**
 * Los reclamos se cargan siempre con el formulario del cliente
 * (/formularios/reclamo). Desde un reclamo de WhatsApp llega precargado con
 * el cliente; si ese reclamo ya tiene formulario, se abre ese.
 */
export default async function NuevoReclamoPage({ searchParams }: PageProps<"/reclamos/nuevo">) {
  const { consulta: consultaId } = await searchParams;
  if (typeof consultaId !== "string" || !consultaId) redirect("/formularios/reclamo");

  const existente = await formularioDeConsulta(consultaId);
  if (existente) redirect(`/reclamos/${existente}`);

  const consulta = await getById(consultaId).catch(() => null);
  if (!consulta) redirect("/formularios/reclamo");
  const { codigo, nombre } = separarCliente(consulta.cliente);
  redirect(`/formularios/reclamo?${new URLSearchParams({ razon: nombre, cliente: codigo, ref: consulta.id }).toString()}`);
}
