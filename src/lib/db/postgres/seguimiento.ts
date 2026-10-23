import "server-only";
import type { RepositorioSeguimiento } from "@/lib/db/repositorio";
import { consultar, transaccion } from "@/lib/db/postgres/pg";
import { separarCliente } from "@/lib/seguimiento/presentacion";
import type { ChatInteraccionRow, ClienteRow, ConsultaSeguimientoRow, VwSeguimientoKpisRow } from "@/types/db";
import type { CambiosConsulta, Consulta, EventoHistorial, FichaCliente, Relacion, Resultado } from "@/types/seguimiento";

/**
 * Seguimiento sobre Postgres (SEGUIMIENTO_BACKEND="postgres"):
 * - `consultas_seguimiento` es la cola que carga el bot y ve /seguimiento.
 * - Al finalizar, el trigger fn_archivar_consulta_finalizada copia la consulta
 *   a `chat_interacciones` (historial del cliente) y la purga diaria la saca
 *   de la cola pasados SEGUIMIENTO_DIAS_RETENCION dias.
 */

type FilaConsulta = ConsultaSeguimientoRow & {
  cl_codigo: ClienteRow["codigo"];
  cl_nombre: ClienteRow["nombre"] | null;
  cl_lista_precio: string | null;
  cl_clasificacion: string | null;
  cl_grupo_whatsapp: string | null;
  cl_grupo_whatsapp2: string | null;
  cl_link_whatsapp: string | null;
  cl_situacion: string | null;
  cl_observacion: string | null;
  cl_actividad: string | null;
  cl_categoria: string | null;
  cl_condicion_pago: string | null;
  cl_limite_credito: string | null;
  cl_deuda: string | null;
  grupo_vendedor: string | null;
};

const SELECT_CONSULTA = `
  SELECT c.*,
    cl.codigo AS cl_codigo, cl.nombre AS cl_nombre, cl.lista_precio AS cl_lista_precio,
    cl.clasificacion AS cl_clasificacion, cl.grupo_whatsapp AS cl_grupo_whatsapp,
    cl.grupo_whatsapp2 AS cl_grupo_whatsapp2, cl.link_whatsapp AS cl_link_whatsapp,
    cl.situacion AS cl_situacion, cl.observacion AS cl_observacion, cl.actividad AS cl_actividad,
    cl.categoria AS cl_categoria, cl.condicion_pago AS cl_condicion_pago,
    cl.limite_credito AS cl_limite_credito, cl.deuda AS cl_deuda,
    gv.nombre AS grupo_vendedor
  FROM consultas_seguimiento c
  LEFT JOIN clientes cl ON cl.id = c.cliente_id
  LEFT JOIN grupos_vendedor gv ON gv.id = cl.grupo_vendedor_id`;

function ficha(fila: FilaConsulta): FichaCliente | null {
  if (fila.cliente_id === null || fila.cl_nombre === null) return null;
  return {
    codigo: fila.cl_codigo ?? "",
    nombre: fila.cl_nombre,
    listaPrecio: fila.cl_lista_precio ?? "",
    clasificacion: fila.cl_clasificacion ?? "",
    grupoVendedor: fila.grupo_vendedor ?? "",
    grupoWhatsapp: fila.cl_grupo_whatsapp ?? "",
    grupoWhatsapp2: fila.cl_grupo_whatsapp2 ?? "",
    linkWhatsapp: fila.cl_link_whatsapp ?? "",
    situacion: fila.cl_situacion ?? "",
    observacion: fila.cl_observacion ?? "",
    actividad: fila.cl_actividad ?? "",
    categoria: fila.cl_categoria ?? "",
    condicionPago: fila.cl_condicion_pago ?? "",
    limiteCredito: fila.cl_limite_credito ?? "",
    deuda: fila.cl_deuda ?? "",
  };
}

function aConsulta(fila: FilaConsulta): Consulta {
  return {
    id: fila.id,
    fecha: fila.fecha,
    encargado: fila.encargado,
    cliente: fila.cliente_texto,
    listaPrecio: fila.cl_lista_precio ?? "",
    clasificacion: fila.cl_clasificacion ?? "",
    grupoVendedor: fila.grupo_vendedor ?? "",
    estadoCuenta: fila.cl_situacion ?? "",
    grupoWhatsapp: fila.grupo_whatsapp || fila.cl_grupo_whatsapp || "",
    linkWhatsapp: fila.cl_link_whatsapp ?? "",
    consulta: fila.consulta,
    hito: fila.hito,
    respondida: fila.respondida,
    dias: fila.dias_demora,
    observaciones: fila.observaciones,
    tentativoRespuesta: fila.tentativo_respuesta,
    ficha: ficha(fila),
  };
}

// --- Cola -----------------------------------------------------------------------------

export async function getAll(): Promise<Consulta[]> {
  return (await consultar<FilaConsulta>(`${SELECT_CONSULTA} ORDER BY c.fecha`)).map(aConsulta);
}

