"use client";

import { ANCHO_EMAIL } from "@/lib/email/templates";

export type EmailPreviewProps = {
  html: string;
  asunto: string;
};

/**
 * Vista previa en un iframe con `srcdoc`: aisla los estilos del mail de los
 * de la app, que es justo lo que hace un cliente de correo. `sandbox` sin
 * allow-scripts evita que corra nada de lo que venga en la plantilla.
 */
export function EmailPreview({ html, asunto }: EmailPreviewProps) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Asunto</p>
        <p className="text-sm font-medium text-slate-900">{asunto || "(sin asunto)"}</p>
      </div>
      <iframe
        title="Vista previa del mail"
        srcDoc={html}
        sandbox=""
        className="h-[70vh] w-full rounded-md border border-slate-200 bg-white"
        style={{ minWidth: ANCHO_EMAIL / 2 }}
      />
    </div>
  );
}
