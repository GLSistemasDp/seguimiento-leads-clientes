import "server-only";
import { consultar } from "@/lib/db/postgres/pg";
import {
  GRUPOS,
  MES_CORTO,
  PERIODOS_INFORME,
  claveMes,
  ultimosMeses,
  type Grupo,
  type Informe,
  type PeriodoInforme,
} from "@/lib/reclamos/informe";
import type {
  MvReclamosEvolucionMensualRow,
  VwFacturacionResumenRow,
  VwHistoricoTrimestralRow,
  VwLogisticaPorDepositoRow,
  VwLogisticaPorTransportistaRow,
  VwRankingClientesReclamosRow,
  VwReclamosActivosDiariosRow,
  VwReclamosKpisRow,
  VwReclamosPorCanalRow,
  VwReclamosPorClasificacionRow,
  VwReclamosPorEppRow,
  VwReclamosPorGrupoRow,
  VwReclamosPorResponsableRow,
  VwReclamosSeveridadRow,
  VwReincidenciaProductoRow,
  VwTopLotesReclamosRow,
} from "@/types/db";
import { CANALES_INGRESO, SEVERIDADES, type MotivoLogistico } from "@/types/reclamo";

/**
 * El informe de reclamos armado con las vistas de Postgres (db/schema.sql),
 * con la misma forma que `calcularInforme` para que las pantallas no cambien.
 */

const n = (valor: string | number | null | undefined) => (valor === null || valor === undefined ? 0 : Number(valor));
const nulo = (valor: string | null | undefined) => (valor === null || valor === undefined ? null : Number(valor));

const ordenar = <T extends { cantidad: number; etiqueta: string }>(filas: T[]) =>
  filas.sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta));