export async function getById(id: string): Promise<Consulta | null> {
  const [fila] = await consultar<FilaConsulta>(`${SELECT_CONSULTA} WHERE c.id = $1`, [id]);
  return fila ? aConsulta(fila) : null;
}

/** Como quedo la conversacion: lo copia el trigger al historial al finalizar. */
export type CierreConsulta = { resultado: Resultado | null; relacion: Relacion | null };

export async function update(id: string, cambios: CambiosConsulta, cierre?: CierreConsulta): Promise<Consulta> {
  const filas = await consultar<{ id: string }>(
    `UPDATE consultas_seguimiento
        SET respondida = coalesce($2, respondida),
            observaciones = coalesce($3, observaciones),
            resultado = CASE WHEN $2 IS TRUE THEN $4::resultado_consulta ELSE resultado END,
            relacion = CASE WHEN $2 IS TRUE THEN $5::relacion_cliente ELSE relacion END
      WHERE id = $1
      RETURNING id`,
    [id, cambios.respondida ?? null, cambios.observaciones ?? null, cierre?.resultado ?? null, cierre?.relacion ?? null],
  );
  if (filas.length === 0) throw new Error(`No existe la consulta ${id}`);
  const consulta = await getById(id);
  if (!consulta) throw new Error(`No existe la consulta ${id}`);
  return consulta;
}

/**
 * Para el tablero del Resumen: la cola mas lo ya archivado (finalizadas que
 * la purga saco de la cola), asi las barras de respondidas no se pierden.
 */
export async function getParaTablero(): Promise<Consulta[]> {
  const [cola, archivadas] = await Promise.all([
    getAll(),
    consultar<ChatInteraccionRow & { cl_clasificacion: string | null; cl_situacion: string | null; grupo_vendedor: string | null }>(
      `SELECT DISTINCT ON (i.consulta_id) i.*, cl.clasificacion AS cl_clasificacion, cl.situacion AS cl_situacion, gv.nombre AS grupo_vendedor
         FROM chat_interacciones i
         LEFT JOIN clientes cl ON cl.id = i.cliente_id
         LEFT JOIN grupos_vendedor gv ON gv.id = cl.grupo_vendedor_id
        WHERE i.tipo = 'finalizada'
          AND NOT EXISTS (SELECT 1 FROM consultas_seguimiento c WHERE c.id = i.consulta_id)
        ORDER BY i.consulta_id, i.registrado_en DESC`,
    ),
  ]);
  return [
    ...cola,
    ...archivadas.map(
      (fila): Consulta => ({
        id: fila.consulta_id,
        fecha: fila.fecha_consulta,
        encargado: fila.encargado,
        cliente: fila.cliente_texto,
        listaPrecio: "",
        clasificacion: fila.cl_clasificacion ?? "",
        grupoVendedor: fila.grupo_vendedor ?? "",
        estadoCuenta: fila.cl_situacion ?? "",
        grupoWhatsapp: fila.grupo_whatsapp,
        linkWhatsapp: "",
        consulta: fila.consulta,
        hito: fila.hito,
        respondida: true,
        dias: null,
        observaciones: fila.observacion,
        tentativoRespuesta: "",
        ficha: null,
      }),
    ),
  ];
}

/** Job de purga: saca de la cola lo archivado hace mas de `dias` dias. */
export async function purgarCola(dias: number): Promise<number> {
  const [fila] = await consultar<{ borradas: number }>("SELECT fn_purgar_cola($1) AS borradas", [dias]);
  return fila?.borradas ?? 0;
}

export async function kpis(): Promise<VwSeguimientoKpisRow> {
  const [fila] = await consultar<VwSeguimientoKpisRow>("SELECT * FROM vw_seguimiento_kpis");
  return fila;
}

// --- Historial (chat_interacciones) ----------------------------------------------------

function aEvento(fila: ChatInteraccionRow): EventoHistorial {
  // La observacion de la cola trae el resultado adelante ("Resuelto · ..."): aca va aparte.
  const prefijo = fila.resultado ? `${fila.resultado} · ` : "";
  const observacion =
    fila.resultado && fila.observacion === fila.resultado
      ? ""
      : prefijo && fila.observacion.startsWith(prefijo)
        ? fila.observacion.slice(prefijo.length)
        : fila.observacion;
  return {
    id: fila.id,
    consultaId: fila.consulta_id,
    cliente: fila.cliente_texto,
    hito: fila.hito,
    fecha: fila.registrado_en.toISOString(),
    tipo: fila.tipo,
    resultado: fila.resultado,
    relacion: fila.relacion,
    observacion,
  };
}

/** Las notas se insertan aca; finalizar y reabrir los registra el trigger. */
export async function registrarNota(evento: Omit<EventoHistorial, "id" | "fecha">): Promise<EventoHistorial> {
  const [fila] = await consultar<ChatInteraccionRow>(
    `INSERT INTO chat_interacciones (consulta_id, cliente_id, cliente_texto, tipo, fecha_consulta, consulta, hito, encargado, grupo_whatsapp, observacion)
     SELECT c.id, c.cliente_id, c.cliente_texto, 'nota', c.fecha, c.consulta, c.hito, c.encargado, c.grupo_whatsapp, $2
       FROM consultas_seguimiento c WHERE c.id = $1
     RETURNING *`,
    [evento.consultaId, evento.observacion],
  );
  if (!fila) throw new Error(`No existe la consulta ${evento.consultaId}`);
  return aEvento(fila);
}

