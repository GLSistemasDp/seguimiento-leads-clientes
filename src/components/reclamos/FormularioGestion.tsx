"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";
import {
  CANALES_INGRESO,
  MOTIVOS_LOGISTICOS,
  SEVERIDADES,
  TIPOS_EPP,
  type Gestion,
} from "@/types/reclamo";

const campo =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

type Valores = Record<Exclude<keyof Gestion, "cerrado">, string> & { cerrado: boolean };

function aValores(gestion: Gestion): Valores {
  return {
    responsable: gestion.responsable,
    severidad: gestion.severidad ?? "",
    tipoEpp: gestion.tipoEpp ?? "",
    canalIngreso: gestion.canalIngreso ?? "",
    deposito: gestion.deposito,
    transportista: gestion.transportista,
    numeroNotaCredito: gestion.numeroNotaCredito,
    motivoLogistico: gestion.motivoLogistico ?? "",
    diasDemora: gestion.diasDemora === null ? "" : String(gestion.diasDemora),
    montoNotaCredito: gestion.montoNotaCredito === null ? "" : String(gestion.montoNotaCredito),
    costoAdicional: gestion.costoAdicional === null ? "" : String(gestion.costoAdicional),
    cerrado: gestion.cerrado,
  };
}

/**
 * Datos de gestion del reclamo que alimentan el informe: quien lo lleva,
 * severidad, tipo de EPP, logistica, montos y cierre. Lo que se deja en
 * "Automático" se deduce del formulario.
 */
export function FormularioGestion({
  id,
  inicial,
  deducido,
  cerradoEn,
}: {
  id: string;
  inicial: Gestion;
  /** Lo que se usa si el campo queda en "Automático". */
  deducido: { tipoEpp: string; canalIngreso: string; motivoLogistico: string | null; transportista: string; categoria: string };
  cerradoEn: string | null;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  const [valores, setValores] = useState<Valores>(() => aValores(inicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  function cambiar<K extends keyof Valores>(clave: K, valor: Valores[K]) {
    setValores((previo) => ({ ...previo, [clave]: valor }));
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/reclamos/${encodeURIComponent(id)}/gestion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);
      mostrar("Gestión guardada.", "exito");
      startTransition(() => router.refresh());
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold tracking-wide text-blue-700 uppercase">Gestión</p>
      <h2 className="mt-1 text-lg font-semibold">Datos para el informe</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Categoría: <span className="font-medium text-slate-800">{deducido.categoria}</span>. Lo que se deja vacío o en
        &quot;Automático&quot; se deduce del formulario.
      </p>

      <fieldset disabled={guardando} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-700 sm:col-span-2">
          Responsable
          <input maxLength={120} value={valores.responsable} onChange={(e) => cambiar("responsable", e.target.value)} placeholder="Quién lleva el reclamo" className={campo} />
        </label>
        <label className="text-sm text-slate-700">
          Severidad
          <select value={valores.severidad} onChange={(e) => cambiar("severidad", e.target.value)} className={campo}>
            <option value="">Sin definir</option>
            {Object.entries(SEVERIDADES).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Tipo de EPP
          <select value={valores.tipoEpp} onChange={(e) => cambiar("tipoEpp", e.target.value)} className={campo}>
            <option value="">Automático: {deducido.tipoEpp}</option>
            {TIPOS_EPP.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Canal de ingreso
          <select value={valores.canalIngreso} onChange={(e) => cambiar("canalIngreso", e.target.value)} className={campo}>
            <option value="">Automático: {deducido.canalIngreso}</option>
            {Object.entries(CANALES_INGRESO).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Depósito de despacho
          <input maxLength={120} value={valores.deposito} onChange={(e) => cambiar("deposito", e.target.value)} className={campo} />
        </label>
        <label className="text-sm text-slate-700">
          Transportista
          <input maxLength={120} value={valores.transportista} onChange={(e) => cambiar("transportista", e.target.value)} placeholder={deducido.transportista || "Sin informar"} className={campo} />
        </label>
        <label className="text-sm text-slate-700">
          Motivo logístico
          <select value={valores.motivoLogistico} onChange={(e) => cambiar("motivoLogistico", e.target.value)} className={campo}>
            <option value="">{deducido.motivoLogistico ? `Automático: ${deducido.motivoLogistico}` : "No aplica"}</option>
            {Object.entries(MOTIVOS_LOGISTICOS).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Días de demora en la entrega
          <input type="number" min={0} max={365} step="any" value={valores.diasDemora} onChange={(e) => cambiar("diasDemora", e.target.value)} className={campo} />
        </label>
        <label className="text-sm text-slate-700">
          Notas de crédito ($)
          <input type="number" min={0} step="any" value={valores.montoNotaCredito} onChange={(e) => cambiar("montoNotaCredito", e.target.value)} className={campo} />
        </label>
        <label className="text-sm text-slate-700">
          N° de nota de crédito
          <input maxLength={60} value={valores.numeroNotaCredito} onChange={(e) => cambiar("numeroNotaCredito", e.target.value)} className={campo} />
        </label>
        <label className="text-sm text-slate-700">
          Otros costos ($)
          <input type="number" min={0} step="any" value={valores.costoAdicional} onChange={(e) => cambiar("costoAdicional", e.target.value)} placeholder="Fletes, reposición" className={campo} />
        </label>
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={valores.cerrado} onChange={(e) => cambiar("cerrado", e.target.checked)} className="mt-0.5 size-4 accent-emerald-600" />
          <span>
            <span className="font-medium text-slate-900">Reclamo cerrado</span>
            <span className="block text-xs text-slate-500">
              {cerradoEn
                ? `Cerrado el ${new Date(cerradoEn).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.`
                : "Resuelto y con la documentación terminada (notas, devoluciones)."}
            </span>
          </span>
        </label>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {error ? (
          <p role="alert" className="mr-auto text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={guardando}>
          <Icono nombre="check" className="size-4" />
          {guardando ? "Guardando…" : "Guardar gestión"}
        </Button>
      </div>
    </form>
  );
}
