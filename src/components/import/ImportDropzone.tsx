"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { ImportResumen } from "@/components/import/ImportResumen";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ACCEPT_INPUT, extensionSoportada } from "@/lib/import/formatos";
import type { ResumenImportacion } from "@/lib/import/import-solicitudes";

export function ImportDropzone() {
  const router = useRouter();
  const { mostrar } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);

  async function subir(archivo: File) {
    if (!extensionSoportada(archivo.name)) {
      mostrar("Formato no soportado. Subi un .xlsx, .xls, .xlsm o .csv.", "error");
      return;
    }

    setSubiendo(true);
    setResumen(null);
    try {
      const formulario = new FormData();
      formulario.append("archivo", archivo);

      const respuesta = await fetch("/api/import", { method: "POST", body: formulario });
      const cuerpo = (await respuesta.json().catch(() => null)) as
        | (ResumenImportacion & { error?: string })
        | null;

      if (!respuesta.ok || !cuerpo) {
        mostrar(cuerpo?.error ?? `Error ${respuesta.status} al importar.`, "error");
        return;
      }

      setResumen(cuerpo);
      mostrar(
        `Importacion lista: ${cuerpo.creadas} creadas, ${cuerpo.actualizadas} actualizadas.`,
        "exito",
      );
      router.refresh();
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "Error inesperado al importar.", "error");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function alSoltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastrando(false);
    const archivo = evento.dataTransfer.files[0];
    if (archivo) void subir(archivo);
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(evento) => {
          evento.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          arrastrando ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
        }`}
      >
        <p className="text-sm font-medium text-slate-700">
          Arrastra el archivo exportado de Acrobat, o eleg&iacute; uno
        </p>
        <p className="text-xs text-slate-500">Formatos aceptados: .xlsx, .xls, .xlsm, .csv</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_INPUT}
          className="hidden"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0];
            if (archivo) void subir(archivo);
          }}
        />
        <Button disabled={subiendo} onClick={() => inputRef.current?.click()}>
          {subiendo ? "Importando…" : "Elegir archivo"}
        </Button>
      </div>

      {resumen ? <ImportResumen resumen={resumen} /> : null}
    </div>
  );
}
