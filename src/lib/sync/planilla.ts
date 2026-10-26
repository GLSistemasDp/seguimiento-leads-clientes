import "server-only";
import { clasificarVarios, iaConfigurada } from "@/lib/ia/clasificador";
import { pool, postgresConfigurado } from "@/lib/db/postgres/pg";
import { separarCliente } from "@/lib/seguimiento/presentacion";
import { clasificarPorReglas } from "@/lib/seguimiento/relacion";
import type { ClasificacionMensaje, Consulta } from "@/types/seguimiento";

/**
 * Sincronizacion Google Sheets -> Postgres. La planilla de la empresa (donde
 * el bot de WhatsApp carga cada consulta) es la entrada; el CRM trabaja sobre
 * la base:
 *
 * 1. Clientes: "Desplegable" + "MaestroCliente" actualizan la tabla clientes
 *    (la planilla manda en esos datos).
 * 2. Filas nuevas: entran a consultas_seguimiento con id "pl-<huella de la
 *    fila>", asi nunca se duplican aunque la sincronizacion corra mil veces.
 *    Las pendientes se clasifican con IA (con tope por corrida); las que ya
 *    vienen tildadas pasan directo al historial con la fecha de la consulta.
 * 3. Tildes: si en la planilla se tildo RESPUESTA de una consulta que en el
 *    CRM seguia pendiente, se finaliza (el trigger la archiva en el historial).
 *
 * Nunca escribe en la planilla. Un lock de Postgres evita dos corridas a la vez.
 */

const PREFIJO = "pl-";
/** Mensajes nuevos que se clasifican con IA por corrida; el resto, por reglas. */
const MAXIMO_IA = 40;
const MARCA = ["sync", "planilla"] as const;

export type ResultadoSync = {
  estado: "ok" | "omitida" | "error";
  motivo?: string;
  clientes: number;
  nuevas: number;
  nuevasYaRespondidas: number;
  finalizadas: number;
  clasificadasConIa: number;
  filasLeidas: number;
  duracionMs: number;
  fecha: string;
};

export function sincronizacionConfigurada(): boolean {
  return postgresConfigurado() && Boolean(process.env.SEGUIMIENTO_SHEETS_ID);
}

const vacio = (inicio: number, estado: ResultadoSync["estado"], motivo?: string): ResultadoSync => ({
  estado,
  motivo,
  clientes: 0,
  nuevas: 0,
  nuevasYaRespondidas: 0,
  finalizadas: 0,
  clasificadasConIa: 0,
  filasLeidas: 0,
  duracionMs: Date.now() - inicio,
  fecha: new Date().toISOString(),
});

const clasificacionValida = (valor: string) => (["A", "B", "C"].includes(valor.trim().toUpperCase()) ? valor.trim().toUpperCase() : "");

