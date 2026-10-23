import { CAMPOS_CIERRE, type AccionReclamo, type Gestion, type Reclamo } from "@/types/reclamo";

/**
 * Formularios de reclamo de ejemplo para DB_BACKEND="demo": unos 15 meses de
 * historia para que el informe de reclamos tenga con que mostrarse. Los datos
 * se generan con una semilla fija: siempre salen los mismos.
 */

const DIA = 86_400_000;

/** Generador pseudoaleatorio con semilla (mulberry32). */
function azar(semilla: number) {
  let estado = semilla;
  const siguiente = () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    numero: siguiente,
    entre: (minimo: number, maximo: number) => minimo + Math.floor(siguiente() * (maximo - minimo + 1)),
    si: (probabilidad: number) => siguiente() < probabilidad,
    /** Elige segun pesos: [[valor, peso], ...]. */
    pesado<T>(opciones: readonly (readonly [T, number])[]): T {
      const total = opciones.reduce((suma, [, peso]) => suma + peso, 0);
      let resto = siguiente() * total;
      for (const [valor, peso] of opciones) {
        resto -= peso;
        if (resto <= 0) return valor;
      }
      return opciones[opciones.length - 1][0];
    },
    uno<T>(lista: readonly T[]): T {
      return lista[Math.floor(siguiente() * lista.length)];
    },
  };
}

export const CLIENTES = [
  ["1200", "Distribuidora del Sur", 9],
  ["1201", "Seguridad Industrial Norte", 7],
  ["1202", "Ferretería Central", 4],
  ["1203", "Suministros del Oeste", 4],
  ["1204", "Protección Integral", 6],
  ["1205", "Insumos del Litoral", 3],
  ["1206", "Metalúrgica Andina", 3],
  ["1207", "Constructora Patagónica", 5],
  ["1208", "Agro Insumos Pampeanos", 2],
  ["1209", "Petroservicios Neuquén", 4],
  ["1210", "Bulonera Rosario", 2],
  ["1211", "Montajes Cuyo", 2],
  ["1212", "Industrias del Plata", 3],
  ["1213", "Higiene y Seguridad Córdoba", 2],
  ["1214", "Logística Mediterránea", 1],
  ["1215", "Frigorífico San Jorge", 1],
] as const;

/** Productos con los lotes en circulacion; el primer lote de los dos primeros viene con problemas. */
export const PRODUCTOS = [
  { codigo: "85803E", descripcion: "Guante moteado talle 8", lotes: ["L2406-118", "L2409-031"], peso: 6 },
  { codigo: "RES-400", descripcion: "Semimáscara respiratoria doble filtro", lotes: ["L2506-090", "L2412-066"], peso: 4 },
  { codigo: "GUA-310", descripcion: "Guante anticorte nivel 5", lotes: ["L2411-207", "L2502-044"], peso: 3 },
  { codigo: "UCU021E", descripcion: "Anteojo negro patilla recta regulable", lotes: ["L2501-009", "L2505-077"], peso: 3 },
  { codigo: "UCU022E", descripcion: "Anteojo claro patilla recta", lotes: ["L2504-015"], peso: 2 },
  { codigo: "PRO-220", descripcion: "Protector auditivo de copa", lotes: ["L2410-150"], peso: 2 },
  { codigo: "TAP-015", descripcion: "Tapón auditivo reutilizable con cordón", lotes: ["L2507-021"], peso: 1 },
  { codigo: "DPA00002", descripcion: "Arnés de seguridad 3 argollas", lotes: ["L2408-301"], peso: 2 },
  { codigo: "DPA000103", descripcion: "Cabo de vida simple con amortiguador", lotes: ["L2502-118"], peso: 1 },
  { codigo: "CAS-100", descripcion: "Casco de seguridad con arnés textil", lotes: ["L2503-019"], peso: 2 },
  { codigo: "BOT-742", descripcion: "Botín de seguridad puntera de acero", lotes: ["L2501-240", "L2508-012"], peso: 3 },
  { codigo: "CHV-200", descripcion: "Chaleco vial amarillo liviano", lotes: ["L2504-300"], peso: 1 },
  { codigo: "UCU0002PV", descripcion: "Cono vial reflectivo 70 cm", lotes: ["L2505-140"], peso: 1 },
] as const;

export const TRANSPORTES = [
  ["Vía Cargo", 4, 6],
  ["Andreani", 4, 3],
  ["Expreso Cruz del Sur", 3, 8],
  ["Transporte propio", 3, 2],
  ["Retira el cliente", 1, 1],
] as const;

export const DEPOSITOS = [
  ["Depósito Central (Bs. As.)", 6],
  ["Depósito Córdoba", 2],
  ["Depósito Rosario", 2],
] as const;

const CLASIFICACIONES = [
  ["Falla de Calidad", 34],
  ["Faltante de Mercadería", 18],
  ["Plazo de Entrega", 14],
  ["Error de Facturación", 12],
  ["Diferencia de Precio", 12],
  ["Error de Cliente", 8],
] as const satisfies readonly (readonly [Reclamo["clasificacion"], number])[];