/** El ultimo evento de cada tipo de una consulta recien actualizada (lo que inserto el trigger). */
export async function ultimoEvento(consultaId: string, tipo: EventoHistorial["tipo"]): Promise<EventoHistorial | null> {
  const [fila] = await consultar<ChatInteraccionRow>(
    "SELECT * FROM chat_interacciones WHERE consulta_id = $1 AND tipo = $2 ORDER BY registrado_en DESC, id DESC LIMIT 1",
    [consultaId, tipo],
  );
  return fila ? aEvento(fila) : null;
}

/** Eventos de las consultas que estan en la cola, del mas viejo al mas nuevo. */
export async function porConsulta(): Promise<Record<string, EventoHistorial[]>> {
  const filas = await consultar<ChatInteraccionRow>(
    `SELECT i.* FROM chat_interacciones i
      WHERE EXISTS (SELECT 1 FROM consultas_seguimiento c WHERE c.id = i.consulta_id)
      ORDER BY i.registrado_en, i.id`,
  );
  const eventos: Record<string, EventoHistorial[]> = {};
  for (const fila of filas) (eventos[fila.consulta_id] ??= []).push(aEvento(fila));
  return eventos;
}

/** Toda la historia de un cliente (por su codigo si lo tiene), lo mas nuevo primero. */
export async function porCliente(cliente: string): Promise<EventoHistorial[]> {
  const { codigo } = separarCliente(cliente);
  const filas = await consultar<ChatInteraccionRow>(
    `SELECT i.* FROM chat_interacciones i
       LEFT JOIN clientes cl ON cl.id = i.cliente_id
      WHERE ($1 <> '' AND cl.codigo = $1) OR upper(btrim(i.cliente_texto)) = upper(btrim($2))
      ORDER BY i.registrado_en DESC, i.id DESC`,
    [codigo, cliente],
  );
  return filas.map(aEvento);
}

/** Lo registrado en un dia (AAAA-MM-DD, hora de Argentina). */
export async function delDia(dia: string): Promise<EventoHistorial[]> {
  const filas = await consultar<ChatInteraccionRow>(
    `SELECT * FROM chat_interacciones
      WHERE (registrado_en AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = $1::date
      ORDER BY registrado_en`,
    [dia],
  );
  return filas.map(aEvento);
}

// --- Entrada del bot de WhatsApp ----------------------------------------------------------

/** Lo que manda el bot por cada mensaje que detecta en un grupo. */
export type EntradaBot = {
  /** "1877 - BULONERIA BELGRANO" o solo el nombre. */
  cliente: string;
  consulta: string;
  hito?: string;
  /** ISO; por defecto, ahora. */
  fecha?: string;
  encargado?: string;
  grupoWhatsapp?: string;
  /** Id del mensaje en WhatsApp, para no cargarlo dos veces. */
  mensajeId?: string;
};

/**
 * INSERT en la cola. Si el cliente no existe por su codigo se crea con lo
 * minimo (la ficha se completa despues). Devuelve null si el mensaje ya estaba.
 */
export async function ingresarConsulta(entrada: EntradaBot): Promise<string | null> {
  const { codigo, nombre } = separarCliente(entrada.cliente);
  return transaccion(async (cliente) => {
    let clienteId: number | null = null;
    if (codigo) {
      const { rows } = await cliente.query<{ id: number }>(
        `INSERT INTO clientes (codigo, nombre) VALUES ($1, $2)
         ON CONFLICT (codigo) DO UPDATE SET codigo = EXCLUDED.codigo
         RETURNING id`,
        [codigo, nombre || entrada.cliente],
      );
      clienteId = rows[0].id;
    }
    const hito = entrada.hito?.trim() || "Consulta General";
    const { rows: hitos } = await cliente.query<{ id: number }>(
      `INSERT INTO hitos (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
      [hito],
    );
    const { rows } = await cliente.query<{ id: string }>(
      `INSERT INTO consultas_seguimiento (cliente_id, cliente_texto, fecha, encargado, grupo_whatsapp, consulta, hito_id, hito, mensaje_id)
       VALUES ($1, $2, coalesce($3::timestamptz, now()), $4, $5, $6, $7, $8, $9)
       ON CONFLICT (mensaje_id) DO NOTHING
       RETURNING id`,
      [
        clienteId,
        entrada.cliente.trim(),
        entrada.fecha ?? null,
        entrada.encargado?.trim() || "bot",
        entrada.grupoWhatsapp?.trim() ?? "",
        entrada.consulta.trim(),
        hitos[0].id,
        hito,
        entrada.mensajeId ?? null,
      ],
    );
    return rows[0]?.id ?? null;
  });
}

const repositorio: RepositorioSeguimiento = { getAll, getById, update };

export default repositorio;
