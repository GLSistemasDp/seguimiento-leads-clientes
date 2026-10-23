import "server-only";
import type { PoolClient } from "pg";
import { consultar, refrescarEvolucion, transaccion } from "@/lib/db/postgres/pg";
import type { ReclamoRow } from "@/types/db";
import {
  CAMPOS_CIERRE,
  type Adjunto,
  type Calidad,
  type Gestion,
  type Indicacion,
  type NuevoReclamo,
  type ProductoReclamo,
  type Reclamo,
} from "@/types/reclamo";

/**
 * Reclamos sobre las tablas relacionales (RECLAMOS_BACKEND="postgres"):
 * reclamos, reclamo_productos, lotes, indicaciones_reclamo y
 * sustitutos_ofrecidos, con los catalogos de transportistas, depositos,
 * empleados y EPP. Las fechas de resolucion y cierre las pone el trigger
 * fn_reclamo_fechas.
 */

/** Algo con `query`: el pool o un cliente dentro de una transaccion. */
type Db = Pick<PoolClient, "query">;

type FilaReclamo = ReclamoRow & {
  tipo_nombre: string;
  calidad_nombre: string | null;
  transportista: string | null;
  deposito: string | null;
  responsable: string | null;
  epp: string | null;
  productos: ProductoReclamo[];
  indicacion: (Omit<Indicacion, "fecha"> & { fecha: string }) | null;
};

const SELECT_RECLAMO = `
  SELECT r.*,
    t.nombre AS tipo_nombre, tc.nombre AS calidad_nombre, tr.nombre AS transportista,
    d.nombre AS deposito, em.nombre AS responsable, eo.nombre AS epp,
    coalesce((
      SELECT json_agg(json_build_object(
        'codigo', rp.codigo, 'descripcion', rp.descripcion, 'lote', rp.lote,
        'cantidadFacturada', rp.cantidad_facturada, 'cantidadReclamo', rp.cantidad_reclamo
      ) ORDER BY rp.orden)
      FROM reclamo_productos rp WHERE rp.reclamo_id = r.id
    ), '[]'::json) AS productos,
    (
      SELECT json_build_object(
        'accion', i.accion, 'comentario', i.comentario, 'fecha', i.fecha,
        'sustitutos', coalesce((
          SELECT json_agg(json_build_object('producto', s.producto, 'observacion', s.observacion) ORDER BY s.orden)
          FROM sustitutos_ofrecidos s WHERE s.indicacion_id = i.id
        ), '[]'::json)
      )
      FROM indicaciones_reclamo i
      WHERE i.clave = CASE WHEN r.consulta_id IS NOT NULL THEN 'wa-' || r.consulta_id ELSE r.numero END
    ) AS indicacion
  FROM reclamos r
  JOIN tipos_reclamo t ON t.id = r.tipo_reclamo_id
  LEFT JOIN tipos_reclamo tc ON tc.id = r.tipo_calidad_id
  LEFT JOIN transportistas tr ON tr.id = r.transportista_id
  LEFT JOIN depositos d ON d.id = r.deposito_id
  LEFT JOIN empleados em ON em.id = r.responsable_id
  LEFT JOIN epp eo ON eo.id = r.epp_id`;

const numeroONull = (valor: string | null) => (valor === null ? null : Number(valor));

function aReclamo(fila: FilaReclamo): Reclamo {
  return {
    id: fila.numero,
    fecha: fila.fecha,
    razonSocial: fila.razon_social,
    numeroCliente: fila.numero_cliente,
    sucursal: fila.sucursal,
    transporte: fila.transporte_informado,
    contacto: fila.contacto,
    cargo: fila.cargo,
    telefono: fila.telefono,
    email: fila.email,
    ordenCompra: fila.orden_compra,
    pedido: fila.pedido,
    factura: fila.factura,
    remito: fila.remito,
    clasificacion: fila.tipo_nombre as Reclamo["clasificacion"],
    detalle: fila.detalle,
    productos: fila.productos.map((producto) => ({
      ...producto,
      cantidadFacturada: Number(producto.cantidadFacturada),
      cantidadReclamo: Number(producto.cantidadReclamo),
    })),
    adjuntos: fila.adjuntos as Adjunto[],
    canal: fila.origen,
    calidad: {
      clasificacion: fila.calidad_nombre,
      causa: fila.calidad_causa,
      procedente: fila.procedente,
      acciones: fila.acciones_correctivas as Calidad["acciones"],
    },
    cierre: { ...Object.fromEntries(CAMPOS_CIERRE.map((campo) => [campo, null])), ...fila.cierre },
    indicacion: fila.indicacion ? { ...fila.indicacion, fecha: new Date(fila.indicacion.fecha).toISOString() } : null,
    consultaId: fila.consulta_id,
    gestion: {
      responsable: fila.responsable ?? "",
      severidad: fila.severidad,
      tipoEpp: fila.epp,
      canalIngreso: fila.canal_ingreso,
      deposito: fila.deposito ?? "",
      transportista: fila.transportista ?? "",
      motivoLogistico: fila.motivo_logistico,
      diasDemora: numeroONull(fila.dias_demora),
      montoNotaCredito: numeroONull(fila.monto_nc),
      numeroNotaCredito: fila.numero_nc,
      costoAdicional: numeroONull(fila.costo_adicional),
      cerrado: fila.cerrado,
    },
    resueltoEn: fila.resuelto_en?.toISOString() ?? null,
    cerradoEn: fila.cerrado_en?.toISOString() ?? null,
  };
}