export const RESPONSABLES: Record<Reclamo["clasificacion"], string> = {
  "Falla de Calidad": "Marcela Gómez (Calidad)",
  "Faltante de Mercadería": "Javier Ruiz (Logística)",
  "Plazo de Entrega": "Javier Ruiz (Logística)",
  "Error de Facturación": "Laura Fernández (Administración)",
  "Diferencia de Precio": "Laura Fernández (Administración)",
  "Error de Cliente": "Diego Sosa (Comercial)",
};

const DETALLES: Record<Reclamo["clasificacion"], readonly string[]> = {
  "Falla de Calidad": [
    "Detectamos fallas en la terminación de parte de los productos recibidos.",
    "Varias unidades se descosieron en la primera semana de uso.",
    "El recubrimiento se desprende al poco tiempo de uso.",
    "Las piezas llegaron con defectos de fabricación visibles.",
  ],
  "Faltante de Mercadería": [
    "Recibimos menos unidades que las indicadas en el remito. Solicitamos el envío de las faltantes.",
    "Faltó una caja completa del pedido.",
    "Las cajas llegaron abiertas y con producto dañado.",
  ],
  "Plazo de Entrega": [
    "El pedido no llegó en la fecha acordada. Necesitamos confirmar una nueva fecha de entrega.",
    "La entrega se demoró y tenemos obra parada.",
  ],
  "Error de Facturación": [
    "La factura incluye unidades que no corresponden al pedido. Solicitamos revisar el comprobante.",
    "Nos facturaron dos veces el mismo remito.",
  ],
  "Diferencia de Precio": [
    "El precio facturado difiere del acordado en la orden de compra.",
    "No se aplicó el descuento acordado por volumen.",
  ],
  "Error de Cliente": [
    "Seleccionamos un modelo incorrecto al realizar el pedido. Consultamos por una alternativa.",
    "Pedimos un talle equivocado y necesitamos cambiarlo.",
  ],
};

const ACCION: Record<Reclamo["clasificacion"], AccionReclamo> = {
  "Falla de Calidad": "CAMBIO",
  "Faltante de Mercadería": "FALTANTES",
  "Plazo de Entrega": "REPOSICION",
  "Error de Facturación": "NOTA_CREDITO",
  "Diferencia de Precio": "NOTA_CREDITO",
  "Error de Cliente": "SUSTITUTO",
};

/** Dias tipicos hasta responderle al cliente, por clasificacion. */
const RESOLUCION: Record<Reclamo["clasificacion"], readonly [number, number]> = {
  "Falla de Calidad": [2, 9],
  "Faltante de Mercadería": [1, 4],
  "Plazo de Entrega": [1, 5],
  "Error de Facturación": [1, 6],
  "Diferencia de Precio": [2, 7],
  "Error de Cliente": [1, 3],
};

function diaArgentina(momento: number): string {
  return new Date(momento - 3 * 3_600_000).toISOString().slice(0, 10);
}

