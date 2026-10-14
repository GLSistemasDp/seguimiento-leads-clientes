import Link from "next/link";
import type { ResumenImportacion } from "@/lib/import/import-solicitudes";

function Metrica({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
      <p className="text-2xl font-semibold text-slate-900">{valor}</p>
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
    </div>
  );
}

export function ImportResumen({ resumen }: { resumen: ResumenImportacion }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Importacion de {resumen.archivo}
        </h2>
        <p className="text-xs text-slate-500">
          Hoja &quot;{resumen.hoja}&quot; · {resumen.filasLeidas} filas leidas
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica valor={resumen.creadas} etiqueta="Creadas" />
        <Metrica valor={resumen.actualizadas} etiqueta="Actualizadas" />
        <Metrica valor={resumen.duplicadas} etiqueta="Duplicadas" />
        <Metrica valor={resumen.errores.length} etiqueta="Con error" />
      </div>

      {resumen.errores.length > 0 ? (
        <details className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-amber-900">
            Ver las {resumen.errores.length} filas que no se importaron
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {resumen.errores.map((error) => (
              <li key={error.fila}>
                Fila {error.fila}: {error.motivo}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Columnas detectadas en el archivo ({resumen.encabezados.length})
        </summary>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {resumen.encabezados.map((encabezado) => (
            <li
              key={encabezado}
              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600"
            >
              {encabezado}
            </li>
          ))}
        </ul>
      </details>

      <Link
        href="/solicitudes"
        className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
      >
        Ver las solicitudes importadas →
      </Link>
    </div>
  );
}
