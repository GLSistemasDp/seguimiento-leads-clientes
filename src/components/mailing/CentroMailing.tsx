"use client";

import { useMemo, useState } from "react";
import { EditorPlantilla } from "@/components/mailing/EditorPlantilla";
import { PanelDestinatarios } from "@/components/mailing/PanelDestinatarios";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { filtrar, filtrosIniciales, opcionesDe } from "@/lib/mailing/filtros";
import { PLANTILLAS_BASE, variablesDesconocidas } from "@/lib/mailing/plantillas";
import { CATEGORIAS_MAILING, TIPOS_MAIL, tiposDe } from "@/types/mailing";
import type {
  BaseMailing,
  CategoriaMailing,
  Destinatario,
  FiltrosMailing,
  PlantillaMailing,
  TipoMail,
} from "@/types/mailing";

const TODOS_LOS_TIPOS = Object.keys(TIPOS_MAIL) as TipoMail[];
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Contrasena de muestra para la vista previa, estable por destinatario. La
 * definitiva (aleatoria) se genera en el servidor al momento del envio.
 */
function passwordDeMuestra(id: string): string {
  let hash = 2166136261;
  let resultado = "";
  for (let i = 0; i < 10; i += 1) {
    for (const caracter of `${id}:${i}`) hash = Math.imul(hash ^ caracter.charCodeAt(0), 16777619) >>> 0;
    resultado += ALFABETO[hash % ALFABETO.length];
  }
  return resultado;
}

/** Un valor por tipo de mail. */
function porTipo<T>(crear: (tipo: TipoMail) => T): Record<TipoMail, T> {
  const resultado = {} as Record<TipoMail, T>;
  for (const tipo of TODOS_LOS_TIPOS) resultado[tipo] = crear(tipo);
  return resultado;
}

