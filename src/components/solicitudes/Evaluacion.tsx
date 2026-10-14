"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";
import { CATEGORIAS } from "@/lib/solicitudes/evaluacion";
import type { Evaluacion } from "@/lib/solicitudes/evaluacion";
import { formatearFechaHora } from "@/lib/utils/dates";

/** Puntaje + categoria, para el listado. La chispa indica que lo evaluo la IA. */
export function InsigniaAptitud({ evaluacion, detalle = false }: { evaluacion: Evaluacion; detalle?: boolean }) {
  const categoria = CATEGORIAS[evaluacion.categoria];
  return (
    <div className="flex flex-col gap-1" title={`${evaluacion.resumen}\n${evaluacion.fuente === "ia" ? "Evaluado con IA" : "Puntaje por reglas"}`}>
      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap ${categoria.estilo}`}>
        {evaluacion.fuente === "ia" ? <Icono nombre="chispa" className="size-3.5" /> : null}
        <span className="tabular-nums">{evaluacion.puntaje}</span>
        <span className="font-medium">· {categoria.etiqueta}</span>
      </span>
      {detalle ? <span className="line-clamp-2 max-w-56 text-xs text-slate-500">{evaluacion.resumen}</span> : null}
    </div>
  );
}

async function pedir(url: string): Promise<{ ok: true; cuerpo: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const respuesta = await fetch(url, { method: "POST" });
    const cuerpo = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
    if (!respuesta.ok) return { ok: false, error: typeof cuerpo.error === "string" ? cuerpo.error : `Error ${respuesta.status}` };
    return { ok: true, cuerpo };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Detalle del puntaje con el boton para (re)evaluar con Claude. */
export function PanelEvaluacion({ solicitudId, evaluacion: inicial }: { solicitudId: string; evaluacion: Evaluacion }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  const [evaluacion, setEvaluacion] = useState(inicial);
  const [evaluando, setEvaluando] = useState(false);
  const [error, setError] = useState("");
  const categoria = CATEGORIAS[evaluacion.categoria];

  async function evaluar() {
    setEvaluando(true);
    setError("");
    const resultado = await pedir(`/api/solicitudes/${solicitudId}/evaluar`);
    setEvaluando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setEvaluacion(resultado.cuerpo.evaluacion as Evaluacion);
    mostrar("Solicitud evaluada con IA.", "exito");
    startTransition(() => router.refresh());
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Aptitud como cliente</p>
        <span className="text-[11px] text-slate-500">
          {evaluacion.fuente === "ia" ? `IA · ${formatearFechaHora(evaluacion.fecha)}` : "Por reglas"}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className={`flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl ${categoria.estilo}`}>
          <span className="text-2xl leading-none font-bold tabular-nums">{evaluacion.puntaje}</span>
          <span className="text-[10px] font-semibold">/ 100</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {evaluacion.categoria} · {categoria.etiqueta}
          </p>
          <p className="text-sm text-slate-600">{evaluacion.resumen}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-emerald-700">A favor</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-700">
            {evaluacion.fortalezas.length === 0 ? <li className="text-slate-400">—</li> : null}
            {evaluacion.fortalezas.map((item) => (
              <li key={item} className="flex gap-1.5">
                <Icono nombre="check" className="mt-0.5 size-3.5 text-emerald-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-red-700">A revisar</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-700">
            {evaluacion.riesgos.length === 0 ? <li className="text-slate-400">—</li> : null}
            {evaluacion.riesgos.map((item) => (
              <li key={item} className="flex gap-1.5">
                <Icono nombre="alerta" className="mt-0.5 size-3.5 text-red-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <span className="font-semibold">Próximo paso:</span> {evaluacion.proximoPaso}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variante={evaluacion.fuente === "ia" ? "secundario" : "primario"} tamano="sm" disabled={evaluando} onClick={() => void evaluar()}>
          <Icono nombre="chispa" className="size-3.5" />
          {evaluando ? "Evaluando…" : evaluacion.fuente === "ia" ? "Volver a evaluar con IA" : "Evaluar con IA"}
        </Button>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}

/** Evalua con IA todas las pendientes que no tengan evaluacion vigente. */
export function EvaluarPendientes({ sinEvaluar }: { sinEvaluar: number }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  const [evaluando, setEvaluando] = useState(false);

  async function evaluar() {
    setEvaluando(true);
    const resultado = await pedir("/api/solicitudes/evaluar");
    setEvaluando(false);
    if (!resultado.ok) {
      mostrar(resultado.error, "error");
      return;
    }
    const { evaluadas, restantes } = resultado.cuerpo as { evaluadas: number; restantes: number };
    mostrar(
      restantes > 0
        ? `Se evaluaron ${evaluadas}. Quedan ${restantes}: volvé a tocar el botón.`
        : `Se evaluaron ${evaluadas} solicitudes con IA.`,
      "exito",
    );
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      disabled={evaluando || sinEvaluar === 0}
      onClick={() => void evaluar()}
      title={sinEvaluar === 0 ? "Todas las pendientes ya tienen evaluación de IA" : undefined}
      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icono nombre="chispa" />
      {evaluando ? "Evaluando con IA…" : `Evaluar pendientes con IA${sinEvaluar > 0 ? ` (${sinEvaluar})` : ""}`}
    </button>
  );
}
