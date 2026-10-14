"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono } from "@/components/ui/Icono";
import type { NombreIcono } from "@/components/ui/Icono";

const OPCIONES: { href: string; etiqueta: string; icono: NombreIcono }[] = [
  { href: "/solicitudes", etiqueta: "Solicitudes", icono: "lista" },
  { href: "/solicitudes/importar", etiqueta: "Importar Excel", icono: "subir" },
  { href: "/solicitudes/plantillas", etiqueta: "Plantillas de mail", icono: "mail" },
];

/** Importar y Plantillas viven dentro de Solicitudes de alta. */
export function SubmenuAltas() {
  const pathname = usePathname();
  const actual = OPCIONES.find((opcion) => opcion.href !== "/solicitudes" && pathname.startsWith(opcion.href))?.href ?? "/solicitudes";

  return (
    <nav aria-label="Solicitudes de alta" className="flex flex-wrap gap-1 border-t border-slate-100 pt-3">
      {OPCIONES.map((opcion) => (
        <Link
          key={opcion.href}
          href={opcion.href}
          aria-current={actual === opcion.href ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
            actual === opcion.href
              ? "border-[#1b2b5e] bg-[#1b2b5e] font-medium text-white"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Icono nombre={opcion.icono} className="size-3.5" />
          {opcion.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
