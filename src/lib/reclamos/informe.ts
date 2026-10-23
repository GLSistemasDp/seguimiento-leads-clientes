import {
  CANALES_INGRESO,
  MOTIVOS_LOGISTICOS,
  SEVERIDADES,
  type CanalIngreso,
  type MotivoLogistico,
  type Reclamo,
  type Severidad,
} from "@/types/reclamo";

/**
 * Informe de reclamos (solo formularios). Funciones puras: reciben los
 * reclamos y el momento de calculo, no leen nada.
 */

const DIA = 86_400_000;

/** Meta de resolucion (dias hasta responderle al cliente). */
export const META_RESOLUCION_DIAS = 3;

export const PERIODOS_INFORME = {
  "30": { dias: 30, etiqueta: "30 días" },
  "90": { dias: 90, etiqueta: "90 días" },
  "365": { dias: 365, etiqueta: "12 meses" },
} as const;
export type PeriodoInforme = keyof typeof PERIODOS_INFORME;

export function esPeriodoInforme(valor: unknown): valor is PeriodoInforme {
  return typeof valor === "string" && Object.hasOwn(PERIODOS_INFORME, valor);
}

// --- Agrupaciones ---------------------------------------------------------------

export const GRUPOS = {
  CALIDAD: { etiqueta: "Calidad / Producto", color: "#dc2626" },
  LOGISTICA: { etiqueta: "Logística", color: "#2563eb" },
  FACTURACION: { etiqueta: "Facturación", color: "#d97706" },
  OTROS: { etiqueta: "Otros / varios", color: "#64748b" },
} as const;
export type Grupo = keyof typeof GRUPOS;

const GRUPO_DE: Record<string, Grupo> = {
  "Falla de Calidad": "CALIDAD",
  "Faltante de Mercadería": "LOGISTICA",
  "Plazo de Entrega": "LOGISTICA",
  "Error de Expedición": "LOGISTICA",
  "Error de Facturación": "FACTURACION",
  "Diferencia de Precio": "FACTURACION",
  "Diferencia contra Factura": "FACTURACION",
  "Error de Cliente": "OTROS",
};

/** La clasificacion del Asegurador de Calidad manda sobre la que eligio el cliente. */
export function clasificacionDe(reclamo: Reclamo): string {
  return reclamo.calidad.clasificacion ?? reclamo.clasificacion;
}

export function grupoDe(reclamo: Reclamo): Grupo {
  return GRUPO_DE[clasificacionDe(reclamo)] ?? "OTROS";
}

const PALABRAS_EPP: readonly (readonly [string, RegExp])[] = [
  ["Protección de manos", /guante|manga/i],
  ["Protección ocular y facial", /anteojo|antiparra|lente|ocular|facial|careta|soldar/i],
  ["Protección auditiva", /auditiv|tap[oó]n|orejera|copa/i],
  ["Protección respiratoria", /respira|barbijo|m[aá]scara|filtro|cartucho/i],
  ["Trabajo en altura (caídas)", /arn[eé]s|cabo de vida|anticaída|anticaida|l[ií]nea de vida|mosquet/i],
  ["Protección de cabeza", /casco/i],
  ["Calzado de seguridad", /bot[ií]n|bota|calzado|zapat/i],
  ["Ropa y señalización vial", /chaleco|cono|cadena|vial|ropa|mameluco|campera|pantal/i],
];

/** Tipo de EPP cargado por la gerencia o deducido de la descripcion de los productos. */
export function tipoEppDe(reclamo: Reclamo): string {
  if (reclamo.gestion.tipoEpp) return reclamo.gestion.tipoEpp;
  const texto = reclamo.productos.map((producto) => producto.descripcion).join(" ");
  return PALABRAS_EPP.find(([, patron]) => patron.test(texto))?.[0] ?? "Otros";
}

export function motivoLogisticoDe(reclamo: Reclamo): MotivoLogistico | null {
  if (reclamo.gestion.motivoLogistico) return reclamo.gestion.motivoLogistico;
  const clasificacion = clasificacionDe(reclamo);
  if (clasificacion === "Faltante de Mercadería") return "FALTANTE";
  if (clasificacion === "Plazo de Entrega") return "DEMORA";
  return null;
}

