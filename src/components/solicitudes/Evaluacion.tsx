import { Icono } from "@/components/ui/Icono";
import { CATEGORIAS, linkNosis } from "@/lib/solicitudes/evaluacion";
import type { Evaluacion } from "@/lib/solicitudes/evaluacion";

/** Puntaje + categoria, para el listado. */
export function InsigniaAptitud({ evaluacion, detalle = false }: { evaluacion: Evaluacion; detalle?: boolean }) {
  const categoria = CATEGORIAS[evaluacion.categoria];
  return (
    <div className="flex flex-col gap-1" title={evaluacion.resumen}>
      <span className={`inline-flex w-fit flex-wrap items-center gap-x-1.5 rounded-xl px-2.5 py-1 text-sm font-semibold ${categoria.estilo}`}>
        <span className="tabular-nums">{evaluacion.puntaje}%</span>
        <span className="font-medium">· {categoria.etiqueta}</span>
      </span>
      {detalle ? <span className="line-clamp-2 text-xs text-slate-500">{evaluacion.riesgos[0] ?? "Formulario completo"}</span> : null}
    </div>
  );
}

/** Link a Nosis para ver el informe comercial del CUIT. */
export function BotonNosis({ cuit, compacto = false }: { cuit: string; compacto?: boolean }) {
  const url = linkNosis(cuit);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Buscar el CUIT ${cuit} en Nosis`}
      onClick={(evento) => evento.stopPropagation()}
      className={
        compacto
          ? "inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
          : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      }
    >
      {compacto ? "Nosis" : "Ver en Nosis"}
      <Icono nombre="externo" className={compacto ? "size-3" : "size-3.5"} />
    </a>
  );
}

/** Detalle de la clasificacion: cuanto completo, que falta y que hacer. */
export function PanelEvaluacion({ evaluacion, cuit }: { evaluacion: Evaluacion; cuit: string }) {
  const categoria = CATEGORIAS[evaluacion.categoria];

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Clasificación del formulario</p>
        <BotonNosis cuit={cuit} />
      </div>

      <div className="flex items-center gap-4">
        <div className={`flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl ${categoria.estilo}`}>
          <span className="text-2xl leading-none font-bold tabular-nums">{evaluacion.puntaje}</span>
          <span className="text-[10px] font-semibold">%</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {evaluacion.categoria} · {categoria.etiqueta}
          </p>
          <div className="mt-1 h-2 w-48 max-w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#1b2b5e]" style={{ width: `${evaluacion.puntaje}%` }} />
          </div>
        </div>
      </div>

      {evaluacion.fortalezas.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {evaluacion.fortalezas.map((item) => (
            <li key={item} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
              <Icono nombre="check" className="size-3" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}

      {evaluacion.riesgos.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-red-700">Falta o hay que revisar</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-700">
            {evaluacion.riesgos.map((item) => (
              <li key={item} className="flex gap-1.5">
                <Icono nombre="alerta" className="mt-0.5 size-3.5 text-red-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <span className="font-semibold">Próximo paso:</span> {evaluacion.proximoPaso}
      </p>
    </section>
  );
}
