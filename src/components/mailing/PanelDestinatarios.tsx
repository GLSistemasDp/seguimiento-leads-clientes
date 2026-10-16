"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { bloqueado, diasSinComprar, DIAS_INACTIVO } from "@/lib/mailing/filtros";
import type { BaseMailing, Destinatario, FiltrosMailing } from "@/types/mailing";
import { FILTRO_COMPRA, FILTRO_DEUDA } from "@/types/mailing";

const PESOS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const POR_PAGINA = 60;

const ESTILO_CLASIFICACION: Record<string, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-sky-100 text-sky-800",
  C: "bg-slate-100 text-slate-600",
};

const selector =
  "w-full rounded-lg border border-slate-200 bg-white py-2 pr-8 pl-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

function Compra({ destinatario, ahora }: { destinatario: Destinatario; ahora: number }) {
  const dias = diasSinComprar(destinatario, ahora);
  if (dias === null) return <span className="text-amber-700">Nunca compró</span>;
  const texto = dias < 1 ? "Compró hoy" : dias < 60 ? `Compró hace ${dias} días` : `Compró hace ${Math.round(dias / 30)} meses`;
  return <span className={dias > DIAS_INACTIVO ? "font-medium text-amber-700" : "text-slate-500"}>{texto}</span>;
}

export type PanelDestinatariosProps = {
  esAlta: boolean;
  /** Todos los posibles para este tipo de mail. */
  universo: readonly Destinatario[];
  /** Los que pasan los filtros. */
  filtrados: readonly Destinatario[];
  filtros: FiltrosMailing;
  onFiltros: (filtros: FiltrosMailing) => void;
  onLimpiar: () => void;
  excluidos: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  onIncluirTodos: () => void;
  onQuitarTodos: () => void;
  seleccionados: number;
  vistaPreviaId: string | null;
  onVistaPrevia: (id: string) => void;
  opciones: { rubro: string[]; provincia: string[]; grupoVendedor: string[] };
  bases: readonly BaseMailing[];
  onGuardarBase: (nombre: string) => Promise<boolean>;
  onAplicarBase: (base: BaseMailing) => void;
  onBorrarBase: (base: BaseMailing) => void;
  ahora: number;
};