export function canalDe(reclamo: Reclamo): CanalIngreso {
  return reclamo.gestion.canalIngreso ?? (reclamo.canal === "cliente" ? "PORTAL" : "COMERCIAL");
}

/** El formulario solo trae el dia: cuenta desde las 00:00 de Argentina (los de hoy ya estan activos). */
function ingreso(reclamo: Reclamo): number {
  return new Date(`${reclamo.fecha}T00:00:00-03:00`).getTime();
}

/** Momento en que dejo de estar activo: respondido o cerrado. */
function fin(reclamo: Reclamo): number | null {
  const momento = reclamo.resueltoEn ?? reclamo.cerradoEn;
  return momento ? new Date(momento).getTime() : null;
}

function activoEn(reclamo: Reclamo, momento: number): boolean {
  const final = fin(reclamo);
  return ingreso(reclamo) <= momento && (final === null || final > momento);
}

function diasResolucion(reclamo: Reclamo): number | null {
  const final = reclamo.resueltoEn ? new Date(reclamo.resueltoEn).getTime() : null;
  return final === null ? null : Math.max(0, (final - ingreso(reclamo)) / DIA);
}

export function transportistaDe(reclamo: Reclamo): string {
  return reclamo.gestion.transportista.trim() || reclamo.transporte.trim() || "Sin informar";
}

export function costoDe(reclamo: Reclamo): number {
  return (reclamo.gestion.montoNotaCredito ?? 0) + (reclamo.gestion.costoAdicional ?? 0);
}

function promedio(valores: readonly number[]): number | null {
  return valores.length === 0 ? null : valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

function contar<T>(lista: readonly T[], clave: (item: T) => string | null): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const item of lista) {
    const valor = clave(item);
    if (valor) conteo.set(valor, (conteo.get(valor) ?? 0) + 1);
  }
  return conteo;
}