export function reclamosDemo(ahora = Date.now(), cantidad = 150): Reclamo[] {
  const r = azar(20261022);
  const reclamos: Reclamo[] = [];

  for (let i = 0; i < cantidad; i += 1) {
    // Mas densidad en los ultimos meses: hay mas reclamos ahora que hace un año.
    const antiguedad = Math.floor(Math.pow(r.numero(), 1.25) * 455);
    const ingreso = ahora - antiguedad * DIA - r.entre(0, 8) * 3_600_000;
    const clasificacion = r.pesado(CLASIFICACIONES);
    const [codigoCliente, razonSocial] = r.pesado(CLIENTES.map((cliente) => [cliente, cliente[2]] as const));
    const producto = r.pesado(PRODUCTOS.map((item) => [item, clasificacion === "Falla de Calidad" ? item.peso : 1] as const));
    // Los dos lotes con problemas concentran los reclamos de calidad.
    const lote =
      clasificacion === "Falla de Calidad" && producto.lotes.length > 1 && r.si(0.65) ? producto.lotes[0] : r.uno(producto.lotes);
    const facturada = r.entre(2, 30) * 10;
    const [transporte, , demoraBase] = r.pesado(TRANSPORTES.map((item) => [item, item[1]] as const));
    const delCliente = r.si(0.7);

    // Estado segun la antiguedad: los viejos estan casi todos resueltos.
    const [minimo, maximo] = RESOLUCION[clasificacion];
    const dias = r.entre(minimo, maximo) + (r.si(0.15) ? r.entre(2, 6) : 0);
    const probabilidadResuelto = antiguedad > 25 ? 1 : antiguedad > dias + 3 ? 0.9 : antiguedad > dias ? 0.6 : 0.15;
    const resuelto = r.si(probabilidadResuelto) && ingreso + dias * DIA < ahora ? ingreso + dias * DIA + r.entre(1, 6) * 3_600_000 : null;
    const cerrado = resuelto && r.si(0.8) && resuelto + 3 * DIA < ahora ? resuelto + r.entre(1, 3) * DIA : null;
    const indicado = resuelto !== null || (antiguedad >= 1 && r.si(0.6));

    const notaCredito =
      (clasificacion === "Error de Facturación" || clasificacion === "Diferencia de Precio") && r.si(0.85)
        ? r.entre(15, 450) * 1000
        : clasificacion === "Faltante de Mercadería" && r.si(0.3)
          ? r.entre(20, 180) * 1000
          : clasificacion === "Falla de Calidad" && r.si(0.25)
            ? r.entre(30, 320) * 1000
            : null;

    const gestion: Gestion = {
      responsable: indicado ? RESPONSABLES[clasificacion] : "",
      severidad:
        clasificacion === "Falla de Calidad"
          ? r.pesado([["CRITICA", 15], ["MODERADA", 45], ["LEVE", 40]] as const)
          : indicado
            ? r.pesado([["MODERADA", 30], ["LEVE", 70]] as const)
            : null,
      tipoEpp: null,
      canalIngreso: delCliente ? "PORTAL" : r.pesado([["MAIL", 5], ["TELEFONO", 3], ["COMERCIAL", 4]] as const),
      deposito: r.pesado(DEPOSITOS),
      transportista: "",
      motivoLogistico:
        clasificacion === "Faltante de Mercadería"
          ? r.pesado([["FALTANTE", 70], ["SOBRANTE", 10], ["DANO_TRANSITO", 20]] as const)
          : clasificacion === "Plazo de Entrega"
            ? "DEMORA"
            : null,
      diasDemora: clasificacion === "Plazo de Entrega" ? Math.max(1, demoraBase + r.entre(-2, 4)) : null,
      montoNotaCredito: resuelto ? notaCredito : null,
      numeroNotaCredito: resuelto && notaCredito ? `NC-0003-${String(18_000 + i).padStart(8, "0")}` : "",
      costoAdicional: clasificacion === "Falla de Calidad" && resuelto && r.si(0.5) ? r.entre(8, 40) * 1000 : null,
      cerrado: cerrado !== null,
    };

    const id = `REC-${String(i + 1).padStart(4, "0")}`;
    const cierre: Record<string, string | null> = Object.fromEntries(CAMPOS_CIERRE.map((campo) => [campo, null]));
    if (resuelto) cierre["Respuesta al cliente"] = "Se informó al cliente la resolución del reclamo.";
    if (gestion.montoNotaCredito) {
      cierre["Nota de crédito N°"] = `NC-0003-${String(18_000 + i).padStart(8, "0")}`;
      cierre["Responsable de nota de crédito"] = "Laura Fernández";
    }

    reclamos.push({
      id,
      fecha: diaArgentina(ingreso),
      razonSocial,
      numeroCliente: codigoCliente,
      sucursal: "Casa central",
      transporte,
      contacto: r.uno(["Lucía Pérez", "Martín López", "Ana García", "Diego Ruiz", "Carolina Díaz", "Pablo Torres"]),
      cargo: "Compras",
      telefono: "011 0000-0000",
      email: `compras${codigoCliente}@example.com`,
      ordenCompra: `OC-${800 + i}`,
      pedido: `PED-${2400 + i}`,
      factura: `0001-${String(4200 + i).padStart(8, "0")}`,
      remito: `R-${3100 + i}`,
      clasificacion,
      detalle: r.uno(DETALLES[clasificacion]),
      productos: [
        {
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          lote,
          cantidadFacturada: facturada,
          cantidadReclamo: Math.max(1, Math.round(facturada * r.entre(5, 40) / 100)),
        },
      ],
      adjuntos: [],
      canal: delCliente ? "cliente" : "intranet",
      calidad: {
        clasificacion: resuelto ? clasificacion : null,
        causa: resuelto ? "Analizado por el Asegurador de Calidad." : null,
        procedente: resuelto ? clasificacion !== "Error de Cliente" : null,
        acciones: [],
      },
      cierre,
      indicacion: indicado
        ? {
            accion: ACCION[clasificacion],
            sustitutos: ACCION[clasificacion] === "SUSTITUTO" ? [{ producto: "GUA-205 · Guante tejido con nitrilo", observacion: "" }] : [],
            comentario: "",
            fecha: new Date(Math.min(ahora, ingreso + r.entre(4, 30) * 3_600_000)).toISOString(),
          }
        : null,
      consultaId: null,
      gestion,
      resueltoEn: resuelto ? new Date(resuelto).toISOString() : null,
      cerradoEn: cerrado ? new Date(cerrado).toISOString() : null,
    });
  }

  // Numeracion en el orden en que entraron.
  return reclamos
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((reclamo, indice) => ({ ...reclamo, id: `REC-${String(indice + 1).padStart(4, "0")}` }));
}
