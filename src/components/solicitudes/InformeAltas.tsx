import Link from "next/link";
import type { ReactNode } from "react";
import { BarrasHorizontales, Columnas, ColumnasAgrupadas, Dona, SinDatos, numero } from "@/components/reclamos/informe/Graficos";
import { Icono } from "@/components/ui/Icono";
import { CATEGORIAS } from "@/lib/solicitudes/evaluacion";
import type { Categoria } from "@/lib/solicitudes/evaluacion";
import { PERIODOS_INFORME_ALTAS, SIN_MOTIVO } from "@/lib/solicitudes/informe";
import type { FilaConteo, InformeAltas as Informe, PeriodoInformeAltas } from "@/lib/solicitudes/informe";
import { formatearDuracion } from "@/lib/solicitudes/presentacion";

const AZUL = "#1b2b5e";
const VERDE = "#16a34a";
const ROJO = "#dc2626";
const GRIS = "#94a3b8";
const COLOR_CATEGORIA: Record<Categoria, string> = { A: VERDE, B: "#0ea5e9", C: "#f59e0b", D: ROJO };

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-slate-200 pt-6 first:border-0 first:pt-0">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{titulo}</h3>
        <p className="text-sm text-slate-500">{descripcion}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function Panel({ titulo, nota, children }: { titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-4">
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

/** Top de una agrupacion como barras, con las aprobadas de cada una al costado. */
function Ranking({ filas, color = AZUL, maximo = 10 }: { filas: readonly FilaConteo[]; color?: string; maximo?: number }) {
  const conDato = filas.filter((fila) => fila.etiqueta !== "Sin informar");
  if (conDato.length === 0) return <SinDatos>Todavía no hay formularios con este dato.</SinDatos>;
  const visibles = conDato.slice(0, maximo);
  const resto = conDato.slice(maximo).reduce((suma, fila) => suma + fila.total, 0);
  return (
    <BarrasHorizontales
      color={color}
      filas={[
        ...visibles.map((fila) => ({
          etiqueta: fila.etiqueta,
          valor: fila.total,
          detalle: fila.aprobadas ? `${fila.aprobadas} aprob.` : undefined,
        })),
        ...(resto ? [{ etiqueta: `Otras (${conDato.length - maximo})`, valor: resto, color: GRIS }] : []),
      ]}
    />
  );
}

function sinInformar(filas: readonly FilaConteo[]): string | undefined {
  const fila = filas.find((item) => item.etiqueta === "Sin informar");
  return fila ? `${fila.total} sin informar (formularios viejos o importados).` : undefined;
}

function Periodos({ actual, parametros }: { actual: PeriodoInformeAltas; parametros: Record<string, string> }) {
  return (
    <nav aria-label="Período del informe" className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {(Object.keys(PERIODOS_INFORME_ALTAS) as PeriodoInformeAltas[]).map((periodo) => {
        const query = new URLSearchParams({ ...parametros, periodoInforme: periodo, informe: "1" });
        return (
          <Link
            key={periodo}
            href={`/solicitudes?${query.toString()}`}
            scroll={false}
            aria-current={actual === periodo ? "true" : undefined}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              actual === periodo ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {PERIODOS_INFORME_ALTAS[periodo].etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

export function InformeAltas({
  informe,
  abierto,
  parametros,
}: {
  informe: Informe;
  abierto: boolean;
  /** Los demas parametros de la URL, para no perderlos al cambiar el periodo. */
  parametros: Record<string, string>;
}) {
  const principalProvincia = informe.provincias.find((fila) => fila.etiqueta !== "Sin informar");
  const principalActividad = informe.actividades.find((fila) => fila.etiqueta !== "Sin informar");
  const principalMotivo = informe.motivosRechazo.find((fila) => fila.motivo !== SIN_MOTIVO);

  return (
    <details open={abierto} className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#1b2b5e]">
          <Icono nombre="grafico" className="size-4" />
          <span className="group-open:hidden">Ver informe completo</span>
          <span className="hidden group-open:inline">Ocultar informe</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <span className="hidden sm:inline">Provincias, actividad, motivos de rechazo, canales y evolución</span>
          <Icono nombre="abajo" className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="flex flex-col gap-6 border-t border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{informe.total}</strong> solicitudes recibidas
            {informe.periodo.clave === "todo" ? " en total" : ` en los últimos ${informe.periodo.etiqueta}`}
          </p>
          <Periodos actual={informe.periodo.clave} parametros={parametros} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dato
            etiqueta="Tasa de aprobación"
            valor={informe.tasaAprobacion === null ? "—" : `${Math.round(informe.tasaAprobacion)}%`}
            detalle={`${informe.aprobadas} aprobadas de ${informe.aprobadas + informe.rechazadas} decididas`}
          />
          <Dato
            etiqueta="Tiempo de resolución"
            valor={informe.horasResolucion === null ? "—" : formatearDuracion(informe.horasResolucion)}
            detalle="Del ingreso a la decisión, en promedio"
          />
          <Dato
            etiqueta="Formulario completado"
            valor={informe.puntajePromedio === null ? "—" : `${Math.round(informe.puntajePromedio)}%`}
            detalle="Promedio de lo que completan"
          />
          <Dato etiqueta="Sin CUIT válido" valor={numero.format(informe.cuitInvalidos)} detalle="Hay que pedirlo antes de decidir" />
        </div>

        <Seccion
          titulo="De dónde llegan"
          descripcion={
            principalProvincia
              ? `${principalProvincia.etiqueta} es la provincia que más solicitudes envía (${principalProvincia.total}).`
              : "Provincia de la dirección legal y canal por el que nos conocieron."
          }
        >
          <Panel titulo="Provincias que más solicitudes envían" nota={sinInformar(informe.provincias)}>
            <Ranking filas={informe.provincias} />
          </Panel>
          <Panel titulo="Cómo nos conocieron" nota="Al costado, cuántas de cada canal terminaron aprobadas.">
            <Ranking filas={informe.canales} color="#2563eb" />
          </Panel>
        </Seccion>

        <Seccion
          titulo="A qué se dedican"
          descripcion={
            principalActividad
              ? `La actividad más común es ${principalActividad.etiqueta} (${principalActividad.total} solicitudes).`
              : "Tipo de industria, tamaño y forma de compra de las empresas."
          }
        >
          <Panel titulo="Actividad de la empresa" nota={sinInformar(informe.actividades)}>
            <Ranking filas={informe.actividades} />
          </Panel>
          <Panel titulo="Tamaño (cantidad de empleados)" nota={sinInformar(informe.porTamano)}>
            {informe.porTamano.some((fila) => fila.etiqueta !== "Sin informar") ? (
              <Columnas
                color={AZUL}
                filas={informe.porTamano
                  .filter((fila) => fila.etiqueta !== "Sin informar")
                  .map((fila) => ({ etiqueta: fila.etiqueta, valor: fila.total }))}
              />
            ) : (
              <SinDatos>Todavía no hay formularios con este dato.</SinDatos>
            )}
          </Panel>
          <Panel titulo="Tipo de compra">
            <Ranking filas={informe.tiposCompra} color="#0ea5e9" />
          </Panel>
          <Panel titulo="Cómo reciben la mercadería">
            <Ranking filas={informe.envios} color="#0ea5e9" />
          </Panel>
        </Seccion>

        <Seccion
          titulo="Cómo se deciden"
          descripcion={
            principalMotivo
              ? `El motivo de rechazo más común es "${principalMotivo.motivo}" (${principalMotivo.cantidad}).`
              : "Resultado de las solicitudes y por qué se rechazan."
          }
        >
          <Panel titulo="Estado de las solicitudes">
            <Dona
              descripcion="Solicitudes por estado"
              centro={String(informe.total)}
              partes={[
                { etiqueta: "Aprobadas", valor: informe.aprobadas, color: VERDE },
                { etiqueta: "Rechazadas", valor: informe.rechazadas, color: ROJO },
                { etiqueta: "Pendientes", valor: informe.pendientes, color: AZUL },
              ]}
            />
          </Panel>
          <Panel
            titulo="Motivos de rechazo"
            nota={
              informe.rechazadas > informe.rechazosConMotivo
                ? `${informe.rechazadas - informe.rechazosConMotivo} rechazadas antes de que se pidiera el motivo.`
                : undefined
            }
          >
            {informe.motivosRechazo.length ? (
              <BarrasHorizontales
                color={ROJO}
                filas={informe.motivosRechazo.map((fila) => ({
                  etiqueta: fila.motivo,
                  valor: fila.cantidad,
                  color: fila.motivo === SIN_MOTIVO ? GRIS : undefined,
                }))}
              />
            ) : (
              <SinDatos>No hay solicitudes rechazadas en el período.</SinDatos>
            )}
          </Panel>
          <Panel titulo="Qué tan completo llega el formulario" nota="Clasificación por lo que completaron: datos, documentos y firma.">
            <BarrasHorizontales
              filas={(Object.keys(CATEGORIAS) as Categoria[]).map((categoria) => ({
                etiqueta: `${categoria} · ${CATEGORIAS[categoria].etiqueta}`,
                valor: informe.categorias[categoria],
                color: COLOR_CATEGORIA[categoria],
              }))}
            />
          </Panel>
          <Panel titulo="Recibidas y aprobadas por mes">
            <ColumnasAgrupadas
              descripcion="Solicitudes recibidas y aprobadas por mes"
              etiquetas={informe.porMes.map((mes) => mes.etiqueta)}
              series={[
                { nombre: "Recibidas", color: AZUL, valores: informe.porMes.map((mes) => mes.recibidas) },
                { nombre: "Aprobadas", color: VERDE, valores: informe.porMes.map((mes) => mes.aprobadas) },
              ]}
            />
          </Panel>
        </Seccion>
      </div>
    </details>
  );
}
