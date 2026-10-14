"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { recomendar } from "@/lib/seguimiento/respuestas";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import { separarCliente } from "@/lib/seguimiento/presentacion";
import type { Consulta } from "@/types/seguimiento";

type Props = {
  consulta: Pick<Consulta, "hito" | "consulta" | "estadoCuenta" | "tentativoRespuesta" | "cliente">;
  /** Atenuada cuando la consulta ya esta respondida. */
  apagada?: boolean;
  /** Respuestas de la planilla; sin ellas se usan las fijas de la app. */
  catalogo?: readonly RespuestaTipo[];
};

/** Resalta los [DATOS A COMPLETAR] del mensaje. */
function MensajeConMarcas({ texto }: { texto: string }) {
  const partes = texto.split(/(\[[^\]]+\])/g);
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
      {partes.map((parte, indice) =>
        /^\[[^\]]+\]$/.test(parte) ? (
          <mark key={indice} className="rounded bg-amber-100 px-0.5 text-amber-900">
            {parte}
          </mark>
        ) : (
          <Fragment key={indice}>{parte}</Fragment>
        ),
      )}
    </p>
  );
}

export function RecomendacionRespuesta({ consulta, apagada = false, catalogo }: Props) {
  const { mostrar } = useToast();
  const recomendacion = useMemo(() => recomendar(consulta, catalogo), [consulta, catalogo]);
  const opciones = useMemo(
    () => [recomendacion.principal, ...recomendacion.alternativas].filter((item): item is RespuestaTipo => item !== null),
    [recomendacion],
  );
  const [abierta, setAbierta] = useState(false);
  const [elegida, setElegida] = useState(0);

  const sugeridaPlanilla = consulta.tentativoRespuesta.trim();
  const actual = opciones[elegida];

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      mostrar("Respuesta copiada. Completá los datos marcados antes de enviarla.", "exito");
    } catch {
      mostrar("No se pudo copiar al portapapeles.", "error");
    }
  }

  if (!recomendacion.principal && !sugeridaPlanilla && !recomendacion.aviso) {
    return <span className="text-xs text-slate-400">Sin sugerencia</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setElegida(0);
          setAbierta(true);
        }}
        className={`group flex w-full flex-col items-start gap-1 rounded-md p-1 text-left hover:bg-blue-50 ${
          apagada ? "opacity-50" : ""
        }`}
      >
        {recomendacion.aviso ? (
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
            <Icono nombre="alerta" className="size-3" />
            Revisar antes
          </span>
        ) : null}
        {sugeridaPlanilla ? (
          <span className="line-clamp-2 text-xs text-slate-700">{sugeridaPlanilla}</span>
        ) : null}
        {recomendacion.principal ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-medium text-blue-800 group-hover:bg-blue-100">
            <Icono nombre="chispa" className="size-3" />
            {recomendacion.principal.comando}
          </span>
        ) : null}
      </button>

      <Modal
        abierto={abierta}
        ancho="lg"
        titulo={`Respuesta sugerida · ${separarCliente(consulta.cliente).nombre}`}
        onCerrar={() => setAbierta(false)}
        acciones={
          <>
            <Button variante="secundario" onClick={() => setAbierta(false)}>
              Cerrar
            </Button>
            {actual ? (
              <Button onClick={() => void copiar(actual.mensaje)}>
                <Icono nombre="copiar" className="size-3.5" />
                Copiar {actual.comando}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Consulta · {consulta.hito || "sin hito"}
            </p>
            <p className="mt-1 text-sm text-slate-800">{consulta.consulta}</p>
          </div>

          {recomendacion.aviso ? (
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Icono nombre="alerta" className="mt-0.5 size-4" />
              {recomendacion.aviso}
            </p>
          ) : null}

          {sugeridaPlanilla ? (
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Cargada en la planilla
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">{sugeridaPlanilla}</p>
            </div>
          ) : null}

          {opciones.length > 0 ? (
            <div>
              <div className="flex flex-wrap gap-1.5" role="tablist">
                {opciones.map((opcion, indice) => (
                  <button
                    key={opcion.comando}
                    type="button"
                    role="tab"
                    aria-selected={indice === elegida}
                    onClick={() => setElegida(indice)}
                    className={`rounded-md px-2.5 py-1 font-mono text-xs ${
                      indice === elegida
                        ? "bg-blue-700 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {opcion.comando}
                    {indice === 0 ? " · recomendada" : ""}
                  </button>
                ))}
              </div>
              {actual ? (
                <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/40 p-4">
                  {actual.tipoQueja ? (
                    <p className="mb-2 text-xs font-semibold tracking-wide text-red-700 uppercase">
                      Reclamo · {actual.tipoQueja}
                    </p>
                  ) : null}
                  <MensajeConMarcas texto={actual.mensaje} />
                  {actual.cuando ? (
                    <p className="mt-3 text-xs text-slate-600">
                      <span className="font-semibold">Cuando usarla:</span> {actual.cuando}
                    </p>
                  ) : null}
                  {actual.accionInterna ? (
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-semibold">Accion interna:</span> {actual.accionInterna}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-slate-500">
                    Plantilla del hito “{actual.hito}”. Lo resaltado se completa a mano.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
