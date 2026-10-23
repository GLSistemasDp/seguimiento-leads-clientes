import "server-only";
import type { Pool } from "pg";
import { simularMensajes } from "@/lib/bot/simulador";
import { CLIENTES, DEPOSITOS, PRODUCTOS, RESPONSABLES, TRANSPORTES, reclamosDemo } from "@/lib/db/demo/reclamos";
import { consultasDemo } from "@/lib/db/demo/seguimiento";
import { insertarReclamo } from "@/lib/db/postgres/reclamos";
import { separarCliente } from "@/lib/seguimiento/presentacion";

/**
 * Datos de ejemplo para el prototipo (DB_SEMILLA="demo"): clientes, catalogos,
 * las consultas de la demo de seguimiento (las respondidas pasan por el
 * trigger de archivado), mensajes recientes del bot simulado y 96 reclamos.
 * Corre una sola vez por base: deja una marca en almacen_registros.
 */

const RECLAMOS_SEMILLA = 96;
const MARCA = ["crm", "semilla-demo"] as const;

/** Generador con semilla fija, para que la carga sea siempre la misma. */
function azarFijo(semilla: number): () => number {
  let estado = semilla;
  return () => {
    estado = (estado * 1_103_515_245 + 12_345) % 2_147_483_648;
    return estado / 2_147_483_648;
  };
}

export async function sembrarSiHaceFalta(pool: Pool): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('crm_semilla'))");
    const { rows } = await cliente.query("SELECT 1 FROM almacen_registros WHERE coleccion = $1 AND clave = $2", [...MARCA]);
    if (rows.length > 0) {
      await cliente.query("COMMIT");
      return;
    }

    // Catalogos.
    for (const [nombre] of TRANSPORTES) await cliente.query("INSERT INTO transportistas (nombre) VALUES ($1) ON CONFLICT DO NOTHING", [nombre]);
    for (const [nombre] of DEPOSITOS) await cliente.query("INSERT INTO depositos (nombre) VALUES ($1) ON CONFLICT DO NOTHING", [nombre]);
    for (const nombre of new Set(Object.values(RESPONSABLES))) {
      const area = /\(([^)]+)\)/.exec(nombre)?.[1] ?? "";
      await cliente.query("INSERT INTO empleados (nombre, area) VALUES ($1, $2) ON CONFLICT DO NOTHING", [nombre, area]);
    }
    for (const producto of PRODUCTOS) {
      await cliente.query(
        `INSERT INTO productos (codigo, descripcion, epp_id)
         VALUES ($1, $2, (SELECT id FROM epp WHERE nombre = fn_inferir_epp($2))) ON CONFLICT DO NOTHING`,
        [producto.codigo, producto.descripcion],
      );
    }

    // Clientes: los de la demo de seguimiento (con su ficha) y los de los reclamos de ejemplo.
    const consultas = consultasDemo();
    for (const consulta of consultas) {
      const { codigo, nombre } = separarCliente(consulta.cliente);
      if (!codigo) continue;
      const grupo = consulta.grupoVendedor.trim();
      if (grupo) await cliente.query("INSERT INTO grupos_vendedor (nombre) VALUES ($1) ON CONFLICT DO NOTHING", [grupo]);
      await cliente.query(
        `INSERT INTO clientes (codigo, nombre, lista_precio, clasificacion, grupo_vendedor_id, grupo_whatsapp, situacion)
         VALUES ($1, $2, $3, $4, (SELECT id FROM grupos_vendedor WHERE nombre = $5), $6, $7)
         ON CONFLICT (codigo) DO NOTHING`,
        [codigo, nombre, consulta.listaPrecio, consulta.clasificacion.toUpperCase(), grupo, consulta.grupoWhatsapp, consulta.estadoCuenta],
      );
    }
    for (const [codigo, nombre] of CLIENTES) {
      await cliente.query(
        "INSERT INTO clientes (codigo, nombre, clasificacion, situacion) VALUES ($1, $2, 'B', 'OK') ON CONFLICT (codigo) DO NOTHING",
        [codigo, nombre],
      );
    }

    // Seguimiento: entran todas como pendientes y las respondidas se finalizan
    // con un UPDATE, asi pasan por el trigger igual que en la operacion real.
    for (const consulta of consultas) {
      const { codigo } = separarCliente(consulta.cliente);
      await cliente.query(
        `INSERT INTO consultas_seguimiento (id, cliente_id, cliente_texto, fecha, encargado, grupo_whatsapp, consulta, hito_id, hito, observaciones, origen)
         VALUES ($1, (SELECT id FROM clientes WHERE codigo = $2), $3, $4, $5, $6, $7, (SELECT id FROM hitos WHERE nombre = $8), $8, $9, 'semilla')`,
        [consulta.id, codigo, consulta.cliente, consulta.fecha, consulta.encargado, consulta.grupoWhatsapp, consulta.consulta, consulta.hito, consulta.observaciones],
      );
      if (consulta.respondida) {
        await cliente.query(
          "UPDATE consultas_seguimiento SET respondida = true, resultado = 'Resuelto', observaciones = 'Resuelto' WHERE id = $1",
          [consulta.id],
        );
      }
    }

    // Mensajes recientes del bot simulado (ultimos 4 dias).
    const { rows: conGrupo } = await cliente.query<{ codigo: string; nombre: string; grupo_whatsapp: string }>(
      "SELECT codigo, nombre, grupo_whatsapp FROM clientes WHERE codigo IS NOT NULL AND grupo_whatsapp <> ''",
    );
    const ahora = Date.now();
    const mensajes = simularMensajes(
      conGrupo.map((fila) => ({ codigo: fila.codigo, nombre: fila.nombre, grupoWhatsapp: fila.grupo_whatsapp })),
      24,
      { desde: ahora - 4 * 86_400_000, hasta: ahora, azar: azarFijo(1022) },
    );
    for (const mensaje of mensajes) {
      const { codigo } = separarCliente(mensaje.cliente);
      await cliente.query(
        `INSERT INTO consultas_seguimiento (cliente_id, cliente_texto, fecha, encargado, grupo_whatsapp, consulta, hito_id, hito, mensaje_id)
         VALUES ((SELECT id FROM clientes WHERE codigo = $1), $2, $3, 'bot', $4, $5, (SELECT id FROM hitos WHERE nombre = $6), $6, $7)`,
        [codigo, mensaje.cliente, mensaje.fecha, mensaje.grupoWhatsapp, mensaje.consulta, mensaje.hito, mensaje.mensajeId],
      );
    }

    // Reclamos de ejemplo.
    const reclamos = reclamosDemo(ahora, RECLAMOS_SEMILLA);
    for (const reclamo of reclamos) await insertarReclamo(cliente, reclamo);
    await cliente.query("SELECT setval('reclamos_numero_seq', $1)", [reclamos.length]);
    await cliente.query("REFRESH MATERIALIZED VIEW mv_reclamos_evolucion_mensual");

    await cliente.query("INSERT INTO almacen_registros (coleccion, clave, datos) VALUES ($1, $2, $3)", [
      ...MARCA,
      JSON.stringify({ cargada: new Date().toISOString(), reclamos: reclamos.length, consultas: consultas.length + mensajes.length }),
    ]);
    await cliente.query("COMMIT");
    console.info(`[postgres] semilla demo cargada: ${reclamos.length} reclamos, ${consultas.length + mensajes.length} consultas`);
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}
