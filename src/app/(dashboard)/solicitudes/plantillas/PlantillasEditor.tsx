"use client";

import { useMemo, useState } from "react";
import { EmailPreview } from "@/components/generador/EmailPreview";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { buildEmailHtml, PLACEHOLDERS } from "@/lib/email/build-email-html";
import type { PlantillaEmail, TipoPlantilla } from "@/types/plantilla";

/** Datos de ejemplo para que la vista previa muestre algo realista. */
const EJEMPLO = {
  nombre: "Juan Perez",
  email: "juan.perez@ejemplo.com",
  usuario: "juanperez",
  password: "Ej3mplo-Clave",
  texto_generico: "Este es el texto que el equipo escribe al generar cada mail.",
};

const TABS = [
  { id: "aprobado", etiqueta: "Aprobado" },
  { id: "rechazado", etiqueta: "Rechazado" },
] as const;

type Borrador = Pick<
  PlantillaEmail,
  "asunto" | "cuerpoHtml" | "headerImg" | "headerAlt" | "footerImg" | "footerAlt"
>;

function aBorrador(plantilla: PlantillaEmail): Borrador {
  return {
    asunto: plantilla.asunto,
    cuerpoHtml: plantilla.cuerpoHtml,
    headerImg: plantilla.headerImg ?? "",
    headerAlt: plantilla.headerAlt ?? "",
    footerImg: plantilla.footerImg ?? "",
    footerAlt: plantilla.footerAlt ?? "",
  };
}

export function PlantillasEditor({ plantillas }: { plantillas: readonly PlantillaEmail[] }) {
  const { mostrar } = useToast();
  const [activa, setActiva] = useState<TipoPlantilla>("aprobado");
  const [guardando, setGuardando] = useState(false);
  const [borradores, setBorradores] = useState<Record<string, Borrador>>(() =>
    Object.fromEntries(plantillas.map((plantilla) => [plantilla.tipo, aBorrador(plantilla)])),
  );

  const plantilla = plantillas.find((item) => item.tipo === activa);
  const borrador = borradores[activa];

  const vistaPrevia = useMemo(() => {
    if (!plantilla || !borrador) return null;
    return buildEmailHtml({ ...plantilla, ...borrador }, EJEMPLO);
  }, [plantilla, borrador]);

  if (!plantilla || !borrador || !vistaPrevia) {
    return <p className="text-sm text-slate-500">No se encontro la plantilla.</p>;
  }

  function editar(campo: keyof Borrador, valor: string) {
    setBorradores((previos) => ({
      ...previos,
      [activa]: { ...previos[activa], [campo]: valor },
    }));
  }

  async function guardar() {
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/plantillas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: activa, ...borrador }),
      });

      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
        mostrar(cuerpo?.error ?? `Error ${respuesta.status} al guardar.`, "error");
        return;
      }
      mostrar("Plantilla guardada.", "exito");
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "Error al guardar.", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Tabs
        tabs={TABS}
        activo={activa}
        onCambio={(id) => setActiva(id as TipoPlantilla)}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Input
            label="Asunto"
            value={borrador.asunto}
            onChange={(evento) => editar("asunto", evento.target.value)}
          />

          <Textarea
            label="Cuerpo (HTML)"
            rows={14}
            className="font-mono text-xs"
            value={borrador.cuerpoHtml}
            onChange={(evento) => editar("cuerpoHtml", evento.target.value)}
            ayuda={
              <span>
                Placeholders disponibles:{" "}
                {PLACEHOLDERS.map((clave) => `{{${clave}}}`).join(", ")}
              </span>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Imagen de encabezado (URL)"
              value={borrador.headerImg ?? ""}
              placeholder="https://…"
              onChange={(evento) => editar("headerImg", evento.target.value)}
            />
            <Input
              label="Texto alternativo del encabezado"
              value={borrador.headerAlt ?? ""}
              onChange={(evento) => editar("headerAlt", evento.target.value)}
            />
            <Input
              label="Imagen de pie (URL)"
              value={borrador.footerImg ?? ""}
              placeholder="https://…"
              onChange={(evento) => editar("footerImg", evento.target.value)}
            />
            <Input
              label="Texto alternativo del pie"
              value={borrador.footerAlt ?? ""}
              onChange={(evento) => editar("footerAlt", evento.target.value)}
            />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <Button disabled={guardando} onClick={() => void guardar()}>
              {guardando ? "Guardando…" : "Guardar plantilla"}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs text-slate-500">
            Vista previa con datos de ejemplo.
          </p>
          <EmailPreview html={vistaPrevia.html} asunto={vistaPrevia.asunto} />
        </div>
      </div>
    </div>
  );
}
