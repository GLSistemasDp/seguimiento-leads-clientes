import Link from "next/link";
import { notFound } from "next/navigation";
import { FichaUsuarioPanel } from "@/components/usuarios/FichaUsuarioPanel";
import { getUsuario } from "@/lib/db/usuarios";
import { hoyArgentina } from "@/lib/usuarios/analisis";
import { simularFichaUsuario } from "@/lib/usuarios/simulacion";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/usuarios/[codigo]">) {
  const ficha = await getUsuario((await params).codigo);
  return { title: `${ficha?.nombre || "Cliente USUARIO"} · CRM De Pascale` };
}

export default async function FichaUsuarioPage({ params, searchParams }: PageProps<"/usuarios/[codigo]">) {
  const ficha = await getUsuario((await params).codigo);
  if (!ficha) notFound();
  const simulacion = (await searchParams).simulacion === "1";
  const hoy = hoyArgentina();
  return <div className="flex flex-col gap-5 pb-8">
    <Link href={simulacion ? "/usuarios?simulacion=1" : "/usuarios"} className="self-start text-sm text-slate-500 hover:text-slate-900">← Volver a clientes USUARIOS</Link>
    <FichaUsuarioPanel key={`${ficha.codigo}:${simulacion}`} inicial={simulacion ? simularFichaUsuario(ficha, hoy) : ficha} hoy={hoy} simulacion={simulacion} />
  </div>;
}