// --- Catalogos ---------------------------------------------------------------------------

/** Id del nombre en el catalogo, creandolo si no existe. Null si el nombre viene vacio. */
async function idCatalogo(db: Db, tabla: "transportistas" | "depositos" | "empleados", nombre: string): Promise<number | null> {
  const limpio = nombre.trim();
  if (!limpio) return null;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO ${tabla} (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
    [limpio],
  );
  return rows[0].id;
}

async function idTipo(db: Db, nombre: string | null): Promise<number | null> {
  if (!nombre) return null;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO tipos_reclamo (nombre, grupo) VALUES ($1, 'OTROS') ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
    [nombre],
  );
  return rows[0].id;
}

async function idEpp(db: Db, nombre: string | null): Promise<number | null> {
  if (!nombre) return null;
  const { rows } = await db.query<{ id: number }>("SELECT id FROM epp WHERE nombre = $1", [nombre]);
  return rows[0]?.id ?? null;
}

/** Producto del catalogo por su codigo (lo crea con el EPP deducido si no estaba) y su lote. */
async function productoYLote(db: Db, producto: ProductoReclamo): Promise<{ productoId: number | null; loteId: number | null }> {
  const codigo = producto.codigo.trim();
  if (!codigo) return { productoId: null, loteId: null };
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO productos (codigo, descripcion, epp_id)
     VALUES ($1, $2, (SELECT id FROM epp WHERE nombre = fn_inferir_epp($2)))
     ON CONFLICT (codigo) DO UPDATE SET descripcion = CASE WHEN productos.descripcion = '' THEN EXCLUDED.descripcion ELSE productos.descripcion END
     RETURNING id`,
    [codigo, producto.descripcion.trim()],
  );
  const productoId = rows[0].id;
  const lote = producto.lote.trim();
  if (!lote) return { productoId, loteId: null };
  const { rows: lotes } = await db.query<{ id: number }>(
    `INSERT INTO lotes (producto_id, codigo) VALUES ($1, $2)
     ON CONFLICT (producto_id, codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id`,
    [productoId, lote],
  );
  return { productoId, loteId: lotes[0].id };
}

async function idCliente(db: Db, numeroCliente: string): Promise<number | null> {
  const codigo = numeroCliente.replace(/\D/g, "");
  if (!codigo) return null;
  const { rows } = await db.query<{ id: number }>("SELECT id FROM clientes WHERE codigo = $1", [codigo]);
  return rows[0]?.id ?? null;
}

// --- Escritura ------------------------------------------------------------------------------

/**
 * Inserta un reclamo completo (con productos e indicacion). `reclamo.id`
 * vacio = numero siguiente de la secuencia. Lo usan el alta y la semilla.
 */
export async function insertarReclamo(db: Db, reclamo: Omit<Reclamo, "id"> & { id?: string }): Promise<string> {
  const g = reclamo.gestion;
  const valores = [
    reclamo.id || null,
    reclamo.fecha,
    await idCliente(db, reclamo.numeroCliente),
    reclamo.razonSocial,
    reclamo.numeroCliente,
    reclamo.sucursal,
    reclamo.transporte,
    await idCatalogo(db, "transportistas", g.transportista),
    reclamo.contacto,
    reclamo.cargo,
    reclamo.telefono,
    reclamo.email,
    reclamo.ordenCompra,
    reclamo.pedido,
    reclamo.factura,
    reclamo.remito,
    await idTipo(db, reclamo.clasificacion),
    await idTipo(db, reclamo.calidad.clasificacion),
    reclamo.detalle,
    reclamo.canal,
    reclamo.consultaId,
    reclamo.calidad.causa,
    reclamo.calidad.procedente,
    JSON.stringify(reclamo.calidad.acciones),
    JSON.stringify(reclamo.cierre),
    await idCatalogo(db, "empleados", g.responsable),
    g.severidad,
    await idEpp(db, g.tipoEpp),
    g.canalIngreso,
    await idCatalogo(db, "depositos", g.deposito),
    g.motivoLogistico,
    g.diasDemora,
    g.montoNotaCredito,
    g.numeroNotaCredito,
    g.costoAdicional,
    g.cerrado,
    reclamo.resueltoEn,
    reclamo.cerradoEn,
    JSON.stringify(reclamo.adjuntos),
  ];
  const { rows } = await db.query<{ id: string; numero: string }>(
    `INSERT INTO reclamos (
       numero, fecha, cliente_id, razon_social, numero_cliente, sucursal, transporte_informado, transportista_id,
       contacto, cargo, telefono, email, orden_compra, pedido, factura, remito, tipo_reclamo_id, tipo_calidad_id,
       detalle, origen, consulta_id, calidad_causa, procedente, acciones_correctivas, cierre, responsable_id,
       severidad, epp_id, canal_ingreso, deposito_id, motivo_logistico, dias_demora, monto_nc, numero_nc,
       costo_adicional, cerrado, resuelto_en, cerrado_en, adjuntos
     ) VALUES (
       coalesce($1, 'REC-' || lpad(nextval('reclamos_numero_seq')::text, 4, '0')), $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
       $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39
     ) RETURNING id, numero`,
    valores,
  );
  const { id, numero } = rows[0];

  for (const [orden, producto] of reclamo.productos.entries()) {
    const { productoId, loteId } = await productoYLote(db, producto);
    await db.query(
      `INSERT INTO reclamo_productos (reclamo_id, orden, producto_id, codigo, descripcion, lote_id, lote, cantidad_facturada, cantidad_reclamo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, orden, productoId, producto.codigo, producto.descripcion, loteId, producto.lote, producto.cantidadFacturada, producto.cantidadReclamo],
    );
  }

  if (reclamo.indicacion) {
    const clave = reclamo.consultaId ? `wa-${reclamo.consultaId}` : numero;
    await escribirIndicacion(db, clave, id, reclamo.consultaId, reclamo.indicacion);
  }
  return numero;
}