function iguales(a: PlantillaMailing, b: PlantillaMailing): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function celdaCsv(valor: string): string {
  return /[";\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function descargarCsv(tipo: TipoMail, destinatarios: readonly Destinatario[]) {
  const encabezados = ["Razon social", "Mail", "N cliente", "CUIT", "Rubro", "Provincia", "Clasificacion", "Deuda", "Ultima compra"];
  const filas = destinatarios.map((d) =>
    [d.nombre, d.email, d.codigo, d.cuit, d.rubro, d.provincia, d.clasificacion, String(d.deuda), d.ultimaCompra?.slice(0, 10) ?? ""]
      .map(celdaCsv)
      .join(";"),
  );
  const contenido = "﻿" + [encabezados.join(";"), ...filas].join("\r\n");
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `mailing-${tipo}-${new Date().toISOString().slice(0, 10)}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

export type CentroMailingProps = {
  clientes: Destinatario[];
  altas: Destinatario[];
  plantillas: Record<TipoMail, PlantillaMailing>;
  bases: BaseMailing[];
  ahora: number;
  linkPlataforma: string;
};

export function CentroMailing({ clientes, altas, plantillas, bases: basesIniciales, ahora, linkPlataforma }: CentroMailingProps) {
  const { mostrar } = useToast();
  const [categoria, setCategoria] = useState<CategoriaMailing>("promocional");
  const [tipoPorCategoria, setTipoPorCategoria] = useState<Record<CategoriaMailing, TipoMail>>({
    promocional: "promocional",
    altas: "alta_aprobada",
    informativo: "estado_deuda",
  });
  const tipo = tipoPorCategoria[categoria];

  const [filtros, setFiltros] = useState<Record<TipoMail, FiltrosMailing>>(() => porTipo(filtrosIniciales));
  const [excluidos, setExcluidos] = useState<Record<TipoMail, ReadonlySet<string>>>(() =>
    porTipo(() => new Set<string>()),
  );
  const [guardadas, setGuardadas] = useState(plantillas);
  const [borradores, setBorradores] = useState(plantillas);
  const [guardando, setGuardando] = useState(false);
  const [bases, setBases] = useState(basesIniciales);
  const [vistaPreviaId, setVistaPreviaId] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);

  const esAlta = TIPOS_MAIL[tipo].categoria === "altas";
  const universo = useMemo(
    () =>
      tipo === "alta_aprobada"
        ? altas.filter((d) => d.estadoAlta === "APROBADO")
        : tipo === "alta_rechazada"
          ? altas.filter((d) => d.estadoAlta === "RECHAZADO")
          : clientes,
    [tipo, altas, clientes],
  );
  const filtrados = useMemo(() => filtrar(universo, filtros[tipo], ahora), [universo, filtros, tipo, ahora]);
  const excluidosTipo = excluidos[tipo];
  const seleccionados = useMemo(
    () => filtrados.filter((d) => d.email && !excluidosTipo.has(d.id)),
    [filtrados, excluidosTipo],
  );
  const opciones = useMemo(
    () => ({
      rubro: opcionesDe(universo, "rubro"),
      provincia: opcionesDe(universo, "provincia"),
      grupoVendedor: opcionesDe(universo, "grupoVendedor"),
    }),
    [universo],
  );

  // La vista previa muestra al elegido en la lista; si no hay, al primero seleccionado.
  const vistaPrevia =
    filtrados.find((d) => d.id === vistaPreviaId) ?? seleccionados[0] ?? filtrados[0] ?? null;
  const indiceVista = vistaPrevia ? seleccionados.findIndex((d) => d.id === vistaPrevia.id) : -1;
  const extras = useMemo(
    () => ({ linkPlataforma, password: vistaPrevia ? passwordDeMuestra(vistaPrevia.id) : undefined }),
    [linkPlataforma, vistaPrevia],
  );

  const borrador = borradores[tipo];
  const modificada = !iguales(borrador, guardadas[tipo]);
  const personalizada = !iguales(guardadas[tipo], PLANTILLAS_BASE[tipo]);
  const desconocidas = variablesDesconocidas(borrador, tipo);

  function actualizarExcluidos(cambio: (actual: Set<string>) => void) {
    setExcluidos((previo) => {
      const nuevo = new Set(previo[tipo]);
      cambio(nuevo);
      return { ...previo, [tipo]: nuevo };
    });
  }

  async function guardarPlantilla() {
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/mailing/plantillas/${tipo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(borrador),
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);
      setGuardadas((previo) => ({ ...previo, [tipo]: borrador }));
      mostrar(`Plantilla "${TIPOS_MAIL[tipo].etiqueta}" guardada.`, "exito");
    } catch (error) {
      mostrar(`No se pudo guardar: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setGuardando(false);
    }
  }

  async function restaurarPlantilla() {
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/mailing/plantillas/${tipo}`, { method: "DELETE" });
      if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
      setGuardadas((previo) => ({ ...previo, [tipo]: PLANTILLAS_BASE[tipo] }));
      setBorradores((previo) => ({ ...previo, [tipo]: PLANTILLAS_BASE[tipo] }));
      mostrar("Se restauró la plantilla original.", "exito");
    } catch (error) {
      mostrar(`No se pudo restaurar: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarBase(nombre: string): Promise<boolean> {
    try {
      const respuesta = await fetch("/api/mailing/bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          tipo,
          filtros: filtros[tipo],
          excluidos: [...excluidosTipo],
          cantidad: seleccionados.length,
        }),
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { base?: BaseMailing; error?: string };
      if (!respuesta.ok || !cuerpo.base) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);
      setBases((previo) => [cuerpo.base!, ...previo]);
      mostrar(`Base "${cuerpo.base.nombre}" guardada con ${cuerpo.base.cantidad} destinatarios.`, "exito");
      return true;
    } catch (error) {
      mostrar(`No se pudo guardar la base: ${error instanceof Error ? error.message : String(error)}`, "error");
      return false;
    }
  }

  async function borrarBase(base: BaseMailing) {
    const respuesta = await fetch(`/api/mailing/bases/${base.id}`, { method: "DELETE" }).catch(() => null);
    if (!respuesta?.ok) {
      mostrar("No se pudo borrar la base.", "error");
      return;
    }
    setBases((previo) => previo.filter((item) => item.id !== base.id));
    mostrar(`Base "${base.nombre}" borrada.`, "exito");
  }

  function aplicarBase(base: BaseMailing) {
    setFiltros((previo) => ({ ...previo, [tipo]: base.filtros }));
    setExcluidos((previo) => ({ ...previo, [tipo]: new Set(base.excluidos) }));
    mostrar(`Se cargó la base "${base.nombre}".`, "info");
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div role="tablist" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(CATEGORIAS_MAILING) as CategoriaMailing[]).map((clave) => (
          <button
            key={clave}
            type="button"
            role="tab"
            aria-selected={categoria === clave}
            onClick={() => {
              setCategoria(clave);
              setVistaPreviaId(null);
            }}
            className={`rounded-2xl border p-4 text-left shadow-sm transition-colors ${
              categoria === clave
                ? "border-[#1b2b5e] bg-[#1b2b5e] text-white"
                : "border-slate-200 bg-white text-slate-800 hover:border-blue-300"
            }`}
          >
            <p className="font-semibold">{CATEGORIAS_MAILING[clave].etiqueta}</p>
            <p className={`mt-0.5 text-xs ${categoria === clave ? "text-blue-100" : "text-slate-500"}`}>
              {CATEGORIAS_MAILING[clave].descripcion}
            </p>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <PanelDestinatarios
          key={tipo}
          esAlta={esAlta}
          universo={universo}
          filtrados={filtrados}
          filtros={filtros[tipo]}
          onFiltros={(nuevos) => setFiltros((previo) => ({ ...previo, [tipo]: nuevos }))}
          onLimpiar={() => setFiltros((previo) => ({ ...previo, [tipo]: filtrosIniciales(tipo) }))}
          excluidos={excluidosTipo}
          onAlternar={(id) =>
            actualizarExcluidos((actual) => {
              if (actual.has(id)) actual.delete(id);
              else actual.add(id);
            })
          }
          onIncluirTodos={() => actualizarExcluidos((actual) => filtrados.forEach((d) => actual.delete(d.id)))}
          onQuitarTodos={() => actualizarExcluidos((actual) => filtrados.forEach((d) => actual.add(d.id)))}
          seleccionados={seleccionados.length}
          vistaPreviaId={vistaPrevia?.id ?? null}
          onVistaPrevia={setVistaPreviaId}
          opciones={opciones}
          bases={bases.filter((base) => base.tipo === tipo)}
          onGuardarBase={guardarBase}
          onAplicarBase={aplicarBase}
          onBorrarBase={(base) => void borrarBase(base)}
          ahora={ahora}
        />

        <EditorPlantilla
          tipo={tipo}
          tipos={tiposDe(categoria)}
          onTipo={(nuevo) => {
            setTipoPorCategoria((previo) => ({ ...previo, [categoria]: nuevo }));
            setVistaPreviaId(null);
          }}
          plantilla={borrador}
          onCambio={(nueva) => setBorradores((previo) => ({ ...previo, [tipo]: nueva }))}
          modificada={modificada}
          personalizada={personalizada}
          guardando={guardando}
          onGuardar={() => void guardarPlantilla()}
          onRestaurar={() => void restaurarPlantilla()}
          destinatario={vistaPrevia}
          posicion={{ actual: indiceVista + 1, total: seleccionados.length }}
          onMover={(paso) => {
            if (seleccionados.length === 0) return;
            const siguiente = (Math.max(indiceVista, 0) + paso + seleccionados.length) % seleccionados.length;
            setVistaPreviaId(seleccionados[siguiente].id);
          }}
          extras={extras}
        />
      </div>

      <div className="fixed bottom-4 left-1/2 z-40 w-[min(64rem,calc(100%-2rem))] -translate-x-1/2 md:left-[calc(50%+38px)]">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#1b2b5e] px-5 py-3 text-white shadow-2xl">
          <div className="min-w-0 text-sm leading-snug">
            <p className="font-medium">
              {TIPOS_MAIL[tipo].etiqueta} · {seleccionados.length} destinatario{seleccionados.length === 1 ? "" : "s"}
            </p>
            <p className="truncate text-blue-100">
              {modificada ? "Plantilla con cambios sin guardar · " : ""}
              {borrador.asunto}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={seleccionados.length === 0}
              onClick={() => descargarCsv(tipo, seleccionados)}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-300/50 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
            >
              <Icono nombre="descargar" />
              Descargar lista
            </button>
            <button
              type="button"
              disabled={seleccionados.length === 0}
              onClick={() => setPreparando(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#1b2b5e] hover:bg-blue-50 disabled:opacity-50"
            >
              <Icono nombre="mail" />
              Preparar envío
            </button>
          </div>
        </div>
      </div>

      <Modal
        abierto={preparando}
        ancho="lg"
        titulo={`Preparar envío · ${TIPOS_MAIL[tipo].etiqueta}`}
        onCerrar={() => setPreparando(false)}
        acciones={
          <>
            <Button variante="secundario" onClick={() => descargarCsv(tipo, seleccionados)}>
              <Icono nombre="descargar" className="size-3.5" />
              Descargar lista
            </Button>
            <Button onClick={() => setPreparando(false)}>Entendido</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Destinatarios</dt>
              <dd className="text-2xl font-semibold text-slate-900">{seleccionados.length}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Quedan afuera</dt>
              <dd className="text-2xl font-semibold text-slate-900">{filtrados.length - seleccionados.length}</dd>
              <dd className="text-xs text-slate-500">quitados a mano o sin mail</dd>
            </div>
          </dl>
          <p className="text-sm">
            <span className="text-slate-500">Asunto:</span> <span className="font-medium text-slate-900">{borrador.asunto}</span>
          </p>
          {modificada ? (
            <p className="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">La plantilla tiene cambios sin guardar.</p>
          ) : null}
          {desconocidas.length > 0 ? (
            <p className="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">
              Revisá las variables {desconocidas.map((c) => `{{${c}}}`).join(", ")}: este tipo de mail no las reconoce.
            </p>
          ) : null}
          {tipo === "alta_aprobada" ? (
            <p className="rounded-lg bg-blue-50 p-2.5 text-sm text-blue-900">
              Cada alta recibe como usuario su CUIT y una contraseña aleatoria que se genera al enviar (la de la vista previa es de muestra).
            </p>
          ) : null}
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Primeros destinatarios</p>
            <ul className="mt-1 text-sm text-slate-700">
              {seleccionados.slice(0, 6).map((d) => (
                <li key={d.id} className="truncate">
                  {d.nombre} <span className="font-mono text-xs text-blue-700">&lt;{d.email}&gt;</span>
                </li>
              ))}
              {seleccionados.length > 6 ? <li className="text-xs text-slate-500">y {seleccionados.length - 6} más</li> : null}
            </ul>
          </div>
          <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">
            El envío masivo todavía no está conectado: queda definir proveedor de envío, remitente, límites por hora,
            registro de entregas y bajas. Por ahora podés descargar la lista con los destinatarios elegidos.
          </p>
        </div>
      </Modal>
    </div>
  );
}
