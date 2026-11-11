import Link from "next/link";
import { Icono } from "@/components/ui/Icono";

export function BotonSimularUsuarios({ activo, ruta }: { activo: boolean; ruta: string }) {
  return <Link
    href={activo ? ruta : `${ruta}?simulacion=1`}
    scroll={false}
    prefetch={false}
    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activo ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "border-[#1b2b5e] bg-[#1b2b5e] text-white hover:bg-blue-900"}`}
  >
    <Icono nombre={activo ? "restablecer" : "chispa"} />
    {activo ? "Volver a datos guardados" : "Simular todos los datos"}
  </Link>;
}