/** Columna izquierda: la base de destinatarios, sus filtros y la depuracion a mano. */
export function PanelDestinatarios({
  esAlta,
  universo,
  filtrados,
  filtros,
  onFiltros,
  onLimpiar,
  excluidos,
  onAlternar,
  onIncluirTodos,
  onQuitarTodos,
  seleccionados,
  vistaPreviaId,
  onVistaPrevia,
  opciones,
  bases,
  onGuardarBase,
  onAplicarBase,
  onBorrarBase,
  ahora,
}: PanelDestinatariosProps) {
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [nombreBase, setNombreBase] = useState<string | null>(null);
  const [baseElegida, setBaseElegida] = useState("");

  function cambiar<K extends keyof FiltrosMailing>(campo: K, valor: FiltrosMailing[K]) {
    setVisibles(POR_PAGINA);
    onFiltros({ ...filtros, [campo]: valor });
  }

  function alternarClasificacion(letra: string) {
    const actuales = filtros.clasificaciones;
    cambiar("clasificaciones", actuales.includes(letra) ? actuales.filter((c) => c !== letra) : [...actuales, letra]);
  }

  const sinMail = filtrados.filter((destinatario) => !destinatario.email).length;
  const quitados = filtrados.filter((destinatario) => destinatario.email && excluidos.has(destinatario.id)).length;

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Base de destinatarios</h2>
            <p className="text-xs text-slate-500">
              {esAlta ? "Solicitudes de alta ya decididas." : "Clientes con su perfil comercial."} Destildá a quien no quieras incluir.
            </p>
          </div>
          {!esAlta ? (
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Bases guardadas"
                value={baseElegida}
                onChange={(evento) => {
                  const base = bases.find((item) => item.id === evento.target.value);
                  setBaseElegida(evento.target.value);
                  if (base) onAplicarBase(base);
                }}
                className="max-w-48 rounded-lg border border-slate-200 bg-white py-1.5 pr-7 pl-2 text-sm"
              >
                <option value="">Bases guardadas ({bases.length})</option>
                {bases.map((base) => (
                  <option key={base.id} value={base.id}>
                    {base.nombre} · {base.cantidad}
                  </option>
                ))}
              </select>
              {baseElegida ? (
                <Button
                  variante="fantasma"
                  tamano="sm"
                  title="Borrar esta base"
                  aria-label="Borrar la base elegida"
                  onClick={() => {
                    const base = bases.find((item) => item.id === baseElegida);
                    if (base) onBorrarBase(base);
                    setBaseElegida("");
                  }}
                >
                  <Icono nombre="cerrar" className="size-4" />
                </Button>
              ) : null}
              <Button variante="secundario" tamano="sm" onClick={() => setNombreBase("")}>
                Guardar base
              </Button>
            </div>
          ) : null}
        </div>

        {nombreBase !== null ? (
          <form
            className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 p-2"
            onSubmit={async (evento) => {
              evento.preventDefault();
              if (await onGuardarBase(nombreBase)) setNombreBase(null);
            }}
          >
            <input
              autoFocus
              maxLength={80}
              value={nombreBase}
              onChange={(evento) => setNombreBase(evento.target.value)}
              placeholder="Nombre de la base, ej.: Ferreterías inactivas Litoral"
              className="min-w-56 flex-1 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-sm"
            />
            <Button type="submit" tamano="sm" disabled={!nombreBase.trim()}>
              Guardar {seleccionados} destinatarios
            </Button>
            <Button variante="fantasma" tamano="sm" onClick={() => setNombreBase(null)}>
              Cancelar
            </Button>
          </form>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="relative sm:col-span-2">
            <span className="sr-only">Buscar</span>
            <Icono nombre="buscar" className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-500" />
            <input
              value={filtros.busqueda}
              onChange={(evento) => cambiar("busqueda", evento.target.value)}
              placeholder={esAlta ? "Razón social, mail o CUIT…" : "Razón social, N° de cliente o mail…"}
              className="w-full rounded-lg border border-slate-200 py-2 pr-3 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          {!esAlta ? (
            <label>
              <span className="sr-only">Rubro</span>
              <select value={filtros.rubro} onChange={(evento) => cambiar("rubro", evento.target.value)} className={selector}>
                <option value="">Todos los rubros</option>
                {opciones.rubro.map((rubro) => (
                  <option key={rubro}>{rubro}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <span className="sr-only">Provincia</span>
            <select value={filtros.provincia} onChange={(evento) => cambiar("provincia", evento.target.value)} className={selector}>
              <option value="">Todas las provincias</option>
              {opciones.provincia.map((provincia) => (
                <option key={provincia}>{provincia}</option>
              ))}
            </select>
          </label>
          {!esAlta ? (
            <>
              <label>
                <span className="sr-only">Deuda</span>
                <select
                  value={filtros.deuda}
                  onChange={(evento) => cambiar("deuda", evento.target.value as FiltrosMailing["deuda"])}
                  className={selector}
                >
                  {Object.entries(FILTRO_DEUDA).map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Última compra</span>
                <select
                  value={filtros.compra}
                  onChange={(evento) => cambiar("compra", evento.target.value as FiltrosMailing["compra"])}
                  className={selector}
                >
                  {Object.entries(FILTRO_COMPRA).map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Grupo vendedor</span>
                <select
                  value={filtros.grupoVendedor}
                  onChange={(evento) => cambiar("grupoVendedor", evento.target.value)}
                  className={selector}
                >
                  <option value="">Todos los vendedores</option>
                  {opciones.grupoVendedor.map((grupo) => (
                    <option key={grupo}>{grupo}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-600">Clasificación</span>
                {["A", "B", "C"].map((letra) => (
                  <button
                    key={letra}
                    type="button"
                    aria-pressed={filtros.clasificaciones.includes(letra)}
                    onClick={() => alternarClasificacion(letra)}
                    className={`size-8 rounded-lg border text-sm font-semibold ${
                      filtros.clasificaciones.includes(letra)
                        ? "border-[#1b2b5e] bg-[#1b2b5e] text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {letra}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {!esAlta ? (
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={filtros.excluirBloqueados}
                onChange={(evento) => cambiar("excluirBloqueados", evento.target.checked)}
                className="accent-blue-700"
              />
              Excluir &quot;NO RESPONDER&quot; y judicializados
            </label>
          ) : (
            <span />
          )}
          <button type="button" onClick={onLimpiar} className="text-xs font-medium text-blue-700 hover:underline">
            Restablecer filtros
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <p className="text-sm text-slate-700">
          <span className="text-lg font-semibold text-slate-900 tabular-nums">{seleccionados}</span> destinatarios
          <span className="text-xs text-slate-500">
            {" "}
            · {filtrados.length} de {universo.length} pasan los filtros
            {quitados > 0 ? ` · ${quitados} quitados a mano` : ""}
            {sinMail > 0 ? ` · ${sinMail} sin mail` : ""}
          </span>
        </p>
        <div className="flex gap-1">
          <Button variante="fantasma" tamano="sm" onClick={onIncluirTodos}>
            Incluir todos
          </Button>
          <Button variante="fantasma" tamano="sm" onClick={onQuitarTodos}>
            Quitar todos
          </Button>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-500">Nadie coincide con estos filtros.</p>
      ) : (
        <ul className="max-h-[62vh] min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {filtrados.slice(0, visibles).map((destinatario) => {
            const sinCorreo = !destinatario.email;
            const incluido = !sinCorreo && !excluidos.has(destinatario.id);
            const enVista = destinatario.id === vistaPreviaId;
            return (
              <li
                key={destinatario.id}
                className={`flex items-start gap-3 px-4 py-3 ${enVista ? "bg-blue-50" : incluido ? "" : "bg-slate-50/80"}`}
              >
                <input
                  type="checkbox"
                  checked={incluido}
                  disabled={sinCorreo}
                  onChange={() => onAlternar(destinatario.id)}
                  aria-label={`${incluido ? "Quitar" : "Incluir"} a ${destinatario.nombre}`}
                  title={sinCorreo ? "No tiene mail cargado" : incluido ? "Quitar de la base" : "Volver a incluir"}
                  className="mt-1 size-4 cursor-pointer accent-blue-700 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => onVistaPrevia(destinatario.id)}
                  className="min-w-0 flex-1 text-left"
                  title="Ver el mail como lo recibiría este destinatario"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`text-sm font-semibold ${incluido ? "text-slate-900" : "text-slate-400 line-through"}`}>
                      {destinatario.nombre}
                    </span>
                    {destinatario.codigo ? (
                      <span className="font-mono text-xs text-slate-500">#{destinatario.codigo}</span>
                    ) : null}
                    {destinatario.clasificacion ? (
                      <span
                        className={`rounded px-1.5 text-xs font-semibold ${ESTILO_CLASIFICACION[destinatario.clasificacion] ?? "bg-slate-100"}`}
                      >
                        {destinatario.clasificacion}
                      </span>
                    ) : null}
                    {destinatario.estadoAlta ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          destinatario.estadoAlta === "APROBADO" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {destinatario.estadoAlta === "APROBADO" ? "Aprobada" : "Rechazada"}
                      </span>
                    ) : null}
                    {enVista ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700">
                        <Icono nombre="ojo" className="size-3" />
                        en vista previa
                      </span>
                    ) : null}
                  </div>
                  <p className={`font-mono text-xs ${sinCorreo ? "text-red-600" : "text-blue-700"}`}>
                    {destinatario.email || "Sin mail cargado"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    {destinatario.rubro ? <span>{destinatario.rubro}</span> : null}
                    {destinatario.provincia ? <span>{destinatario.provincia}</span> : null}
                    {destinatario.cuit ? <span className="font-mono">CUIT {destinatario.cuit}</span> : null}
                    {destinatario.origen === "cliente" ? (
                      <>
                        {destinatario.deuda > 0 ? (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 font-semibold text-orange-800">
                            Debe {PESOS.format(destinatario.deuda)}
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">Al día</span>
                        )}
                        <Compra destinatario={destinatario} ahora={ahora} />
                        {bloqueado(destinatario) ? (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">
                            {destinatario.situacion}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
          {filtrados.length > visibles ? (
            <li className="p-3 text-center">
              <Button variante="secundario" tamano="sm" onClick={() => setVisibles(visibles + POR_PAGINA)}>
                Mostrar {Math.min(POR_PAGINA, filtrados.length - visibles)} más
              </Button>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