async function escribirIndicacion(
  db: Db,
  clave: string,
  reclamoId: string | null,
  consultaId: string | null,
  indicacion: Indicacion,
): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO indicaciones_reclamo (clave, reclamo_id, consulta_id, accion, comentario, fecha)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (clave) DO UPDATE SET accion = EXCLUDED.accion, comentario = EXCLUDED.comentario, fecha = EXCLUDED.fecha,
       reclamo_id = coalesce(EXCLUDED.reclamo_id, indicaciones_reclamo.reclamo_id)
     RETURNING id`,
    [clave, reclamoId, consultaId, indicacion.accion, indicacion.comentario, indicacion.fecha],
  );
  const indicacionId = rows[0].id;
  await db.query("DELETE FROM sustitutos_ofrecidos WHERE indicacion_id = $1", [indicacionId]);
  for (const [orden, sustituto] of indicacion.sustitutos.entries()) {
    await db.query(
      "INSERT INTO sustitutos_ofrecidos (indicacion_id, orden, producto, observacion) VALUES ($1, $2, $3, $4)",
      [indicacionId, orden, sustituto.producto, sustituto.observacion],
    );
  }
}

const refrescar = () =>
  refrescarEvolucion().catch((error: unknown) =>
    console.error(`[postgres] no se pudo refrescar la evolucion mensual: ${error instanceof Error ? error.message : String(error)}`),
  );

export async function crear(datos: NuevoReclamo, canal: Reclamo["canal"]): Promise<Reclamo> {
  const numero = await transaccion((db) =>
    insertarReclamo(db, {
      ...datos,
      canal,
      adjuntos: [],
      calidad: { clasificacion: null, causa: null, procedente: null, acciones: [] },
      cierre: Object.fromEntries(CAMPOS_CIERRE.map((campo) => [campo, null])),
      indicacion: null,
      gestion: {
        responsable: "",
        severidad: null,
        tipoEpp: null,
        canalIngreso: canal === "cliente" ? "PORTAL" : null,
        deposito: "",
        transportista: "",
        motivoLogistico: null,
        diasDemora: null,
        montoNotaCredito: null,
        numeroNotaCredito: "",
        costoAdicional: null,
        cerrado: false,
      },
      resueltoEn: null,
      cerradoEn: null,
    }),
  );
  await refrescar();
  const reclamo = await obtener(numero);
  if (!reclamo) throw new Error(`No se encontró el reclamo ${numero} recién creado.`);
  return reclamo;
}

export async function guardarAdjuntos(numero: string, adjuntos: Adjunto[]): Promise<void> {
  await consultar("UPDATE reclamos SET adjuntos = $2 WHERE numero = $1", [numero, JSON.stringify(adjuntos)]);
}

export async function actualizarCalidad(
  numero: string,
  calidad: Calidad,
  cierre: Record<string, string | null>,
): Promise<Reclamo | null> {
  const filas = await transaccion(async (db) => {
    const { rows } = await db.query(
      `UPDATE reclamos SET tipo_calidad_id = $2, calidad_causa = $3, procedente = $4, acciones_correctivas = $5, cierre = $6
        WHERE numero = $1 RETURNING id`,
      [numero, await idTipo(db, calidad.clasificacion), calidad.causa, calidad.procedente, JSON.stringify(calidad.acciones), JSON.stringify(cierre)],
    );
    return rows;
  });
  if (filas.length === 0) return null;
  await refrescar();
  return obtener(numero);
}

export async function actualizarGestion(numero: string, gestion: Gestion): Promise<Reclamo | null> {
  const filas = await transaccion(async (db) => {
    const { rows } = await db.query(
      `UPDATE reclamos SET responsable_id = $2, severidad = $3, epp_id = $4, canal_ingreso = $5, deposito_id = $6,
          transportista_id = $7, motivo_logistico = $8, dias_demora = $9, monto_nc = $10, numero_nc = $11,
          costo_adicional = $12, cerrado = $13
        WHERE numero = $1 RETURNING id`,
      [
        numero,
        await idCatalogo(db, "empleados", gestion.responsable),
        gestion.severidad,
        await idEpp(db, gestion.tipoEpp),
        gestion.canalIngreso,
        await idCatalogo(db, "depositos", gestion.deposito),
        await idCatalogo(db, "transportistas", gestion.transportista),
        gestion.motivoLogistico,
        gestion.diasDemora,
        gestion.montoNotaCredito,
        gestion.numeroNotaCredito,
        gestion.costoAdicional,
        gestion.cerrado,
      ],
    );
    return rows;
  });
  if (filas.length === 0) return null;
  await refrescar();
  return obtener(numero);
}

/** Guarda la indicacion de un reclamo (por numero) o de una consulta de WhatsApp ("wa-<id>"). */
export async function guardarIndicacion(clave: string, indicacion: Indicacion): Promise<void> {
  await transaccion(async (db) => {
    const consultaId = clave.startsWith("wa-") ? clave.slice(3) : null;
    const { rows } = await db.query<{ id: string }>(
      consultaId ? "SELECT id FROM reclamos WHERE consulta_id = $1 LIMIT 1" : "SELECT id FROM reclamos WHERE numero = $1",
      [consultaId ?? clave],
    );
    await escribirIndicacion(db, clave, rows[0]?.id ?? null, consultaId, indicacion);
  });
}

// --- Lectura ------------------------------------------------------------------------------

export async function listar(): Promise<Reclamo[]> {
  return (await consultar<FilaReclamo>(`${SELECT_RECLAMO} ORDER BY r.id`)).map(aReclamo);
}

export async function obtener(numero: string): Promise<Reclamo | null> {
  const [fila] = await consultar<FilaReclamo>(`${SELECT_RECLAMO} WHERE r.numero = $1`, [numero]);
  return fila ? aReclamo(fila) : null;
}

/** Todas las indicaciones por clave (numero de reclamo o "wa-<consulta>"). */
export async function indicaciones(): Promise<Record<string, Indicacion>> {
  const filas = await consultar<{ clave: string; indicacion: Omit<Indicacion, "fecha"> & { fecha: string } }>(
    `SELECT i.clave, json_build_object(
        'accion', i.accion, 'comentario', i.comentario, 'fecha', i.fecha,
        'sustitutos', coalesce((SELECT json_agg(json_build_object('producto', s.producto, 'observacion', s.observacion) ORDER BY s.orden)
                                FROM sustitutos_ofrecidos s WHERE s.indicacion_id = i.id), '[]'::json)
      ) AS indicacion
     FROM indicaciones_reclamo i`,
  );
  return Object.fromEntries(
    filas.map((fila) => [fila.clave, { ...fila.indicacion, fecha: new Date(fila.indicacion.fecha).toISOString() }]),
  );
}
