import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { AvisoUsuarios } from "@/components/usuarios/Compartidos";
import { CarteraUsuarios } from "@/components/usuarios/CarteraUsuarios";
import { BotonSimularUsuarios } from "@/components/usuarios/BotonSimularUsuarios";
import { getUsuarios } from "@/lib/db/usuarios";
import { hoyArgentina } from "@/lib/usuarios/analisis";
import { simularFichaUsuario } from "@/lib/usuarios/simulacion";

export const metadata = { title: "Clientes USUARIOS · CRM De Pascale" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage({ searchParams }: PageProps<"/usuarios">) {
  const simulacion = (await searchParams).simulacion === "1";
  const hoy = hoyArgentina();
  const fichas = await getUsuarios();
  return <div className="flex flex-col gap-5 pb-8">
    <EncabezadoPagina titulo="Clientes USUARIOS" etiqueta="GESTIÓN COMERCIAL INTERNA" descripcion="La situación de cada gran cuenta en un solo lugar: compras, oportunidades, cobranzas y relación con el cliente." acciones={<BotonSimularUsuarios activo={simulacion} ruta="/usuarios" />} />
    <AvisoUsuarios simulacion={simulacion} />
    <CarteraUsuarios key={String(simulacion)} fichas={simulacion ? fichas.map((f) => simularFichaUsuario(f, hoy)) : fichas} hoy={hoy} simulacion={simulacion} />
  </div>;
}
