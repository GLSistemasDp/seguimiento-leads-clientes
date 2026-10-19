import Link from "next/link";
import { redirect } from "next/navigation";
import { FormularioReclamo } from "@/components/reclamos/FormularioReclamo";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { formularioDeConsulta } from "@/lib/db/reclamos";
import { getById } from "@/lib/db/seguimiento";
import { separarCliente } from "@/lib/seguimiento/presentacion";
import type { NuevoReclamo } from "@/types/reclamo";

export const metadata = { title: "Nuevo reclamo · CRM De Pascale" };
export const dynamic = "force-dynamic";

const HOY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export default async function NuevoReclamoPage({ searchParams }: PageProps<"/reclamos/nuevo">) {
  const { consulta: consultaId } = await searchParams;
  const inicial: Partial<NuevoReclamo> & { fecha: string } = { fecha: HOY.format(new Date()) };

  // Desde un reclamo de WhatsApp: se precarga el cliente y lo que dijo.
  if (typeof consultaId === "string" && consultaId) {
    const existente = await formularioDeConsulta(consultaId);
    if (existente) redirect(`/reclamos/${existente}`);
    const consulta = await getById(consultaId).catch(() => null);
    if (consulta) {
      const { codigo, nombre } = separarCliente(consulta.cliente);
      Object.assign(inicial, {
        razonSocial: nombre,
        numeroCliente: codigo,
        detalle: consulta.consulta,
        consultaId: consulta.id,
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/reclamos" className="text-sm text-blue-700 hover:underline">
        ← Volver a reclamos
      </Link>
      <EncabezadoPagina
        titulo="Nuevo reclamo"
        etiqueta="FOR-03 REV04"
        descripcion={
          inicial.consultaId
            ? "Formulario precargado con el reclamo que llegó por WhatsApp. Completá lo que falte y adjuntá los comprobantes."
            : "Cargá el reclamo del cliente con los datos del formulario FOR-03. Los campos con * son obligatorios."
        }
      />
      <FormularioReclamo inicial={inicial} />
    </div>
  );
}