export async function sincronizarPlanilla(): Promise<ResultadoSync> {
  const inicio = Date.now();
  if (!sincronizacionConfigurada()) return vacio(inicio, "omitida", "Falta DATABASE_URL o SEGUIMIENTO_SHEETS_ID.");

  // Se lee antes de tomar el lock: la planilla puede tardar unos segundos.
  const { leerPlanilla } = await import("@/lib/db/sheets/seguimiento");
  const { consultas, fichas } = await leerPlanilla();

  const db = await (await pool()).connect();
  const { rows: lock } = await db.query<{ ok: boolean }>("SELECT pg_try_advisory_lock(hashtext('sync_planilla')) AS ok");
  if (!lock[0].ok) {
    db.release();
    return vacio(inicio, "omitida", "Ya hay una sincronización en curso.");
  }

  try {
    // --- 1. Clientes ------------------------------------------------------------
    const clientes = fichas
      .filter((ficha) => ficha.codigo)
      .map((ficha) => ({
        codigo: ficha.codigo,
        nombre: ficha.nombre,
        lista: ficha.listaPrecio,
        clasificacion: clasificacionValida(ficha.clasificacion),
        grupo: ficha.grupoVendedor.trim(),
        whatsapp: ficha.grupoWhatsapp,
        whatsapp2: ficha.grupoWhatsapp2,
        link: ficha.linkWhatsapp,
        situacion: ficha.situacion,
        observacion: ficha.observacion,
        actividad: ficha.actividad,
        categoria: ficha.categoria,
        condicion: ficha.condicionPago,
        limite: ficha.limiteCredito,
        deuda: ficha.deuda,
        cuit: ficha.cuit ?? "",
      }));
    if (clientes.length > 0) {
      await db.query("INSERT INTO grupos_vendedor (nombre) SELECT DISTINCT unnest($1::text[]) ON CONFLICT DO NOTHING", [
        clientes.map((cliente) => cliente.grupo).filter(Boolean),
      ]);
      await db.query(
        `INSERT INTO clientes (codigo, nombre, lista_precio, clasificacion, grupo_vendedor_id, grupo_whatsapp, grupo_whatsapp2,
                               link_whatsapp, situacion, observacion, actividad, categoria, condicion_pago, limite_credito, deuda, cuit)
         SELECT DISTINCT ON (x.codigo) x.codigo, x.nombre, x.lista, x.clasificacion, g.id, x.whatsapp, x.whatsapp2,
                x.link, x.situacion, x.observacion, x.actividad, x.categoria, x.condicion, x.limite, x.deuda, x.cuit
         FROM json_to_recordset($1) AS x (codigo text, nombre text, lista text, clasificacion text, grupo text, whatsapp text,
              whatsapp2 text, link text, situacion text, observacion text, actividad text, categoria text, condicion text,
              limite text, deuda text, cuit text)
         LEFT JOIN grupos_vendedor g ON g.nombre = x.grupo
         ON CONFLICT (codigo) DO UPDATE SET
           nombre = EXCLUDED.nombre, lista_precio = EXCLUDED.lista_precio, clasificacion = EXCLUDED.clasificacion,
           grupo_vendedor_id = EXCLUDED.grupo_vendedor_id, grupo_whatsapp = EXCLUDED.grupo_whatsapp,
           grupo_whatsapp2 = EXCLUDED.grupo_whatsapp2, link_whatsapp = EXCLUDED.link_whatsapp, situacion = EXCLUDED.situacion,
           observacion = EXCLUDED.observacion, actividad = EXCLUDED.actividad, categoria = EXCLUDED.categoria,
           condicion_pago = EXCLUDED.condicion_pago, limite_credito = EXCLUDED.limite_credito, deuda = EXCLUDED.deuda,
           cuit = CASE WHEN EXCLUDED.cuit <> '' THEN EXCLUDED.cuit ELSE clientes.cuit END,
           actualizado_en = now()`,
        [JSON.stringify(clientes)],
      );
    }

    // --- 2. Que filas ya estan (en la cola o en el historial) ---------------------
    const ids = consultas.map((consulta) => `${PREFIJO}${consulta.id}`);
    const { rows: enCola } = await db.query<{ id: string; respondida: boolean }>(
      "SELECT id, respondida FROM consultas_seguimiento WHERE id = ANY($1)",
      [ids],
    );
    const { rows: enHistorial } = await db.query<{ consulta_id: string; finalizada: boolean }>(
      `SELECT consulta_id, bool_or(tipo = 'finalizada') AS finalizada FROM chat_interacciones
        WHERE consulta_id = ANY($1) GROUP BY consulta_id`,
      [ids],
    );
    const cola = new Map(enCola.map((fila) => [fila.id, fila.respondida]));
    const conocidas = new Set([...cola.keys(), ...enHistorial.map((fila) => fila.consulta_id)]);
    // Las que alguna vez se cerraron: si en el CRM se reabrieron, la tilde de la planilla no las vuelve a cerrar.
    const yaCerradas = new Set(enHistorial.filter((fila) => fila.finalizada).map((fila) => fila.consulta_id));

    const nuevas = consultas.filter((consulta) => !conocidas.has(`${PREFIJO}${consulta.id}`));
    const pendientesNuevas = nuevas.filter((consulta) => !consulta.respondida);
    const conIa = iaConfigurada() ? pendientesNuevas.slice(0, MAXIMO_IA) : [];
    const clasificadas = await clasificarVarios(conIa.map((consulta) => ({ texto: consulta.consulta, hito: consulta.hito })));
    const clasificacion = new Map<string, ClasificacionMensaje>(conIa.map((consulta, indice) => [consulta.id, clasificadas[indice]]));
    const clasificar = (consulta: Consulta) => clasificacion.get(consulta.id) ?? clasificarPorReglas(consulta.consulta, consulta.hito);

    // --- 3. Filas nuevas a la cola ------------------------------------------------
    if (nuevas.length > 0) {
      await db.query(
        `INSERT INTO consultas_seguimiento (id, cliente_id, cliente_texto, fecha, encargado, grupo_whatsapp, consulta, hito_id, hito,
                                            observaciones, tentativo_respuesta, origen, mensaje_id,
                                            relacion_ia, hito_ia, resumen_ia, clasificado_por)
         SELECT x.id, c.id, x.cliente, coalesce(x.fecha, now()), x.encargado, x.grupo, x.consulta, h.id, x.hito,
                x.observaciones, x.tentativo, 'planilla', x.id,
                x.relacion::relacion_cliente, x.hito_ia, x.resumen, x.origen
         FROM json_to_recordset($1) AS x (id text, codigo text, cliente text, fecha timestamptz, encargado text, grupo text,
              consulta text, hito text, observaciones text, tentativo text, relacion text, hito_ia text, resumen text, origen text)
         LEFT JOIN clientes c ON c.codigo = x.codigo
         LEFT JOIN hitos h ON h.nombre = x.hito
         ON CONFLICT (id) DO NOTHING`,
        [
          JSON.stringify(
            nuevas.map((consulta) => {
              const ia = clasificar(consulta);
              return {
                id: `${PREFIJO}${consulta.id}`,
                codigo: separarCliente(consulta.cliente).codigo,
                cliente: consulta.cliente,
                fecha: consulta.fecha?.toISOString() ?? null,
                encargado: consulta.encargado || "bot",
                grupo: consulta.grupoWhatsapp,
                consulta: consulta.consulta,
                hito: consulta.hito || ia.hito,
                observaciones: consulta.observaciones,
                tentativo: consulta.tentativoRespuesta,
                relacion: ia.relacion,
                hito_ia: ia.hito,
                resumen: ia.resumen,
                origen: ia.origen,
              };
            }),
          ),
        ],
      );
    }

    // --- 4. Lo tildado en la planilla se finaliza -----------------------------------
    // Las nuevas que ya venian respondidas y las pendientes de la cola que se tildaron.
    const yaRespondidas = nuevas.filter((consulta) => consulta.respondida).map((consulta) => `${PREFIJO}${consulta.id}`);
    const tildadas = consultas
      .map((consulta) => ({ consulta, id: `${PREFIJO}${consulta.id}` }))
      .filter(({ consulta, id }) => consulta.respondida && cola.get(id) === false && !yaCerradas.has(id))
      .map(({ id }) => id);
    const aFinalizar = [...yaRespondidas, ...tildadas];
    if (aFinalizar.length > 0) {
      await db.query(
        `UPDATE consultas_seguimiento
            SET respondida = true, resultado = 'Resuelto', relacion = coalesce(relacion_ia, 'BUENA')
          WHERE id = ANY($1) AND NOT respondida`,
        [aFinalizar],
      );
    }
    if (yaRespondidas.length > 0) {
      // Historico: el cierre queda con la fecha de la consulta y sale de la cola en la proxima purga.
      await db.query(
        `UPDATE chat_interacciones i SET registrado_en = coalesce(i.fecha_consulta, i.registrado_en)
          WHERE i.consulta_id = ANY($1) AND i.tipo = 'finalizada'`,
        [yaRespondidas],
      );
      await db.query(
        `UPDATE consultas_seguimiento SET respondida_en = fecha, archivada_en = fecha WHERE id = ANY($1)`,
        [yaRespondidas],
      );
    }

    const resultado: ResultadoSync = {
      estado: "ok",
      clientes: clientes.length,
      nuevas: nuevas.length,
      nuevasYaRespondidas: yaRespondidas.length,
      finalizadas: tildadas.length,
      clasificadasConIa: clasificadas.filter((item) => item.origen === "ia").length,
      filasLeidas: consultas.length,
      duracionMs: Date.now() - inicio,
      fecha: new Date().toISOString(),
    };
    await db.query(
      `INSERT INTO almacen_registros (coleccion, clave, datos) VALUES ($1, $2, $3)
       ON CONFLICT (coleccion, clave) DO UPDATE SET datos = EXCLUDED.datos, actualizado = now()`,
      [...MARCA, JSON.stringify(resultado)],
    );
    if (nuevas.length > 0 || aFinalizar.length > 0) {
      console.info(`[sync-planilla] ${nuevas.length} nuevas (${yaRespondidas.length} ya respondidas), ${tildadas.length} tildadas en la planilla`);
    }
    return resultado;
  } finally {
    await db.query("SELECT pg_advisory_unlock(hashtext('sync_planilla'))").catch(() => undefined);
    db.release();
  }
}

/** La ultima sincronizacion guardada (o null si nunca corrio). */
export async function ultimaSincronizacion(): Promise<ResultadoSync | null> {
  if (!postgresConfigurado()) return null;
  const { rows } = await (await pool()).query<{ datos: ResultadoSync }>(
    "SELECT datos FROM almacen_registros WHERE coleccion = $1 AND clave = $2",
    [...MARCA],
  );
  return rows[0]?.datos ?? null;
}

/**
 * Sincroniza si la ultima corrida tiene mas de `minutos` (la usa la pantalla
 * de seguimiento al abrirse, para no depender solo del activador).
 */
export async function sincronizarSiHaceFalta(minutos = 2): Promise<void> {
  if (!sincronizacionConfigurada()) return;
  const ultima = await ultimaSincronizacion().catch(() => null);
  if (ultima && Date.now() - new Date(ultima.fecha).getTime() < minutos * 60_000) return;
  await sincronizarPlanilla().catch((error: unknown) =>
    console.error(`[sync-planilla] ${error instanceof Error ? error.message : String(error)}`),
  );
}
