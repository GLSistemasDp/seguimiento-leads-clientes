import Link from "next/link";
import type { ReactNode } from "react";
import { Icono, type NombreIcono } from "@/components/ui/Icono";
import { GRUPOS, PERIODOS_INFORME, type Grupo, type Informe, type PeriodoInforme } from "@/lib/reclamos/informe";
import { MOTIVOS_LOGISTICOS, type MotivoLogistico } from "@/types/reclamo";
import {
  Apiladas100,
  BarraInline,
  BarrasHorizontales,
  Columnas,
  ColumnasAgrupadas,
  Dona,
  Embudo,
  Lineas,
  SinDatos,
  Sparkline,
  numero,
  pesos,
  pesosCorto,
} from "./Graficos";

const ICONO_GRUPO: Record<Grupo, NombreIcono> = {
  CALIDAD: "escudo",
  LOGISTICA: "flecha",
  FACTURACION: "documento",
  OTROS: "chat",
};

const COLOR_SEVERIDAD = { CRITICA: "#dc2626", MODERADA: "#f59e0b", LEVE: "#16a34a" } as const;

const COLOR_MOTIVO: Record<MotivoLogistico, string> = {
  FALTANTE: "#2563eb",
  SOBRANTE: "#93c5fd",
  DANO_TRANSITO: "#dc2626",
  DEMORA: "#f59e0b",
};

function dias(valor: number | null): string {
  return valor === null ? "—" : `${numero.format(Math.round(valor * 10) / 10)} ${valor === 1 ? "día" : "días"}`;
}

function porcentaje(valor: number): string {
  return `${Math.round(valor)}%`;
}

// --- Piezas ---------------------------------------------------------------------------

function Card({ titulo, icono, children }: { titulo: string; icono: NombreIcono; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-600">{titulo}</h2>
        <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icono nombre={icono} className="size-4" />
        </span>
      </div>
      {children}
    </section>
  );
}