export async function informeDesdeVistas(ahoraFecha: Date, periodo: PeriodoInforme, meta: number): Promise<Informe> {
  const ahora = ahoraFecha.getTime();
  const dias = PERIODOS_INFORME[periodo].dias;
  const p = [dias];
  const [
    [kpis],
    activosDiarios,
    porGrupo,
    porClasificacion,
    porEpp,
    lotes,
    severidades,
    reincidencia,
    transportistas,
    depositos,
    [facturacion],
    ranking,
    responsables,
    canales,
    evolucion,
    trimestres,
  ] = await Promise.all([
    consultar<VwReclamosKpisRow>("SELECT * FROM vw_reclamos_kpis WHERE periodo_dias = $1", p),
    consultar<VwReclamosActivosDiariosRow>("SELECT * FROM vw_reclamos_activos_diarios ORDER BY dia"),
    consultar<VwReclamosPorGrupoRow>("SELECT * FROM vw_reclamos_por_grupo WHERE periodo_dias = $1", p),
    consultar<VwReclamosPorClasificacionRow>(
      "SELECT * FROM vw_reclamos_por_clasificacion WHERE periodo_dias = $1 ORDER BY cantidad DESC, clasificacion LIMIT 1",
      p,
    ),
    consultar<VwReclamosPorEppRow>("SELECT * FROM vw_reclamos_por_epp WHERE periodo_dias = $1", p),
    consultar<VwTopLotesReclamosRow>(
      "SELECT * FROM vw_top_lotes_reclamos WHERE periodo_dias = $1 ORDER BY cantidad DESC, lote LIMIT 5",
      p,
    ),
    consultar<VwReclamosSeveridadRow>("SELECT * FROM vw_reclamos_severidad WHERE periodo_dias = $1", p),
    consultar<VwReincidenciaProductoRow>(
      "SELECT * FROM vw_reincidencia_producto WHERE periodo_dias = $1 ORDER BY cantidad DESC, etiqueta LIMIT 10",
      p,
    ),
    consultar<VwLogisticaPorTransportistaRow>("SELECT * FROM vw_logistica_por_transportista WHERE periodo_dias = $1", p),
    consultar<VwLogisticaPorDepositoRow>("SELECT * FROM vw_logistica_por_deposito WHERE periodo_dias = $1", p),
    consultar<VwFacturacionResumenRow>("SELECT * FROM vw_facturacion_resumen WHERE periodo_dias = $1", p),
    consultar<VwRankingClientesReclamosRow>(
      "SELECT * FROM vw_ranking_clientes_reclamos WHERE periodo_dias = $1 ORDER BY cantidad DESC, costo DESC",
      p,
    ),
    consultar<VwReclamosPorResponsableRow>("SELECT * FROM vw_reclamos_por_responsable"),
    consultar<VwReclamosPorCanalRow>("SELECT * FROM vw_reclamos_por_canal WHERE periodo_dias = $1", p),
    consultar<MvReclamosEvolucionMensualRow>("SELECT * FROM mv_reclamos_evolucion_mensual"),
    consultar<VwHistoricoTrimestralRow>("SELECT * FROM vw_historico_trimestral ORDER BY trimestre"),
  ]);

  const total = n(kpis.total);
  const porcentaje = (cantidad: number, base = total) => (base === 0 ? 0 : (cantidad / base) * 100);

  // Evolucion mensual (vista materializada) indexada por mes y grupo.
  const evolucionMes = new Map<string, { cantidad: number; montoNc: number }>();
  for (const fila of evolucion) {
    const clave = `${fila.mes.slice(0, 7)}|${fila.grupo}`;
    evolucionMes.set(clave, { cantidad: n(fila.cantidad), montoNc: n(fila.monto_nc) });
  }
  const grupos = Object.keys(GRUPOS) as Grupo[];
  const delMes = (mes: string, campo: "cantidad" | "montoNc", grupo?: Grupo) =>
    (grupo ? [grupo] : grupos).reduce((suma, g) => suma + (evolucionMes.get(`${mes}|${g}`)?.[campo] ?? 0), 0);

  const meses12 = ultimosMeses(ahora, 12);
  const meses24 = ultimosMeses(ahora, 24);
  const anioActual = Number(claveMes(ahora).slice(0, 4));
  const mesActual = Number(claveMes(ahora).slice(5));

  const activos = n(kpis.activos);
  const mesPasado = n(kpis.activos_mes_pasado);
  const principal = porClasificacion[0];

  const motivosLogisticos = (fila: VwLogisticaPorTransportistaRow): Record<MotivoLogistico, number> => ({
    FALTANTE: n(fila.faltante),
    SOBRANTE: n(fila.sobrante),
    DANO_TRANSITO: n(fila.dano_transito),
    DEMORA: n(fila.demora),
  });
  const filasTransportistas = ordenar(
    transportistas.map((fila) => ({
      etiqueta: fila.transportista,
      cantidad: n(fila.cantidad),
      demora: nulo(fila.demora_promedio),
      motivos: motivosLogisticos(fila),
    })),
  );
  const motivosTotal = filasTransportistas.reduce(
    (suma, fila) => {
      for (const motivo of Object.keys(suma) as MotivoLogistico[]) suma[motivo] += fila.motivos[motivo];
      return suma;
    },
    { FALTANTE: 0, SOBRANTE: 0, DANO_TRANSITO: 0, DEMORA: 0 } as Record<MotivoLogistico, number>,
  );

  const rankingFilas = ranking.map((fila) => ({
    cliente: fila.cliente,
    codigo: fila.cliente_codigo,
    cantidad: n(fila.cantidad),
    costo: n(fila.costo),
  }));

  // Los trimestres que tocan la ventana de 24 meses (el primero puede quedar parcial).
  const [anioInicio, mesInicio] = meses24[0].clave.split("-").map(Number);
  const desdeTrimestre = `${anioInicio}-${String(Math.floor((mesInicio - 1) / 3) * 3 + 1).padStart(2, "0")}`;
  const trimestresVentana = trimestres
    .filter((fila) => fila.trimestre.slice(0, 7) >= desdeTrimestre && fila.trimestre.slice(0, 7) <= claveMes(ahora))
    .map((fila) => {
      const [anio, mes] = fila.trimestre.split("-").map(Number);
      return { etiqueta: `T${Math.ceil(mes / 3)} ${String(anio).slice(2)}`, cantidad: n(fila.cantidad) };
    });

  return {
    periodo: { clave: periodo, dias, etiqueta: PERIODOS_INFORME[periodo].etiqueta },
    total,
    activos: {
      total: activos,
      mesPasado,
      variacion: mesPasado === 0 ? null : ((activos - mesPasado) / mesPasado) * 100,
      serie: activosDiarios.map((fila) => n(fila.activos)),
    },
    resolucion: {
      promedio: nulo(kpis.resolucion_promedio),
      meta,
      cantidad: n(kpis.resueltos),
      porGrupo: [
        { grupo: "CALIDAD" as const, promedio: nulo(kpis.resolucion_calidad) },
        { grupo: "LOGISTICA" as const, promedio: nulo(kpis.resolucion_logistica) },
        { grupo: "FACTURACION" as const, promedio: nulo(kpis.resolucion_facturacion) },
      ],
    },
    principal: principal
      ? {
          clasificacion: principal.clasificacion,
          cantidad: n(principal.cantidad),
          porcentaje: porcentaje(n(principal.cantidad)),
          grupo: principal.grupo,
        }
      : null,
    tipos: {
      meses: meses12,
      grupos: grupos.map((grupo) => {
        const cantidad = n(porGrupo.find((fila) => fila.grupo === grupo)?.cantidad);
        return { grupo, cantidad, porcentaje: porcentaje(cantidad), mensual: meses12.map((mes) => delMes(mes.clave, "cantidad", grupo)) };
      }),
    },
    calidad: {
      total: n(kpis.calidad),
      epp: ordenar(porEpp.map((fila) => ({ etiqueta: fila.tipo_epp, cantidad: n(fila.cantidad) }))),
      lotes: lotes.map((fila) => ({ lote: fila.lote, producto: fila.producto, cantidad: n(fila.cantidad) })),
      sinLote: n(kpis.calidad_sin_lote),
      severidades: (Object.keys(SEVERIDADES) as (keyof typeof SEVERIDADES)[]).map((clave) => ({
        clave,
        etiqueta: SEVERIDADES[clave],
        cantidad: n(severidades.find((fila) => fila.severidad === clave)?.cantidad),
      })),
      sinSeveridad: n(kpis.calidad_sin_severidad),
      reincidentes: reincidencia.map((fila) => ({ tipo: fila.tipo, etiqueta: fila.etiqueta, cantidad: n(fila.cantidad) })),
    },
    logistica: {
      total: n(kpis.logistica),
      demoraPromedio: nulo(kpis.demora_promedio),
      transportistas: filasTransportistas,
      depositos: ordenar(depositos.map((fila) => ({ etiqueta: fila.deposito, cantidad: n(fila.cantidad) }))),
      motivos: motivosTotal,
    },
    facturacion: {
      total: n(facturacion.total),
      montoNotas: n(facturacion.monto_nc),
      cantidadNotas: n(facturacion.cantidad_nc),
      serieNotas: meses12.map((mes) => delMes(mes.clave, "montoNc")),
      meses: meses12,
      motivos: ordenar(
        [
          { etiqueta: "Error de monto (diferencia de precio o contra factura)", cantidad: n(facturacion.error_monto) },
          { etiqueta: "Otros motivos (error de facturación)", cantidad: n(facturacion.otros_motivos) },
        ].filter((fila) => fila.cantidad > 0),
      ),
      resolucion: nulo(kpis.resolucion_facturacion),
    },
    clientes: {
      ranking: rankingFilas.slice(0, 10),
      cantidad: rankingFilas.length,
      concentracionTop5: porcentaje(rankingFilas.slice(0, 5).reduce((suma, fila) => suma + fila.cantidad, 0)),
      costoTotal: rankingFilas.reduce((suma, fila) => suma + fila.costo, 0),
    },
    operativo: {
      embudo: [
        { etapa: "Abiertos (ingresados)", cantidad: total },
        { etapa: "En análisis", cantidad: n(kpis.en_analisis) },
        { etapa: "Resueltos", cantidad: n(kpis.resueltos_del_periodo) },
        { etapa: "Cerrados", cantidad: n(kpis.cerrados_del_periodo) },
      ],
      responsables: ordenar(responsables.map((fila) => ({ etiqueta: fila.responsable, cantidad: n(fila.cantidad) }))),
      canales: (Object.keys(CANALES_INGRESO) as (keyof typeof CANALES_INGRESO)[]).map((canal) => ({
        etiqueta: CANALES_INGRESO[canal],
        cantidad: n(canales.find((fila) => fila.canal === canal)?.cantidad),
      })),
      activos,
    },
    historico: {
      meses: meses24,
      serie: meses24.map((mes) => delMes(mes.clave, "cantidad")),
      trimestres: trimestresVentana,
      anioActual,
      comparativa: MES_CORTO.map((mes, indice) => {
        const numero = String(indice + 1).padStart(2, "0");
        return {
          mes,
          actual: indice + 1 <= mesActual ? delMes(`${anioActual}-${numero}`, "cantidad") : null,
          anterior: delMes(`${anioActual - 1}-${numero}`, "cantidad"),
        };
      }),
    },
  };
}
