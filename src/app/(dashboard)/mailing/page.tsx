import { CentroMailing } from "@/components/mailing/CentroMailing";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { getBases, getDestinatarios, getPlantillas } from "@/lib/db/mailing";

export const metadata = { title: "Mailing · CRM De Pascale" };
export const dynamic = "force-dynamic";

export default async function MailingPage() {
  const [{ clientes, altas }, plantillas, bases] = await Promise.all([getDestinatarios(), getPlantillas(), getBases()]);
  // Se fija en el servidor para que los "dias sin comprar" coincidan en el navegador.
  const ahora = new Date().getTime();

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Mailing"
        etiqueta="EQUIPO COMERCIAL"
        descripcion="Elegí a quién y qué mandar: a la izquierda la base de destinatarios con sus filtros (quitá a mano a quien no corresponda); a la derecha la plantilla del tipo de mail, editable y con vista previa con los datos de cada cliente."
      />
      <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
        Base de clientes de ejemplo: la planilla actual no tiene mail, saldo ni fecha de última compra, que en producción
        salen del ERP. Los contactos de vendedores y distribuidores también son de ejemplo. Las altas son las del módulo de
        Solicitudes de alta.
      </p>
      <CentroMailing
        clientes={clientes}
        altas={altas}
        plantillas={plantillas}
        bases={bases}
        ahora={ahora}
        linkPlataforma={process.env.PORTAL_URL || "https://portal.depascale.com.ar"}
      />
    </div>
  );
}
