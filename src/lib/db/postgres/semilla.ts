import "server-only";
import type { Pool } from "pg";
import { simularMensajes } from "@/lib/bot/simulador";
import { CLIENTES, DEPOSITOS, PRODUCTOS, RESPONSABLES, TRANSPORTES, reclamosDemo } from "@/lib/db/demo/reclamos";
import { consultasDemo } from "@/lib/db/demo/seguimiento";
import { separarCliente } from "@/lib/seguimiento/presentacion";

/**
 * Datos de ejemplo para el prototipo (DB_SEMILLA="demo"): clientes, catalogos,
 * las consultas de la demo de seguimiento (las respondidas pasan por el
 * trigger de archivado), mensajes recientes del bot simulado y 96 reclamos.
 *
 * Todo va en inserciones masivas (json_to_recordset): son ~15 idas a la base
 * en vez de miles, para que la primera carga no se corte por tiempo aunque la
 * base este lejos. Corre una sola vez por base: deja una marca en
 * almacen_registros.
 */

const RECLAMOS_SEMILLA = 96;
const MARCA = ["crm", "semilla-demo"];

/** Generador con semilla fija, para que la carga sea siempre la misma. */
function azarFijo(semilla: number): () => number {
  let estado = semilla;
  return () => {
    estado = (estado * 1_103_515_245 + 12_345) % 2_147_483_648;
    return estado / 2_147_483_648;
  };
}

const json = (valor: unknown) => JSON.stringify(valor);