function ordenado(conteo: Map<string, number>): { etiqueta: string; cantidad: number }[] {
  return [...conteo.entries()]
    .map(([etiqueta, cantidad]) => ({ etiqueta, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta));
}

// --- Meses ---------------------------------------------------------------------------

export const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type Mes = { clave: string; etiqueta: string };

/** "2026-10" en hora de Argentina. */
export function claveMes(momento: number): string {
  return new Date(momento - 3 * 3_600_000).toISOString().slice(0, 7);
}

/** Los ultimos `cantidad` meses, del mas viejo al actual. */
export function ultimosMeses(ahora: number, cantidad: number): Mes[] {
  const [anio, mes] = claveMes(ahora).split("-").map(Number);
  return Array.from({ length: cantidad }, (_, indice) => {
    const fecha = new Date(Date.UTC(anio, mes - 1 - (cantidad - 1 - indice), 1));
    const clave = fecha.toISOString().slice(0, 7);
    return { clave, etiqueta: `${MES_CORTO[fecha.getUTCMonth()]} ${String(fecha.getUTCFullYear()).slice(2)}` };
  });
}

function porMes(reclamos: readonly Reclamo[], meses: readonly Mes[], valor: (reclamo: Reclamo) => number = () => 1): number[] {
  const indice = new Map(meses.map((mes, posicion) => [mes.clave, posicion]));
  const serie = meses.map(() => 0);
  for (const reclamo of reclamos) {
    const posicion = indice.get(claveMes(ingreso(reclamo)));
    if (posicion !== undefined) serie[posicion] += valor(reclamo);
  }
  return serie;
}

// --- Informe ---------------------------------------------------------------------------

export type Informe = ReturnType<typeof calcularInforme>;

export function calcularInforme(todos: readonly Reclamo[], ahoraFecha: Date, periodo: PeriodoInforme, meta = META_RESOLUCION_DIAS) {
  const ahora = ahoraFecha.getTime();
  const { dias, etiqueta } = PERIODOS_INFORME[periodo];
  const desde = ahora - dias * DIA;
  const enPeriodo = todos.filter((reclamo) => ingreso(reclamo) > desde && ingreso(reclamo) <= ahora);
  const total = enPeriodo.length;
  const porcentaje = (cantidad: number, base = total) => (base === 0 ? 0 : (cantidad / base) * 100);

  // Card 1: activos ahora contra el mismo dia del mes pasado, y los ultimos 30 dias.
  const activos = todos.filter((reclamo) => activoEn(reclamo, ahora)).length;
  const activosMesPasado = todos.filter((reclamo) => activoEn(reclamo, ahora - 30 * DIA)).length;
  const serieActivos = Array.from({ length: 30 }, (_, indice) => {
    const momento = ahora - (29 - indice) * DIA;
    return todos.filter((reclamo) => activoEn(reclamo, momento)).length;
  });

  // Card 2: resueltos dentro del periodo.
  const resueltosPeriodo = todos.filter((reclamo) => {
    const final = reclamo.resueltoEn ? new Date(reclamo.resueltoEn).getTime() : null;
    return final !== null && final > desde && final <= ahora;
  });
  const resolucionPor = (lista: readonly Reclamo[]) => promedio(lista.map(diasResolucion).filter((valor): valor is number => valor !== null));

  // Card 3: clasificacion que mas se repite.
  const clasificaciones = ordenado(contar(enPeriodo, clasificacionDe));
  const principal = clasificaciones[0] ?? null;

  // Seccion 1: por tipo.
  const meses12 = ultimosMeses(ahora, 12);
  const grupos = (Object.keys(GRUPOS) as Grupo[]).map((grupo) => {
    const delGrupo = enPeriodo.filter((reclamo) => grupoDe(reclamo) === grupo);
    return {
      grupo,
      cantidad: delGrupo.length,
      porcentaje: porcentaje(delGrupo.length),
      mensual: porMes(
        todos.filter((reclamo) => grupoDe(reclamo) === grupo),
        meses12,
      ),
    };
  });

  // Seccion 2: calidad.
  const calidad = enPeriodo.filter((reclamo) => grupoDe(reclamo) === "CALIDAD");
  const lotes = new Map<string, { lote: string; producto: string; cantidad: number }>();
  for (const reclamo of calidad) {
    for (const producto of reclamo.productos) {
      if (!producto.lote) continue;
      const clave = `${producto.lote}|${producto.codigo}`;
      const actual = lotes.get(clave) ?? { lote: producto.lote, producto: `${producto.codigo} · ${producto.descripcion}`, cantidad: 0 };
      actual.cantidad += 1;
      lotes.set(clave, actual);
    }
  }
  const severidades = (Object.keys(SEVERIDADES) as Severidad[]).map((clave) => ({
    clave,
    etiqueta: SEVERIDADES[clave],
    cantidad: calidad.filter((reclamo) => reclamo.gestion.severidad === clave).length,
  }));
  const reincidentes = [
    ...ordenado(contar(calidad, (reclamo) => reclamo.razonSocial))
      .filter((fila) => fila.cantidad > 1)
      .map((fila) => ({ tipo: "Cliente" as const, ...fila })),
    ...ordenado(
      contar(
        calidad.flatMap((reclamo) => [...new Set(reclamo.productos.map((producto) => `${producto.codigo} · ${producto.descripcion}`))]),
        (producto) => producto,
      ),
    )
      .filter((fila) => fila.cantidad > 1)
      .map((fila) => ({ tipo: "Producto" as const, ...fila })),
  ].sort((a, b) => b.cantidad - a.cantidad);

  // Seccion 3: logistica.
  const logistica = enPeriodo.filter((reclamo) => grupoDe(reclamo) === "LOGISTICA");
  const transportistas = ordenado(contar(logistica, transportistaDe)).map((fila) => {
    const delTransporte = logistica.filter((reclamo) => transportistaDe(reclamo) === fila.etiqueta);
    return {
      ...fila,
      demora: promedio(delTransporte.map((reclamo) => reclamo.gestion.diasDemora).filter((valor): valor is number => valor !== null)),
      motivos: Object.fromEntries(
        (Object.keys(MOTIVOS_LOGISTICOS) as MotivoLogistico[]).map((motivo) => [
          motivo,
          delTransporte.filter((reclamo) => motivoLogisticoDe(reclamo) === motivo).length,
        ]),
      ) as Record<MotivoLogistico, number>,
    };
  });
  const motivosTotal = Object.fromEntries(
    (Object.keys(MOTIVOS_LOGISTICOS) as MotivoLogistico[]).map((motivo) => [
      motivo,
      logistica.filter((reclamo) => motivoLogisticoDe(reclamo) === motivo).length,
    ]),
  ) as Record<MotivoLogistico, number>;
  const demoras = logistica.map((reclamo) => reclamo.gestion.diasDemora).filter((valor): valor is number => valor !== null);

  // Seccion 4: facturacion.
  const facturacion = enPeriodo.filter((reclamo) => grupoDe(reclamo) === "FACTURACION");
  const conNota = todos.filter((reclamo) => (reclamo.gestion.montoNotaCredito ?? 0) > 0);
  const momentoNota = (reclamo: Reclamo) => (reclamo.resueltoEn ? new Date(reclamo.resueltoEn).getTime() : ingreso(reclamo));
  const notasPeriodo = conNota.filter((reclamo) => momentoNota(reclamo) > desde && momentoNota(reclamo) <= ahora);
  const indiceMes = new Map(meses12.map((mes, posicion) => [mes.clave, posicion]));
  const serieNotas = meses12.map(() => 0);
  for (const reclamo of conNota) {
    const posicion = indiceMes.get(claveMes(momentoNota(reclamo)));
    if (posicion !== undefined) serieNotas[posicion] += reclamo.gestion.montoNotaCredito ?? 0;
  }
  const motivoFacturacion = (reclamo: Reclamo) => {
    const clasificacion = clasificacionDe(reclamo);
    return clasificacion === "Diferencia de Precio" || clasificacion === "Diferencia contra Factura"
      ? `Error de monto (${clasificacion.toLowerCase()})`
      : "Otros motivos (error de facturación)";
  };

  // Seccion 5: clientes.
  const clientes = new Map<string, { cliente: string; codigo: string; cantidad: number; costo: number }>();
  for (const reclamo of enPeriodo) {
    const clave = reclamo.numeroCliente || reclamo.razonSocial;
    const actual = clientes.get(clave) ?? { cliente: reclamo.razonSocial, codigo: reclamo.numeroCliente, cantidad: 0, costo: 0 };
    actual.cantidad += 1;
    actual.costo += costoDe(reclamo);
    clientes.set(clave, actual);
  }
  const ranking = [...clientes.values()].sort((a, b) => b.cantidad - a.cantidad || b.costo - a.costo);

  // Seccion 6: operativo.
  const enAnalisis = (reclamo: Reclamo) =>
    reclamo.indicacion !== null || reclamo.calidad.clasificacion !== null || reclamo.resueltoEn !== null || reclamo.cerradoEn !== null;
  const embudo = [
    { etapa: "Abiertos (ingresados)", cantidad: total },
    { etapa: "En análisis", cantidad: enPeriodo.filter(enAnalisis).length },
    { etapa: "Resueltos", cantidad: enPeriodo.filter((reclamo) => reclamo.resueltoEn !== null).length },
    { etapa: "Cerrados", cantidad: enPeriodo.filter((reclamo) => reclamo.cerradoEn !== null).length },
  ];
  const activosAhora = todos.filter((reclamo) => activoEn(reclamo, ahora));
  const responsables = ordenado(contar(activosAhora, (reclamo) => reclamo.gestion.responsable.trim() || "Sin asignar"));
  const canales = (Object.keys(CANALES_INGRESO) as CanalIngreso[]).map((canal) => ({
    etiqueta: CANALES_INGRESO[canal],
    cantidad: enPeriodo.filter((reclamo) => canalDe(reclamo) === canal).length,
  }));

  // Seccion 7: historico.
  const meses24 = ultimosMeses(ahora, 24);
  const anioActual = Number(claveMes(ahora).slice(0, 4));
  const conteoMes = contar(todos, (reclamo) => claveMes(ingreso(reclamo)));
  const comparativa = MES_CORTO.map((mes, indice) => {
    const numero = String(indice + 1).padStart(2, "0");
    return {
      mes,
      actual: Number(numero) <= Number(claveMes(ahora).slice(5)) ? (conteoMes.get(`${anioActual}-${numero}`) ?? 0) : null,
      anterior: conteoMes.get(`${anioActual - 1}-${numero}`) ?? 0,
    };
  });
  const serie24 = porMes(todos, meses24);
  const trimestres: { etiqueta: string; cantidad: number }[] = [];
  meses24.forEach((mes, indice) => {
    const [anio, numero] = mes.clave.split("-").map(Number);
    const etiquetaTrimestre = `T${Math.ceil(numero / 3)} ${String(anio).slice(2)}`;
    const ultimo = trimestres[trimestres.length - 1];
    if (ultimo?.etiqueta === etiquetaTrimestre) ultimo.cantidad += serie24[indice];
    else trimestres.push({ etiqueta: etiquetaTrimestre, cantidad: serie24[indice] });
  });

  return {
    periodo: { clave: periodo, dias, etiqueta },
    total,
    activos: {
      total: activos,
      mesPasado: activosMesPasado,
      variacion: activosMesPasado === 0 ? null : ((activos - activosMesPasado) / activosMesPasado) * 100,
      serie: serieActivos,
    },
    resolucion: {
      promedio: resolucionPor(resueltosPeriodo),
      meta,
      cantidad: resueltosPeriodo.length,
      porGrupo: (["CALIDAD", "LOGISTICA", "FACTURACION"] as const).map((grupo) => ({
        grupo,
        promedio: resolucionPor(resueltosPeriodo.filter((reclamo) => grupoDe(reclamo) === grupo)),
      })),
    },
    principal: principal
      ? {
          clasificacion: principal.etiqueta,
          cantidad: principal.cantidad,
          porcentaje: porcentaje(principal.cantidad),
          grupo: GRUPO_DE[principal.etiqueta] ?? ("OTROS" as Grupo),
        }
      : null,
    tipos: { meses: meses12, grupos },
    calidad: {
      total: calidad.length,
      epp: ordenado(contar(calidad, tipoEppDe)),
      lotes: [...lotes.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5),
      sinLote: calidad.filter((reclamo) => !reclamo.productos.some((producto) => producto.lote)).length,
      severidades,
      sinSeveridad: calidad.filter((reclamo) => !reclamo.gestion.severidad).length,
      reincidentes: reincidentes.slice(0, 10),
    },
    logistica: {
      total: logistica.length,
      demoraPromedio: promedio(demoras),
      transportistas,
      depositos: ordenado(contar(logistica, (reclamo) => reclamo.gestion.deposito.trim() || "Sin informar")),
      motivos: motivosTotal,
    },
    facturacion: {
      total: facturacion.length,
      montoNotas: notasPeriodo.reduce((suma, reclamo) => suma + (reclamo.gestion.montoNotaCredito ?? 0), 0),
      cantidadNotas: notasPeriodo.length,
      serieNotas,
      meses: meses12,
      motivos: ordenado(contar(facturacion, motivoFacturacion)),
      resolucion: resolucionPor(resueltosPeriodo.filter((reclamo) => grupoDe(reclamo) === "FACTURACION")),
    },
    clientes: {
      ranking: ranking.slice(0, 10),
      cantidad: ranking.length,
      concentracionTop5: porcentaje(ranking.slice(0, 5).reduce((suma, fila) => suma + fila.cantidad, 0)),
      costoTotal: ranking.reduce((suma, fila) => suma + fila.costo, 0),
    },
    operativo: { embudo, responsables, canales, activos: activosAhora.length },
    historico: {
      meses: meses24,
      serie: serie24,
      trimestres,
      anioActual,
      comparativa,
    },
  };
}