function Seccion({ numero: n, titulo, descripcion, children }: { numero: number; titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-slate-200 pt-6 first:border-0 first:pt-0">
      <div>
        <p className="text-xs font-semibold tracking-wide text-blue-700 uppercase">Sección {n}</p>
        <h3 className="text-lg font-semibold text-slate-900">{titulo}</h3>
        <p className="text-sm text-slate-500">{descripcion}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function Panel({ titulo, nota, children, ancho = false }: { titulo: string; nota?: ReactNode; children: ReactNode; ancho?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-4 ${ancho ? "lg:col-span-2" : ""}`}>
      <h4 className="text-sm font-semibold text-slate-800">{titulo}</h4>
      {children}
      {nota ? <p className="text-xs text-slate-500">{nota}</p> : null}
    </div>
  );
}

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{etiqueta}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{valor}</p>
      {detalle ? <p className="text-xs text-slate-500">{detalle}</p> : null}
    </div>
  );
}

// --- Cards -------------------------------------------------------------------------------

function CardActivos({ informe }: { informe: Informe }) {
  const { total, variacion, serie, mesPasado } = informe.activos;
  const sube = variacion !== null && variacion > 0;
  const baja = variacion !== null && variacion < 0;
  return (
    <Card titulo="Reclamos activos" icono="alerta">
      <p className="text-4xl font-black text-[#1b2b5e] tabular-nums">{total}</p>
      <p className={`text-sm font-medium ${sube ? "text-red-600" : baja ? "text-emerald-600" : "text-slate-500"}`}>
        {variacion === null
          ? "Sin activos hace un mes para comparar"
          : variacion === 0
            ? "= igual que el mes pasado"
            : `${sube ? "▲" : "▼"} ${porcentaje(Math.abs(variacion))} vs. mes pasado`}
        <span className="ml-1 font-normal text-slate-400">({mesPasado} hace 30 días)</span>
      </p>
      <Sparkline valores={serie} color={sube ? "#dc2626" : "#16a34a"} etiqueta={`Reclamos activos por día, últimos 30 días: de ${serie[0]} a ${serie[serie.length - 1]}`} />
      <p className="text-[11px] text-slate-400">Abiertos cada día, últimos 30 días</p>
    </Card>
  );
}

function CardResolucion({ informe }: { informe: Informe }) {
  const { promedio, meta, cantidad, porGrupo } = informe.resolucion;
  const enMeta = promedio !== null && promedio <= meta;
  return (
    <Card titulo="Tiempo promedio de resolución" icono="reloj">
      <p className="text-4xl font-black text-[#1b2b5e] tabular-nums">{dias(promedio)}</p>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Meta: {dias(meta)}</span>
        {promedio !== null ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${enMeta ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            ● {enMeta ? "En meta" : `${dias(promedio - meta)} por encima`}
          </span>
        ) : null}
      </p>
      <ul className="mt-1 grid grid-cols-3 gap-2">
        {porGrupo.map(({ grupo, promedio: valor }) => (
          <li key={grupo} className="rounded-lg bg-slate-50 px-2 py-1.5">
            <p className="truncate text-[11px] text-slate-500">{GRUPOS[grupo].etiqueta.split(" /")[0]}</p>
            <p className={`text-sm font-semibold tabular-nums ${valor !== null && valor > meta ? "text-red-600" : "text-slate-900"}`}>{dias(valor)}</p>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-400">
        {cantidad} {cantidad === 1 ? "resuelto" : "resueltos"} en los últimos {informe.periodo.etiqueta}
      </p>
    </Card>
  );
}

function CardCausa({ informe }: { informe: Informe }) {
  const principal = informe.principal;
  if (!principal) {
    return (
      <Card titulo="Causa principal" icono="grafico">
        <p className="text-sm text-slate-500">Sin reclamos en los últimos {informe.periodo.etiqueta}.</p>
      </Card>
    );
  }
  const { color } = GRUPOS[principal.grupo];
  return (
    <Card titulo="Causa principal" icono="grafico">
      <p className="text-4xl font-black tabular-nums" style={{ color }}>
        {porcentaje(principal.porcentaje)}
      </p>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="flex size-6 items-center justify-center rounded-md text-white" style={{ background: color }}>
          <Icono nombre={ICONO_GRUPO[principal.grupo]} className="size-3.5" />
        </span>
        {principal.clasificacion}
      </p>
      <BarraInline valor={principal.cantidad} maximo={informe.total} color={color} />
      <p className="text-[11px] text-slate-400">
        {principal.cantidad} de {informe.total} reclamos · {GRUPOS[principal.grupo].etiqueta} · últimos {informe.periodo.etiqueta}
      </p>
    </Card>
  );
}

// --- Secciones -------------------------------------------------------------------------

function PorTipo({ informe }: { informe: Informe }) {
  const { grupos, meses } = informe.tipos;
  const maximo = Math.max(...grupos.map((grupo) => grupo.cantidad), 0);
  return (
    <Seccion numero={1} titulo="Desglose por tipo de reclamo" descripcion="Cantidad, peso sobre el total y cómo evolucionó cada tipo mes a mes.">
      <Panel titulo={`Por tipo · últimos ${informe.periodo.etiqueta}`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="pb-2 font-medium">Tipo</th>
              <th className="w-[35%] pb-2 font-medium">Cantidad</th>
              <th className="w-14 pb-2 text-right font-medium">%</th>
              <th className="w-24 pb-2 text-right font-medium">12 meses</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((fila) => (
              <tr key={fila.grupo} className="border-t border-slate-100">
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-2 text-slate-800">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: GRUPOS[fila.grupo].color }} />
                    {GRUPOS[fila.grupo].etiqueta}
                  </span>
                </td>
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-2">
                    <span className="w-7 text-right font-semibold tabular-nums">{fila.cantidad}</span>
                    <BarraInline valor={fila.cantidad} maximo={maximo} color={GRUPOS[fila.grupo].color} />
                  </span>
                </td>
                <td className="py-2 text-right text-slate-600 tabular-nums">{porcentaje(fila.porcentaje)}</td>
                <td className="py-2 pl-2">
                  <Sparkline valores={fila.mensual} color={GRUPOS[fila.grupo].color} etiqueta={`${GRUPOS[fila.grupo].etiqueta}: reclamos por mes`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel titulo="Evolución mensual por tipo">
        <Lineas
          etiquetas={meses.map((mes) => mes.etiqueta)}
          series={grupos.map((fila) => ({ nombre: GRUPOS[fila.grupo].etiqueta, color: GRUPOS[fila.grupo].color, valores: fila.mensual }))}
          descripcion="Reclamos por mes de cada tipo, últimos 12 meses"
        />
      </Panel>
    </Seccion>
  );
}

function Calidad({ informe }: { informe: Informe }) {
  const { calidad } = informe;
  const maximoLote = Math.max(...calidad.lotes.map((lote) => lote.cantidad), 0);
  const conSeveridad = calidad.severidades.reduce((suma, fila) => suma + fila.cantidad, 0);
  return (
    <Seccion
      numero={2}
      titulo="Detalle de calidad"
      descripcion={`Los ${calidad.total} reclamos de calidad / producto de los últimos ${informe.periodo.etiqueta}: la parte más sensible en EPP.`}
    >
      <Panel titulo="Reclamos por tipo de EPP" nota="El tipo sale de la descripción de los productos; se puede corregir en cada reclamo.">
        {calidad.total ? <BarrasHorizontales filas={calidad.epp.map((fila) => ({ etiqueta: fila.etiqueta, valor: fila.cantidad }))} color="#dc2626" /> : <SinDatos>Sin reclamos de calidad.</SinDatos>}
      </Panel>
      <Panel
        titulo="Top 5 lotes con más reclamos"
        nota={calidad.sinLote ? `${calidad.sinLote} reclamos de calidad sin lote informado.` : "Alerta temprana de problemas de producción."}
      >
        {calidad.lotes.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">Lote</th>
                <th className="pb-2 font-medium">Producto</th>
                <th className="w-[30%] pb-2 font-medium">Reclamos</th>
              </tr>
            </thead>
            <tbody>
              {calidad.lotes.map((fila) => (
                <tr key={`${fila.lote}-${fila.producto}`} className="border-t border-slate-100">
                  <td className="py-2 pr-2 font-mono text-xs font-semibold text-slate-900">{fila.lote}</td>
                  <td className="max-w-0 truncate py-2 pr-2 text-slate-700" title={fila.producto}>
                    {fila.producto}
                  </td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-right font-semibold tabular-nums">{fila.cantidad}</span>
                      <BarraInline valor={fila.cantidad} maximo={maximoLote} color={fila.cantidad >= 3 ? "#dc2626" : "#f59e0b"} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <SinDatos>Ningún reclamo de calidad trae lote.</SinDatos>
        )}
      </Panel>
      <Panel titulo="Reclamos por severidad" nota={calidad.sinSeveridad ? `${calidad.sinSeveridad} sin severidad cargada.` : undefined}>
        {conSeveridad ? (
          <Dona
            partes={calidad.severidades.map((fila) => ({ etiqueta: fila.etiqueta, valor: fila.cantidad, color: COLOR_SEVERIDAD[fila.clave] }))}
            centro={String(conSeveridad)}
            descripcion="Reclamos de calidad por severidad"
          />
        ) : (
          <SinDatos>Cargá la severidad en cada reclamo (sección Gestión) para ver este gráfico.</SinDatos>
        )}
      </Panel>
      <Panel titulo="Reincidencia" nota="Clientes o productos con más de un reclamo de calidad en el período.">
        {calidad.reincidentes.length ? (
          <table className="w-full text-sm">
            <tbody>
              {calidad.reincidentes.map((fila) => (
                <tr key={`${fila.tipo}-${fila.etiqueta}`} className="border-t border-slate-100 first:border-0">
                  <td className="w-20 py-1.5 text-xs text-slate-500">{fila.tipo}</td>
                  <td className="max-w-0 truncate py-1.5 text-slate-800" title={fila.etiqueta}>
                    {fila.etiqueta}
                  </td>
                  <td className="w-12 py-1.5 text-right">
                    <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 tabular-nums">×{fila.cantidad}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <SinDatos>Sin reincidencias en el período.</SinDatos>
        )}
      </Panel>
    </Seccion>
  );
}

function Logistica({ informe }: { informe: Informe }) {
  const { logistica } = informe;
  const motivos = Object.keys(MOTIVOS_LOGISTICOS) as MotivoLogistico[];
  const series = motivos.map((motivo) => ({ etiqueta: MOTIVOS_LOGISTICOS[motivo], color: COLOR_MOTIVO[motivo] }));
  const conDemora = logistica.transportistas.filter((fila) => fila.demora !== null);
  return (
    <Seccion numero={3} titulo="Detalle logístico" descripcion={`Los ${logistica.total} reclamos de logística (faltantes, demoras, expedición) de los últimos ${informe.periodo.etiqueta}.`}>
      <Panel titulo="Demora promedio de entrega por transportista" nota={`Promedio general: ${dias(logistica.demoraPromedio)}. Sale de los "días de demora" cargados en cada reclamo.`}>
        {conDemora.length ? (
          <Columnas
            filas={conDemora.map((fila) => ({ etiqueta: fila.etiqueta, valor: fila.demora, nota: `${fila.cantidad} recl.` }))}
            formato={(valor) => `${numero.format(Math.round(valor * 10) / 10)} d`}
            color="#2563eb"
          />
        ) : (
          <SinDatos>Sin días de demora cargados.</SinDatos>
        )}
      </Panel>
      <Panel titulo="Faltante / sobrante vs. daño en tránsito, por transportista">
        {logistica.total ? (
          <Apiladas100
            filas={[
              ...logistica.transportistas.map((fila) => ({ etiqueta: fila.etiqueta, partes: motivos.map((motivo) => fila.motivos[motivo]) })),
              { etiqueta: "Total", partes: motivos.map((motivo) => logistica.motivos[motivo]) },
            ].filter((fila) => fila.partes.some((valor) => valor > 0))}
            series={series}
          />
        ) : (
          <SinDatos>Sin reclamos de logística.</SinDatos>
        )}
      </Panel>
      <Panel titulo="Reclamos por transportista">
        {logistica.total ? <BarrasHorizontales filas={logistica.transportistas.map((fila) => ({ etiqueta: fila.etiqueta, valor: fila.cantidad }))} /> : <SinDatos>Sin reclamos de logística.</SinDatos>}
      </Panel>
      <Panel titulo="Reclamos por depósito de despacho">
        {logistica.total ? <BarrasHorizontales filas={logistica.depositos.map((fila) => ({ etiqueta: fila.etiqueta, valor: fila.cantidad }))} color="#0ea5e9" /> : <SinDatos>Sin reclamos de logística.</SinDatos>}
      </Panel>
    </Seccion>
  );
}

function Facturacion({ informe }: { informe: Informe }) {
  const { facturacion } = informe;
  return (
    <Seccion numero={4} titulo="Detalle de facturación" descripcion="Impacto en pesos de las notas de crédito y las disputas por montos.">
      <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
        <Dato etiqueta={`Notas de crédito · ${informe.periodo.etiqueta}`} valor={pesosCorto(facturacion.montoNotas)} detalle={pesos.format(facturacion.montoNotas)} />
        <Dato etiqueta="Reclamos con nota de crédito" valor={String(facturacion.cantidadNotas)} detalle="de todos los tipos" />
        <Dato etiqueta="Resolución de facturación" valor={dias(facturacion.resolucion)} detalle={`Meta: ${dias(informe.resolucion.meta)}`} />
      </div>
      <Panel titulo="Monto en notas de crédito por mes">
        <Lineas
          etiquetas={facturacion.meses.map((mes) => mes.etiqueta)}
          series={[{ nombre: "Notas de crédito", color: "#d97706", valores: facturacion.serieNotas }]}
          formato={pesosCorto}
          descripcion="Monto de notas de crédito emitidas por mes, últimos 12 meses"
        />
      </Panel>
      <Panel titulo="Disputas por motivo" nota={`${facturacion.total} reclamos de facturación en los últimos ${informe.periodo.etiqueta}.`}>
        {facturacion.total ? <BarrasHorizontales filas={facturacion.motivos.map((fila) => ({ etiqueta: fila.etiqueta, valor: fila.cantidad }))} color="#d97706" /> : <SinDatos>Sin reclamos de facturación.</SinDatos>}
      </Panel>
    </Seccion>
  );
}

function Clientes({ informe }: { informe: Informe }) {
  const { clientes } = informe;
  const maximo = Math.max(...clientes.ranking.map((fila) => fila.cantidad), 0);
  const maximoCosto = Math.max(...clientes.ranking.map((fila) => fila.costo), 0);
  return (
    <Seccion
      numero={5}
      titulo="Vista por cliente"
      descripcion={`${clientes.cantidad} clientes reclamaron en los últimos ${informe.periodo.etiqueta}. Los 5 primeros concentran el ${porcentaje(clientes.concentracionTop5)} de los reclamos.`}
    >
      <Panel titulo="Ranking de clientes con más reclamos" ancho nota={`Costo = notas de crédito + otros costos cargados en la gestión. Total del período: ${pesos.format(clientes.costoTotal)}.`}>
        {clientes.ranking.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="w-8 pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="w-[26%] pb-2 font-medium">Reclamos</th>
                  <th className="w-[26%] pb-2 font-medium">Costo total</th>
                </tr>
              </thead>
              <tbody>
                {clientes.ranking.map((fila, indice) => (
                  <tr key={`${fila.codigo}-${fila.cliente}`} className="border-t border-slate-100">
                    <td className="py-2 text-xs text-slate-400 tabular-nums">{indice + 1}</td>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-slate-900">{fila.cliente}</p>
                      {fila.codigo ? <p className="text-xs text-slate-500">N° {fila.codigo}</p> : null}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span className="w-6 text-right font-semibold tabular-nums">{fila.cantidad}</span>
                        <BarraInline valor={fila.cantidad} maximo={maximo} color="#1b2b5e" />
                      </span>
                    </td>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{fila.costo ? pesosCorto(fila.costo) : "—"}</span>
                        <BarraInline valor={fila.costo} maximo={maximoCosto} color="#d97706" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <SinDatos>Sin reclamos en el período.</SinDatos>
        )}
      </Panel>
    </Seccion>
  );
}

function Operativo({ informe }: { informe: Informe }) {
  const { operativo } = informe;
  return (
    <Seccion numero={6} titulo="Estado y seguimiento operativo" descripcion="Cómo avanzan los reclamos del período y quién los tiene.">
      <Panel titulo={`Reclamos por estado · últimos ${informe.periodo.etiqueta}`} nota="En análisis: con indicación de gerencia o evaluación de calidad. Resuelto: con respuesta al cliente. Cerrado: marcado como cerrado en la gestión.">
        {informe.total ? <Embudo etapas={operativo.embudo} /> : <SinDatos>Sin reclamos en el período.</SinDatos>}
      </Panel>
      <Panel titulo={`Carga por responsable · ${operativo.activos} activos hoy`}>
        {operativo.responsables.length ? (
          <BarrasHorizontales filas={operativo.responsables.map((fila) => ({ etiqueta: fila.etiqueta, valor: fila.cantidad, color: fila.etiqueta === "Sin asignar" ? "#94a3b8" : undefined }))} color="#1b2b5e" />
        ) : (
          <SinDatos>No hay reclamos activos.</SinDatos>
        )}
      </Panel>
      <Panel titulo="Canal de ingreso" ancho>
        <BarrasHorizontales filas={operativo.canales.map((fila) => ({ etiqueta: fila.etiqueta, valor: fila.cantidad }))} color="#0ea5e9" />
      </Panel>
    </Seccion>
  );
}

function Historico({ informe }: { informe: Informe }) {
  const { historico } = informe;
  return (
    <Seccion numero={7} titulo="Histórico y tendencias" descripcion="Estacionalidad y mejoras sostenidas, sin importar el período elegido.">
      <Panel
        titulo="Evolución mensual · últimos 24 meses"
        nota={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {historico.trimestres.map((trimestre) => (
              <span key={trimestre.etiqueta}>
                {trimestre.etiqueta}: <strong className="text-slate-700 tabular-nums">{trimestre.cantidad}</strong>
              </span>
            ))}
          </span>
        }
      >
        <Lineas
          etiquetas={historico.meses.map((mes) => mes.etiqueta)}
          series={[{ nombre: "Reclamos", color: "#1b2b5e", valores: historico.serie }]}
          descripcion="Reclamos ingresados por mes, últimos 24 meses"
        />
      </Panel>
      <Panel titulo={`${historico.anioActual} vs. ${historico.anioActual - 1}`}>
        <ColumnasAgrupadas
          etiquetas={historico.comparativa.map((fila) => fila.mes)}
          series={[
            { nombre: String(historico.anioActual - 1), color: "#94a3b8", valores: historico.comparativa.map((fila) => fila.anterior) },
            { nombre: String(historico.anioActual), color: "#1b2b5e", valores: historico.comparativa.map((fila) => fila.actual) },
          ]}
          descripcion={`Reclamos por mes: ${historico.anioActual} contra ${historico.anioActual - 1}`}
        />
      </Panel>
    </Seccion>
  );
}

// --- Informe completo --------------------------------------------------------------------

/** Selector de periodo; `conInforme` deja el desplegable abierto al navegar. */
function Periodos({
  actual,
  parametros,
  conInforme,
}: {
  actual: PeriodoInforme;
  parametros: Record<string, string>;
  conInforme: boolean;
}) {
  return (
    <nav aria-label="Período del informe" className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {(Object.keys(PERIODOS_INFORME) as PeriodoInforme[]).map((periodo) => {
        const query = new URLSearchParams({ ...parametros, periodo });
        if (conInforme) query.set("informe", "1");
        return (
          <Link
            key={periodo}
            href={`/reclamos?${query.toString()}`}
            scroll={false}
            aria-current={actual === periodo ? "true" : undefined}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              actual === periodo ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {PERIODOS_INFORME[periodo].etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Indicadores de reclamos: tres cards siempre visibles y, debajo, un
 * desplegable con el informe completo (siete secciones).
 */
export function InformeReclamos({
  informe,
  abierto,
  parametros,
}: {
  informe: Informe;
  /** El desplegable arranca abierto (al cambiar de periodo desde adentro). */
  abierto: boolean;
  /** Los demas parametros de la URL, para no perderlos al cambiar el periodo. */
  parametros: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">{informe.total}</strong> reclamos por formulario en los últimos {informe.periodo.etiqueta}
        </p>
        <Periodos actual={informe.periodo.clave} parametros={parametros} conInforme={false} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <CardActivos informe={informe} />
        <CardResolucion informe={informe} />
        <CardCausa informe={informe} />
      </div>

      <details open={abierto} className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-semibold text-[#1b2b5e]">
            <Icono nombre="grafico" className="size-4" />
            <span className="group-open:hidden">Ver informe completo</span>
            <span className="hidden group-open:inline">Ocultar informe</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">Tipos, calidad, logística, facturación, clientes, operativo e histórico</span>
            <Icono nombre="abajo" className="size-4 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="flex flex-col gap-6 border-t border-slate-200 p-5">
          <div className="flex justify-end">
            <Periodos actual={informe.periodo.clave} parametros={parametros} conInforme />
          </div>
          <PorTipo informe={informe} />
          <Calidad informe={informe} />
          <Logistica informe={informe} />
          <Facturacion informe={informe} />
          <Clientes informe={informe} />
          <Operativo informe={informe} />
          <Historico informe={informe} />
        </div>
      </details>
    </div>
  );
}