export async function sembrarSiHaceFalta(pool: Pool): Promise<void> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext('crm_semilla'))");
    const { rows } = await db.query("SELECT 1 FROM almacen_registros WHERE coleccion = $1 AND clave = $2", MARCA);
    if (rows.length > 0) {
      await db.query("COMMIT");
      return;
    }
    const ahora = Date.now();

    // --- Catalogos ---
    await db.query("INSERT INTO transportistas (nombre) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING", [
      TRANSPORTES.map(([nombre]) => nombre),
    ]);
    await db.query("INSERT INTO depositos (nombre) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING", [
      DEPOSITOS.map(([nombre]) => nombre),
    ]);
    const empleados = [...new Set(Object.values(RESPONSABLES))].map((nombre) => ({
      nombre,
      area: /\(([^)]+)\)/.exec(nombre)?.[1] ?? "",
    }));
    await db.query(
      `INSERT INTO empleados (nombre, area)
       SELECT nombre, area FROM json_to_recordset($1) AS x (nombre text, area text) ON CONFLICT DO NOTHING`,
      [json(empleados)],
    );
    await db.query(
      `INSERT INTO productos (codigo, descripcion, epp_id)
       SELECT x.codigo, x.descripcion, (SELECT id FROM epp WHERE nombre = fn_inferir_epp(x.descripcion))
       FROM json_to_recordset($1) AS x (codigo text, descripcion text) ON CONFLICT DO NOTHING`,
      [json(PRODUCTOS.map(({ codigo, descripcion }) => ({ codigo, descripcion })))],
    );

    // --- Clientes: los de la demo de seguimiento (con su ficha) y los de los reclamos ---
    const consultas = consultasDemo();
    const clientesSeguimiento = consultas
      .map((consulta) => ({ ...separarCliente(consulta.cliente), consulta }))
      .filter((fila) => fila.codigo)
      .map(({ codigo, nombre, consulta }) => ({
        codigo,
        nombre,
        lista: consulta.listaPrecio,
        clasificacion: consulta.clasificacion.toUpperCase(),
        grupo: consulta.grupoVendedor.trim(),
        whatsapp: consulta.grupoWhatsapp,
        situacion: consulta.estadoCuenta,
      }));
    await db.query("INSERT INTO grupos_vendedor (nombre) SELECT DISTINCT unnest($1::text[]) ON CONFLICT DO NOTHING", [
      clientesSeguimiento.map((fila) => fila.grupo).filter(Boolean),
    ]);
    await db.query(
      `INSERT INTO clientes (codigo, nombre, lista_precio, clasificacion, grupo_vendedor_id, grupo_whatsapp, situacion)
       SELECT DISTINCT ON (x.codigo) x.codigo, x.nombre, x.lista, x.clasificacion, g.id, x.whatsapp, x.situacion
       FROM json_to_recordset($1) AS x (codigo text, nombre text, lista text, clasificacion text, grupo text, whatsapp text, situacion text)
       LEFT JOIN grupos_vendedor g ON g.nombre = x.grupo
       ON CONFLICT (codigo) DO NOTHING`,
      [json(clientesSeguimiento)],
    );
    await db.query(
      `INSERT INTO clientes (codigo, nombre, clasificacion, situacion)
       SELECT x.codigo, x.nombre, 'B', 'OK' FROM json_to_recordset($1) AS x (codigo text, nombre text)
       ON CONFLICT (codigo) DO NOTHING`,
      [json(CLIENTES.map(([codigo, nombre]) => ({ codigo, nombre })))],
    );

    // --- Seguimiento: entran como pendientes y las respondidas se finalizan con
    // un UPDATE, asi pasan por el trigger de archivado igual que en la operacion.
    const insertarConsultas = (filas: unknown[]) =>
      db.query(
        `INSERT INTO consultas_seguimiento (id, cliente_id, cliente_texto, fecha, encargado, grupo_whatsapp, consulta, hito_id, hito, observaciones, origen, mensaje_id)
         SELECT coalesce(x.id, gen_random_uuid()::text), c.id, x.cliente, x.fecha, x.encargado, x.grupo, x.consulta, h.id, x.hito, x.observaciones, x.origen, x.mensaje
         FROM json_to_recordset($1) AS x (id text, codigo text, cliente text, fecha timestamptz, encargado text, grupo text,
                                          consulta text, hito text, observaciones text, origen text, mensaje text)
         LEFT JOIN clientes c ON c.codigo = x.codigo
         LEFT JOIN hitos h ON h.nombre = x.hito`,
        [json(filas)],
      );
    await insertarConsultas(
      consultas.map((consulta) => ({
        id: consulta.id,
        codigo: separarCliente(consulta.cliente).codigo,
        cliente: consulta.cliente,
        fecha: consulta.fecha,
        encargado: consulta.encargado,
        grupo: consulta.grupoWhatsapp,
        consulta: consulta.consulta,
        hito: consulta.hito,
        observaciones: consulta.observaciones,
        origen: "semilla",
        mensaje: null,
      })),
    );
    await db.query(
      "UPDATE consultas_seguimiento SET respondida = true, resultado = 'Resuelto', observaciones = 'Resuelto' WHERE id = ANY($1)",
      [consultas.filter((consulta) => consulta.respondida).map((consulta) => consulta.id)],
    );

    // Mensajes recientes del bot simulado (ultimos 4 dias).
    const { rows: conGrupo } = await db.query<{ codigo: string; nombre: string; grupo_whatsapp: string }>(
      "SELECT codigo, nombre, grupo_whatsapp FROM clientes WHERE codigo IS NOT NULL AND grupo_whatsapp <> ''",
    );
    const mensajes = simularMensajes(
      conGrupo.map((fila) => ({ codigo: fila.codigo, nombre: fila.nombre, grupoWhatsapp: fila.grupo_whatsapp })),
      24,
      { desde: ahora - 4 * 86_400_000, hasta: ahora, azar: azarFijo(1022) },
    );
    await insertarConsultas(
      mensajes.map((mensaje) => ({
        id: null,
        codigo: separarCliente(mensaje.cliente).codigo,
        cliente: mensaje.cliente,
        fecha: mensaje.fecha,
        encargado: "bot",
        grupo: mensaje.grupoWhatsapp,
        consulta: mensaje.consulta,
        hito: mensaje.hito,
        observaciones: "",
        origen: "bot",
        mensaje: mensaje.mensajeId,
      })),
    );

    // --- Reclamos de ejemplo ---
    const reclamos = reclamosDemo(ahora, RECLAMOS_SEMILLA);
    await db.query(
      `INSERT INTO reclamos (
         numero, fecha, cliente_id, razon_social, numero_cliente, sucursal, transporte_informado, contacto, cargo,
         telefono, email, orden_compra, pedido, factura, remito, tipo_reclamo_id, tipo_calidad_id, detalle, origen,
         calidad_causa, procedente, cierre, responsable_id, severidad, canal_ingreso, deposito_id, motivo_logistico,
         dias_demora, monto_nc, numero_nc, costo_adicional, cerrado, resuelto_en, cerrado_en
       )
       SELECT x.numero, x.fecha, c.id, x.razon_social, x.numero_cliente, x.sucursal, x.transporte, x.contacto, x.cargo,
         x.telefono, x.email, x.orden_compra, x.pedido, x.factura, x.remito, t.id, tc.id, x.detalle, x.origen::origen_reclamo,
         x.causa, x.procedente, x.cierre, e.id, x.severidad::severidad_reclamo, x.canal::canal_ingreso, d.id,
         x.motivo::motivo_logistico, x.dias_demora, x.monto_nc, x.numero_nc, x.costo, x.cerrado, x.resuelto_en, x.cerrado_en
       FROM json_to_recordset($1) AS x (
         numero text, fecha date, razon_social text, numero_cliente text, sucursal text, transporte text, contacto text,
         cargo text, telefono text, email text, orden_compra text, pedido text, factura text, remito text, tipo text,
         tipo_calidad text, detalle text, origen text, causa text, procedente boolean, cierre jsonb, responsable text,
         severidad text, canal text, deposito text, motivo text, dias_demora numeric, monto_nc numeric, numero_nc text,
         costo numeric, cerrado boolean, resuelto_en timestamptz, cerrado_en timestamptz
       )
       JOIN tipos_reclamo t ON t.nombre = x.tipo
       LEFT JOIN tipos_reclamo tc ON tc.nombre = x.tipo_calidad
       LEFT JOIN clientes c ON c.codigo = x.numero_cliente
       LEFT JOIN empleados e ON e.nombre = x.responsable
       LEFT JOIN depositos d ON d.nombre = x.deposito`,
      [
        json(
          reclamos.map((r) => ({
            numero: r.id,
            fecha: r.fecha,
            razon_social: r.razonSocial,
            numero_cliente: r.numeroCliente,
            sucursal: r.sucursal,
            transporte: r.transporte,
            contacto: r.contacto,
            cargo: r.cargo,
            telefono: r.telefono,
            email: r.email,
            orden_compra: r.ordenCompra,
            pedido: r.pedido,
            factura: r.factura,
            remito: r.remito,
            tipo: r.clasificacion,
            tipo_calidad: r.calidad.clasificacion,
            detalle: r.detalle,
            origen: r.canal,
            causa: r.calidad.causa,
            procedente: r.calidad.procedente,
            cierre: r.cierre,
            responsable: r.gestion.responsable || null,
            severidad: r.gestion.severidad,
            canal: r.gestion.canalIngreso,
            deposito: r.gestion.deposito || null,
            motivo: r.gestion.motivoLogistico,
            dias_demora: r.gestion.diasDemora,
            monto_nc: r.gestion.montoNotaCredito,
            numero_nc: r.gestion.numeroNotaCredito,
            costo: r.gestion.costoAdicional,
            cerrado: r.gestion.cerrado,
            resuelto_en: r.resueltoEn,
            cerrado_en: r.cerradoEn,
          })),
        ),
      ],
    );

    const productos = reclamos.flatMap((reclamo) =>
      reclamo.productos.map((producto, orden) => ({ numero: reclamo.id, orden, ...producto })),
    );
    const productosJson = json(productos);
    await db.query(
      `INSERT INTO lotes (producto_id, codigo)
       SELECT DISTINCT p.id, x.lote FROM json_to_recordset($1) AS x (codigo text, lote text)
       JOIN productos p ON p.codigo = x.codigo WHERE x.lote <> ''
       ON CONFLICT DO NOTHING`,
      [productosJson],
    );
    await db.query(
      `INSERT INTO reclamo_productos (reclamo_id, orden, producto_id, codigo, descripcion, lote_id, lote, cantidad_facturada, cantidad_reclamo)
       SELECT r.id, x.orden, p.id, x.codigo, x.descripcion, l.id, x.lote, x."cantidadFacturada", x."cantidadReclamo"
       FROM json_to_recordset($1) AS x (numero text, orden int, codigo text, descripcion text, lote text,
                                        "cantidadFacturada" numeric, "cantidadReclamo" numeric)
       JOIN reclamos r ON r.numero = x.numero
       LEFT JOIN productos p ON p.codigo = x.codigo
       LEFT JOIN lotes l ON l.producto_id = p.id AND l.codigo = x.lote`,
      [productosJson],
    );

    const conIndicacion = reclamos.filter((reclamo) => reclamo.indicacion);
    await db.query(
      `INSERT INTO indicaciones_reclamo (clave, reclamo_id, accion, comentario, fecha)
       SELECT x.numero, r.id, x.accion::accion_reclamo, x.comentario, x.fecha
       FROM json_to_recordset($1) AS x (numero text, accion text, comentario text, fecha timestamptz)
       JOIN reclamos r ON r.numero = x.numero`,
      [json(conIndicacion.map((reclamo) => ({ numero: reclamo.id, ...reclamo.indicacion })))],
    );
    await db.query(
      `INSERT INTO sustitutos_ofrecidos (indicacion_id, orden, producto, observacion)
       SELECT i.id, x.orden, x.producto, x.observacion
       FROM json_to_recordset($1) AS x (numero text, orden int, producto text, observacion text)
       JOIN indicaciones_reclamo i ON i.clave = x.numero`,
      [
        json(
          conIndicacion.flatMap((reclamo) =>
            (reclamo.indicacion?.sustitutos ?? []).map((sustituto, orden) => ({ numero: reclamo.id, orden, ...sustituto })),
          ),
        ),
      ],
    );

    await db.query("SELECT setval('reclamos_numero_seq', $1)", [reclamos.length]);
    await db.query("REFRESH MATERIALIZED VIEW mv_reclamos_evolucion_mensual");
    await db.query("INSERT INTO almacen_registros (coleccion, clave, datos) VALUES ($1, $2, $3)", [
      ...MARCA,
      json({ cargada: new Date().toISOString(), reclamos: reclamos.length, consultas: consultas.length + mensajes.length }),
    ]);
    await db.query("COMMIT");
    console.info(`[postgres] semilla demo cargada: ${reclamos.length} reclamos, ${consultas.length + mensajes.length} consultas`);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}
