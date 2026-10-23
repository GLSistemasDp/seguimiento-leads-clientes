-- =============================================================================
-- CRM De Pascale · esquema PostgreSQL (prototipo)
--
-- Pipeline de seguimiento en dos etapas:
--   1. consultas_seguimiento: cola operativa. El bot de WhatsApp inserta aca
--      las conversaciones sin resolver; es lo que ve /seguimiento.
--   2. chat_interacciones: historial permanente por cliente. Cuando una
--      consulta pasa a respondida, fn_archivar_consulta_finalizada la copia
--      aca; fn_purgar_cola la borra de la cola despues de N dias.
--
-- Lo aplica la app sola (src/lib/db/postgres/pg.ts) la primera vez que se
-- conecta, dentro de una transaccion y una sola vez (tabla crm_migraciones).
-- Los campos payload_ai y detalle_ia quedan en {} para el enriquecimiento con
-- IA de una iteracion posterior.
-- =============================================================================

-- Registros genericos de la app (adjuntos, mailing, notificaciones...).
CREATE TABLE IF NOT EXISTS almacen_registros (
  coleccion   text        NOT NULL,
  clave       text        NOT NULL,
  datos       jsonb       NOT NULL,
  actualizado timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coleccion, clave)
);

-- --- Enums -------------------------------------------------------------------

CREATE TYPE resultado_consulta AS ENUM (
  'Resuelto', 'Resuelto parcialmente', 'Derivado a otra area', 'Escalado a gerencia', 'Espera respuesta del cliente'
);
CREATE TYPE relacion_cliente AS ENUM ('BUENA', 'REGULAR', 'EN_RIESGO');
CREATE TYPE tipo_interaccion AS ENUM ('finalizada', 'reabierta', 'nota');
CREATE TYPE grupo_reclamo AS ENUM ('CALIDAD', 'LOGISTICA', 'FACTURACION', 'OTROS');
CREATE TYPE accion_reclamo AS ENUM (
  'SUSTITUTO', 'NOTA_CREDITO', 'FALTANTES', 'CAMBIO', 'REPOSICION', 'CONTACTAR', 'NO_PROCEDE', 'OTRA'
);
CREATE TYPE severidad_reclamo AS ENUM ('CRITICA', 'MODERADA', 'LEVE');
CREATE TYPE canal_ingreso AS ENUM ('PORTAL', 'MAIL', 'TELEFONO', 'COMERCIAL');
CREATE TYPE motivo_logistico AS ENUM ('FALTANTE', 'SOBRANTE', 'DANO_TRANSITO', 'DEMORA');
CREATE TYPE origen_reclamo AS ENUM ('cliente', 'intranet');

-- --- Catalogos -------------------------------------------------------------------

CREATE TABLE grupos_vendedor (
  id     serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE hitos (
  id     serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  -- Orden de urgencia (1 = lo mas urgente).
  orden  int  NOT NULL DEFAULT 100
);

CREATE TABLE epp (
  id     serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

-- Clasificaciones del FOR-03 (las que elige el cliente y las del Asegurador de Calidad).
CREATE TABLE tipos_reclamo (
  id     serial PRIMARY KEY,
  nombre text          NOT NULL UNIQUE,
  grupo  grupo_reclamo NOT NULL
);

CREATE TABLE transportistas (
  id     serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE depositos (
  id     serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE empleados (
  id     serial PRIMARY KEY,
  nombre text    NOT NULL UNIQUE,
  area   text    NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT true
);

-- Valores fijos de los catalogos.
INSERT INTO tipos_reclamo (nombre, grupo) VALUES
  ('Falla de Calidad', 'CALIDAD'),
  ('Faltante de Mercadería', 'LOGISTICA'),
  ('Plazo de Entrega', 'LOGISTICA'),
  ('Error de Expedición', 'LOGISTICA'),
  ('Error de Facturación', 'FACTURACION'),
  ('Diferencia de Precio', 'FACTURACION'),
  ('Diferencia contra Factura', 'FACTURACION'),
  ('Error de Cliente', 'OTROS');

INSERT INTO epp (nombre) VALUES
  ('Protección de manos'), ('Protección ocular y facial'), ('Protección auditiva'),
  ('Protección respiratoria'), ('Trabajo en altura (caídas)'), ('Protección de cabeza'),
  ('Calzado de seguridad'), ('Ropa y señalización vial'), ('Otros');

INSERT INTO hitos (nombre, orden) VALUES
  ('Reclamo', 1), ('Pedido nuevo', 2), ('Estado de pedido', 3), ('Pedido refacturar', 4),
  ('Enviar Factura', 5), ('Estado de Cuenta', 6), ('Informa pago', 7), ('Consulta de stock', 8),
  ('Consulta precio', 9), ('Consulta Tecnica', 10), ('Lista de precios', 11), ('Alta Cliente', 12),
  ('Acceso WEB', 13), ('Consulta General', 14);

-- --- Clientes y productos ----------------------------------------------------------

-- Ficha del cliente (hoy: hojas "Desplegable" y "MaestroCliente" de la planilla).
CREATE TABLE clientes (
  id               serial PRIMARY KEY,
  codigo           text UNIQUE,
  nombre           text NOT NULL,
  lista_precio     text NOT NULL DEFAULT '',
  -- A, B, C o vacio.
  clasificacion    text NOT NULL DEFAULT '' CHECK (clasificacion IN ('', 'A', 'B', 'C')),
  grupo_vendedor_id int REFERENCES grupos_vendedor (id),
  grupo_whatsapp   text NOT NULL DEFAULT '',
  grupo_whatsapp2  text NOT NULL DEFAULT '',
  link_whatsapp    text NOT NULL DEFAULT '',
  -- OK, TIENE DEUDA, NO RESPONDER, JUDICIALIZADO.
  situacion        text NOT NULL DEFAULT '',
  observacion      text NOT NULL DEFAULT '',
  actividad        text NOT NULL DEFAULT '',
  categoria        text NOT NULL DEFAULT '',
  condicion_pago   text NOT NULL DEFAULT '',
  limite_credito   text NOT NULL DEFAULT '',
  -- "REVISAR DEUDORA" o vacio.
  deuda            text NOT NULL DEFAULT '',
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE productos (
  id          serial PRIMARY KEY,
  codigo      text NOT NULL UNIQUE,
  descripcion text NOT NULL DEFAULT '',
  epp_id      int REFERENCES epp (id)
);

CREATE TABLE lotes (
  id          serial PRIMARY KEY,
  producto_id int  NOT NULL REFERENCES productos (id),
  codigo      text NOT NULL,
  UNIQUE (producto_id, codigo)
);

-- --- Seguimiento: cola temporal + historial permanente ---------------------------------

CREATE TABLE consultas_seguimiento (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id          int REFERENCES clientes (id),
  -- Como lo escribe el bot: "1877 - BULONERIA BELGRANO".
  cliente_texto       text NOT NULL,
  fecha               timestamptz NOT NULL DEFAULT now(),
  encargado           text NOT NULL DEFAULT 'bot',
  grupo_whatsapp      text NOT NULL DEFAULT '',
  consulta            text NOT NULL,
  hito_id             int REFERENCES hitos (id),
  hito                text NOT NULL DEFAULT 'Consulta General',
  respondida          boolean NOT NULL DEFAULT false,
  dias_demora         int,
  observaciones       text NOT NULL DEFAULT '',
  tentativo_respuesta text NOT NULL DEFAULT '',
  resultado           resultado_consulta,
  relacion            relacion_cliente,
  respondida_en       timestamptz,
  -- Cuando se copio a chat_interacciones; la purga borra lo archivado hace mas de N dias.
  archivada_en        timestamptz,
  origen              text NOT NULL DEFAULT 'bot',
  -- Id del mensaje en WhatsApp: evita cargar dos veces lo mismo si el bot reintenta.
  mensaje_id          text UNIQUE,
  ingresada_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consultas_seguimiento_pendientes ON consultas_seguimiento (respondida, fecha);
CREATE INDEX consultas_seguimiento_cliente ON consultas_seguimiento (cliente_id);

CREATE TABLE chat_interacciones (
  id             bigserial PRIMARY KEY,
  -- Sin FK: la consulta se purga de la cola y la interaccion queda.
  consulta_id    text NOT NULL,
  cliente_id     int REFERENCES clientes (id),
  cliente_texto  text NOT NULL,
  tipo           tipo_interaccion NOT NULL,
  fecha_consulta timestamptz,
  consulta       text NOT NULL DEFAULT '',
  hito           text NOT NULL DEFAULT '',
  encargado      text NOT NULL DEFAULT '',
  grupo_whatsapp text NOT NULL DEFAULT '',
  resultado      resultado_consulta,
  relacion       relacion_cliente,
  observacion    text NOT NULL DEFAULT '',
  registrado_en  timestamptz NOT NULL DEFAULT now(),
  -- Resumen, sentimiento, embeddings... (iteracion con IA).
  payload_ai     jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX chat_interacciones_cliente ON chat_interacciones (cliente_id, registrado_en DESC);
CREATE INDEX chat_interacciones_consulta ON chat_interacciones (consulta_id);
CREATE INDEX chat_interacciones_fecha ON chat_interacciones (registrado_en);

-- Marca cuando se respondio (y lo limpia si se reabre).
CREATE FUNCTION fn_marcar_respondida() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.respondida AND NOT OLD.respondida THEN
    NEW.respondida_en := now();
    NEW.archivada_en := now();
  ELSIF OLD.respondida AND NOT NEW.respondida THEN
    NEW.respondida_en := NULL;
    NEW.archivada_en := NULL;
    NEW.resultado := NULL;
    NEW.relacion := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_marcar_respondida
  BEFORE UPDATE OF respondida ON consultas_seguimiento
  FOR EACH ROW EXECUTE FUNCTION fn_marcar_respondida();

-- Al finalizar, la consulta pasa al historial del cliente. Si se reabre (antes
-- de la purga) queda registrado y vuelve a la cola de pendientes.
CREATE FUNCTION fn_archivar_consulta_finalizada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.respondida IS DISTINCT FROM OLD.respondida THEN
    INSERT INTO chat_interacciones (
      consulta_id, cliente_id, cliente_texto, tipo, fecha_consulta, consulta, hito,
      encargado, grupo_whatsapp, resultado, relacion, observacion
    ) VALUES (
      NEW.id, NEW.cliente_id, NEW.cliente_texto,
      CASE WHEN NEW.respondida THEN 'finalizada'::tipo_interaccion ELSE 'reabierta'::tipo_interaccion END,
      NEW.fecha, NEW.consulta, NEW.hito, NEW.encargado, NEW.grupo_whatsapp,
      CASE WHEN NEW.respondida THEN NEW.resultado END,
      CASE WHEN NEW.respondida THEN NEW.relacion END,
      CASE WHEN NEW.respondida THEN NEW.observaciones ELSE '' END
    );
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER tg_archivar_consulta_finalizada
  AFTER UPDATE OF respondida ON consultas_seguimiento
  FOR EACH ROW EXECUTE FUNCTION fn_archivar_consulta_finalizada();

-- Job de purga: saca de la cola lo archivado hace mas de `dias` dias.
CREATE FUNCTION fn_purgar_cola(dias int) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  borradas int;
BEGIN
  DELETE FROM consultas_seguimiento
   WHERE respondida AND archivada_en < now() - make_interval(days => dias);
  GET DIAGNOSTICS borradas = ROW_COUNT;
  RETURN borradas;
END $$;

-- --- Reclamos (formulario FOR-03) ---------------------------------------------------------

CREATE SEQUENCE reclamos_numero_seq;

CREATE TABLE reclamos (
  id                   bigserial PRIMARY KEY,
  numero               text NOT NULL UNIQUE DEFAULT 'REC-' || lpad(nextval('reclamos_numero_seq')::text, 4, '0'),
  fecha                date NOT NULL,
  cliente_id           int REFERENCES clientes (id),
  razon_social         text NOT NULL,
  numero_cliente       text NOT NULL DEFAULT '',
  sucursal             text NOT NULL DEFAULT '',
  -- Lo que escribio el cliente en "Transporte"; transportista_id es el normalizado.
  transporte_informado text NOT NULL DEFAULT '',
  transportista_id     int REFERENCES transportistas (id),
  contacto             text NOT NULL DEFAULT '',
  cargo                text NOT NULL DEFAULT '',
  telefono             text NOT NULL DEFAULT '',
  email                text NOT NULL DEFAULT '',
  orden_compra         text NOT NULL DEFAULT '',
  pedido               text NOT NULL DEFAULT '',
  factura              text NOT NULL DEFAULT '',
  remito               text NOT NULL DEFAULT '',
  -- Lo que eligio el cliente y la reclasificacion del Asegurador de Calidad.
  tipo_reclamo_id      int NOT NULL REFERENCES tipos_reclamo (id),
  tipo_calidad_id      int REFERENCES tipos_reclamo (id),
  detalle              text NOT NULL DEFAULT '',
  origen               origen_reclamo NOT NULL DEFAULT 'cliente',
  -- Si se cargo a partir de una consulta de WhatsApp.
  consulta_id          text,
  calidad_causa        text,
  procedente           boolean,
  acciones_correctivas jsonb NOT NULL DEFAULT '[]',
  cierre               jsonb NOT NULL DEFAULT '{}',
  -- Gestion (alimenta el informe).
  responsable_id       int REFERENCES empleados (id),
  severidad            severidad_reclamo,
  -- Null = se deduce de los productos.
  epp_id               int REFERENCES epp (id),
  -- Null = PORTAL si lo cargo el cliente, COMERCIAL si lo cargo el equipo.
  canal_ingreso        canal_ingreso,
  deposito_id          int REFERENCES depositos (id),
  motivo_logistico     motivo_logistico,
  dias_demora          numeric(6, 1),
  monto_nc             numeric(14, 2),
  numero_nc            text NOT NULL DEFAULT '',
  costo_adicional      numeric(14, 2),
  cerrado              boolean NOT NULL DEFAULT false,
  resuelto_en          timestamptz,
  cerrado_en           timestamptz,
  adjuntos             jsonb NOT NULL DEFAULT '[]',
  detalle_ia           jsonb NOT NULL DEFAULT '{}',
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reclamos_fecha ON reclamos (fecha);
CREATE INDEX reclamos_cliente ON reclamos (cliente_id);

CREATE TABLE reclamo_productos (
  id                 bigserial PRIMARY KEY,
  reclamo_id         bigint NOT NULL REFERENCES reclamos (id) ON DELETE CASCADE,
  orden              int    NOT NULL DEFAULT 0,
  producto_id        int REFERENCES productos (id),
  codigo             text   NOT NULL DEFAULT '',
  descripcion        text   NOT NULL DEFAULT '',
  lote_id            int REFERENCES lotes (id),
  lote               text   NOT NULL DEFAULT '',
  cantidad_facturada numeric(12, 2) NOT NULL DEFAULT 0,
  cantidad_reclamo   numeric(12, 2) NOT NULL DEFAULT 0
);
CREATE INDEX reclamo_productos_reclamo ON reclamo_productos (reclamo_id);

-- Indicacion de la gerencia al vendedor. `clave` es el numero del reclamo o
-- "wa-<consulta>" para los reclamos de WhatsApp del seguimiento.
CREATE TABLE indicaciones_reclamo (
  id          bigserial PRIMARY KEY,
  clave       text NOT NULL UNIQUE,
  reclamo_id  bigint REFERENCES reclamos (id) ON DELETE CASCADE,
  consulta_id text,
  accion      accion_reclamo NOT NULL,
  comentario  text NOT NULL DEFAULT '',
  fecha       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sustitutos_ofrecidos (
  id            bigserial PRIMARY KEY,
  indicacion_id bigint NOT NULL REFERENCES indicaciones_reclamo (id) ON DELETE CASCADE,
  orden         int  NOT NULL DEFAULT 0,
  producto      text NOT NULL,
  observacion   text NOT NULL DEFAULT ''
);

-- Fechas de resolucion y cierre: la primera vez que se carga la respuesta al
-- cliente y cuando se marca cerrado.
CREATE FUNCTION fn_reclamo_fechas() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(btrim(NEW.cierre ->> 'Respuesta al cliente'), '') <> '' THEN
    NEW.resuelto_en := coalesce(NEW.resuelto_en, now());
  ELSE
    NEW.resuelto_en := NULL;
  END IF;
  IF NEW.cerrado THEN
    NEW.cerrado_en := coalesce(NEW.cerrado_en, now());
  ELSE
    NEW.cerrado_en := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.actualizado_en := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_reclamo_fechas
  BEFORE INSERT OR UPDATE ON reclamos
  FOR EACH ROW EXECUTE FUNCTION fn_reclamo_fechas();

-- Tipo de EPP por la descripcion, para productos que no estan en el catalogo.
CREATE FUNCTION fn_inferir_epp(texto text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN texto ~* 'guante|manga' THEN 'Protección de manos'
    WHEN texto ~* 'anteojo|antiparra|lente|ocular|facial|careta|soldar' THEN 'Protección ocular y facial'
    WHEN texto ~* 'auditiv|tap[oó]n|orejera|copa' THEN 'Protección auditiva'
    WHEN texto ~* 'respira|barbijo|m[aá]scara|filtro|cartucho' THEN 'Protección respiratoria'
    WHEN texto ~* 'arn[eé]s|cabo de vida|antica[ií]da|l[ií]nea de vida|mosquet' THEN 'Trabajo en altura (caídas)'
    WHEN texto ~* 'casco' THEN 'Protección de cabeza'
    WHEN texto ~* 'bot[ií]n|bota|calzado|zapat' THEN 'Calzado de seguridad'
    WHEN texto ~* 'chaleco|cono|cadena|vial|ropa|mameluco|campera|pantal' THEN 'Ropa y señalización vial'
    ELSE 'Otros'
  END
$$;

-- --- Vistas analiticas -------------------------------------------------------------------
-- Las que dependen del periodo traen una fila por periodo (30, 90 y 365 dias):
-- la app filtra por `periodo_dias`.

CREATE VIEW vw_periodos AS
  SELECT dias AS periodo_dias FROM (VALUES (30), (90), (365)) AS p (dias);

-- Un reclamo por fila con todo lo que se deduce (grupo, EPP, motivo, canal...).
CREATE VIEW vw_reclamos_base AS
SELECT
  r.id,
  r.numero,
  r.fecha,
  (r.fecha::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS ingreso,
  r.resuelto_en,
  r.cerrado_en,
  coalesce(r.resuelto_en, r.cerrado_en) AS fin,
  r.razon_social AS cliente,
  r.numero_cliente AS cliente_codigo,
  coalesce(tc.nombre, t.nombre) AS clasificacion,
  coalesce(tc.grupo, t.grupo) AS grupo,
  coalesce(
    eo.nombre,
    (SELECT e.nombre FROM reclamo_productos rp JOIN productos p ON p.id = rp.producto_id JOIN epp e ON e.id = p.epp_id
      WHERE rp.reclamo_id = r.id ORDER BY rp.orden LIMIT 1),
    fn_inferir_epp((SELECT string_agg(rp.descripcion, ' ') FROM reclamo_productos rp WHERE rp.reclamo_id = r.id))
  ) AS tipo_epp,
  r.severidad,
  coalesce(
    r.motivo_logistico,
    CASE coalesce(tc.nombre, t.nombre)
      WHEN 'Faltante de Mercadería' THEN 'FALTANTE'::motivo_logistico
      WHEN 'Plazo de Entrega' THEN 'DEMORA'::motivo_logistico
    END
  ) AS motivo_logistico,
  coalesce(r.canal_ingreso, CASE r.origen WHEN 'cliente' THEN 'PORTAL'::canal_ingreso ELSE 'COMERCIAL'::canal_ingreso END) AS canal_ingreso,
  coalesce(tr.nombre, nullif(btrim(r.transporte_informado), ''), 'Sin informar') AS transportista,
  coalesce(d.nombre, 'Sin informar') AS deposito,
  r.dias_demora,
  r.monto_nc,
  coalesce(r.monto_nc, 0) + coalesce(r.costo_adicional, 0) AS costo_total,
  extract(epoch FROM (r.resuelto_en - (r.fecha::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))) / 86400.0 AS dias_resolucion,
  (EXISTS (SELECT 1 FROM indicaciones_reclamo i WHERE i.reclamo_id = r.id)
    OR r.tipo_calidad_id IS NOT NULL OR r.resuelto_en IS NOT NULL OR r.cerrado_en IS NOT NULL) AS en_analisis,
  coalesce(em.nombre, '') AS responsable,
  EXISTS (SELECT 1 FROM reclamo_productos rp WHERE rp.reclamo_id = r.id AND rp.lote <> '') AS tiene_lote
FROM reclamos r
JOIN tipos_reclamo t ON t.id = r.tipo_reclamo_id
LEFT JOIN tipos_reclamo tc ON tc.id = r.tipo_calidad_id
LEFT JOIN epp eo ON eo.id = r.epp_id
LEFT JOIN transportistas tr ON tr.id = r.transportista_id
LEFT JOIN depositos d ON d.id = r.deposito_id
LEFT JOIN empleados em ON em.id = r.responsable_id;

-- Reclamos ingresados en cada periodo.
CREATE VIEW vw_reclamos_periodo AS
SELECT p.periodo_dias, b.*
FROM vw_periodos p
JOIN vw_reclamos_base b ON b.ingreso > now() - make_interval(days => p.periodo_dias) AND b.ingreso <= now();

-- Cards: activos, resolucion contra la meta, embudo y totales por grupo.
CREATE VIEW vw_reclamos_kpis AS
SELECT
  p.periodo_dias,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias) AS total,
  (SELECT count(*) FROM vw_reclamos_base b WHERE b.ingreso <= now() AND (b.fin IS NULL OR b.fin > now())) AS activos,
  (SELECT count(*) FROM vw_reclamos_base b
    WHERE b.ingreso <= now() - interval '30 days' AND (b.fin IS NULL OR b.fin > now() - interval '30 days')) AS activos_mes_pasado,
  (SELECT count(*) FROM vw_reclamos_base b
    WHERE b.resuelto_en > now() - make_interval(days => p.periodo_dias) AND b.resuelto_en <= now()) AS resueltos,
  (SELECT avg(b.dias_resolucion) FROM vw_reclamos_base b
    WHERE b.resuelto_en > now() - make_interval(days => p.periodo_dias) AND b.resuelto_en <= now()) AS resolucion_promedio,
  (SELECT avg(b.dias_resolucion) FROM vw_reclamos_base b WHERE b.grupo = 'CALIDAD'
    AND b.resuelto_en > now() - make_interval(days => p.periodo_dias) AND b.resuelto_en <= now()) AS resolucion_calidad,
  (SELECT avg(b.dias_resolucion) FROM vw_reclamos_base b WHERE b.grupo = 'LOGISTICA'
    AND b.resuelto_en > now() - make_interval(days => p.periodo_dias) AND b.resuelto_en <= now()) AS resolucion_logistica,
  (SELECT avg(b.dias_resolucion) FROM vw_reclamos_base b WHERE b.grupo = 'FACTURACION'
    AND b.resuelto_en > now() - make_interval(days => p.periodo_dias) AND b.resuelto_en <= now()) AS resolucion_facturacion,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.en_analisis) AS en_analisis,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.resuelto_en IS NOT NULL) AS resueltos_del_periodo,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.cerrado_en IS NOT NULL) AS cerrados_del_periodo,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = 'CALIDAD') AS calidad,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = 'CALIDAD' AND NOT x.tiene_lote) AS calidad_sin_lote,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = 'CALIDAD' AND x.severidad IS NULL) AS calidad_sin_severidad,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = 'LOGISTICA') AS logistica,
  (SELECT avg(x.dias_demora) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = 'LOGISTICA') AS demora_promedio
FROM vw_periodos p;

-- Activos por dia, ultimos 30 dias (la linea de la card).
CREATE VIEW vw_reclamos_activos_diarios AS
SELECT d.momento::date AS dia,
  (SELECT count(*) FROM vw_reclamos_base b WHERE b.ingreso <= d.momento AND (b.fin IS NULL OR b.fin > d.momento)) AS activos
FROM generate_series(now() - interval '29 days', now(), interval '1 day') AS d (momento);

CREATE VIEW vw_reclamos_por_grupo AS
SELECT p.periodo_dias, g.grupo,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = g.grupo) AS cantidad
FROM vw_periodos p
CROSS JOIN unnest(enum_range(NULL::grupo_reclamo)) AS g (grupo);

CREATE VIEW vw_reclamos_por_clasificacion AS
SELECT periodo_dias, clasificacion, grupo, count(*) AS cantidad
FROM vw_reclamos_periodo
GROUP BY periodo_dias, clasificacion, grupo;

CREATE VIEW vw_reclamos_por_epp AS
SELECT periodo_dias, tipo_epp, count(*) AS cantidad
FROM vw_reclamos_periodo WHERE grupo = 'CALIDAD'
GROUP BY periodo_dias, tipo_epp;

CREATE VIEW vw_top_lotes_reclamos AS
SELECT x.periodo_dias, rp.lote, rp.codigo || ' · ' || rp.descripcion AS producto, count(*) AS cantidad
FROM vw_reclamos_periodo x
JOIN reclamo_productos rp ON rp.reclamo_id = x.id AND rp.lote <> ''
WHERE x.grupo = 'CALIDAD'
GROUP BY x.periodo_dias, rp.lote, rp.codigo, rp.descripcion;

CREATE VIEW vw_reclamos_severidad AS
SELECT p.periodo_dias, s.severidad,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = 'CALIDAD' AND x.severidad = s.severidad) AS cantidad
FROM vw_periodos p
CROSS JOIN unnest(enum_range(NULL::severidad_reclamo)) AS s (severidad);

-- Clientes y productos con mas de un reclamo de calidad en el periodo.
CREATE VIEW vw_reincidencia_producto AS
SELECT periodo_dias, 'Cliente' AS tipo, cliente AS etiqueta, count(*) AS cantidad
FROM vw_reclamos_periodo WHERE grupo = 'CALIDAD'
GROUP BY periodo_dias, cliente HAVING count(*) > 1
UNION ALL
SELECT x.periodo_dias, 'Producto', rp.codigo || ' · ' || rp.descripcion, count(DISTINCT x.id)
FROM vw_reclamos_periodo x JOIN reclamo_productos rp ON rp.reclamo_id = x.id
WHERE x.grupo = 'CALIDAD'
GROUP BY x.periodo_dias, rp.codigo, rp.descripcion HAVING count(DISTINCT x.id) > 1;

CREATE VIEW vw_logistica_por_transportista AS
SELECT periodo_dias, transportista, count(*) AS cantidad, avg(dias_demora) AS demora_promedio,
  count(*) FILTER (WHERE motivo_logistico = 'FALTANTE') AS faltante,
  count(*) FILTER (WHERE motivo_logistico = 'SOBRANTE') AS sobrante,
  count(*) FILTER (WHERE motivo_logistico = 'DANO_TRANSITO') AS dano_transito,
  count(*) FILTER (WHERE motivo_logistico = 'DEMORA') AS demora
FROM vw_reclamos_periodo WHERE grupo = 'LOGISTICA'
GROUP BY periodo_dias, transportista;

CREATE VIEW vw_logistica_por_deposito AS
SELECT periodo_dias, deposito, count(*) AS cantidad
FROM vw_reclamos_periodo WHERE grupo = 'LOGISTICA'
GROUP BY periodo_dias, deposito;

-- Notas de credito (por fecha de resolucion) y disputas de facturacion.
CREATE VIEW vw_facturacion_resumen AS
SELECT
  p.periodo_dias,
  (SELECT coalesce(sum(b.monto_nc), 0) FROM vw_reclamos_base b WHERE b.monto_nc > 0
    AND coalesce(b.resuelto_en, b.ingreso) > now() - make_interval(days => p.periodo_dias)
    AND coalesce(b.resuelto_en, b.ingreso) <= now()) AS monto_nc,
  (SELECT count(*) FROM vw_reclamos_base b WHERE b.monto_nc > 0
    AND coalesce(b.resuelto_en, b.ingreso) > now() - make_interval(days => p.periodo_dias)
    AND coalesce(b.resuelto_en, b.ingreso) <= now()) AS cantidad_nc,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = 'FACTURACION') AS total,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = 'FACTURACION'
    AND x.clasificacion IN ('Diferencia de Precio', 'Diferencia contra Factura')) AS error_monto,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.grupo = 'FACTURACION'
    AND x.clasificacion NOT IN ('Diferencia de Precio', 'Diferencia contra Factura')) AS otros_motivos
FROM vw_periodos p;

CREATE VIEW vw_ranking_clientes_reclamos AS
SELECT periodo_dias, cliente, cliente_codigo, count(*) AS cantidad, sum(costo_total) AS costo
FROM vw_reclamos_periodo
GROUP BY periodo_dias, cliente, cliente_codigo;

-- Carga de trabajo: reclamos activos hoy por responsable.
CREATE VIEW vw_reclamos_por_responsable AS
SELECT coalesce(nullif(responsable, ''), 'Sin asignar') AS responsable, count(*) AS cantidad
FROM vw_reclamos_base
WHERE ingreso <= now() AND (fin IS NULL OR fin > now())
GROUP BY 1;

CREATE VIEW vw_reclamos_por_canal AS
SELECT p.periodo_dias, c.canal,
  (SELECT count(*) FROM vw_reclamos_periodo x WHERE x.periodo_dias = p.periodo_dias AND x.canal_ingreso = c.canal) AS cantidad
FROM vw_periodos p
CROSS JOIN unnest(enum_range(NULL::canal_ingreso)) AS c (canal);

-- Evolucion mensual (ultimos 36 meses): reclamos ingresados por grupo y monto
-- de notas de credito por mes de resolucion. Se refresca con el cron diario y
-- despues de cada reclamo nuevo.
CREATE MATERIALIZED VIEW mv_reclamos_evolucion_mensual AS
WITH meses AS (
  SELECT generate_series(
    date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')) - interval '35 months',
    date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')),
    interval '1 month'
  )::date AS mes
)
SELECT m.mes, g.grupo,
  (SELECT count(*) FROM vw_reclamos_base b
    WHERE b.grupo = g.grupo AND date_trunc('month', b.fecha)::date = m.mes) AS cantidad,
  (SELECT coalesce(sum(b.monto_nc), 0) FROM vw_reclamos_base b
    WHERE b.grupo = g.grupo AND b.monto_nc > 0
      AND date_trunc('month', (coalesce(b.resuelto_en, b.ingreso) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date = m.mes) AS monto_nc
FROM meses m
CROSS JOIN unnest(enum_range(NULL::grupo_reclamo)) AS g (grupo);

CREATE UNIQUE INDEX mv_reclamos_evolucion_mensual_pk ON mv_reclamos_evolucion_mensual (mes, grupo);

CREATE VIEW vw_historico_trimestral AS
SELECT date_trunc('quarter', mes)::date AS trimestre, sum(cantidad) AS cantidad
FROM mv_reclamos_evolucion_mensual
GROUP BY 1;

-- Bandeja de seguimiento: lo pendiente y lo que se resolvio hoy.
CREATE VIEW vw_seguimiento_kpis AS
SELECT
  (SELECT count(*) FROM consultas_seguimiento WHERE NOT respondida) AS pendientes,
  (SELECT count(DISTINCT cliente_texto) FROM consultas_seguimiento WHERE NOT respondida) AS chats_pendientes,
  (SELECT count(*) FROM consultas_seguimiento WHERE NOT respondida AND fecha < now() - interval '1 day') AS demoradas,
  (SELECT count(*) FROM consultas_seguimiento WHERE NOT respondida AND hito = 'Reclamo') AS reclamos_pendientes,
  (SELECT count(*) FROM chat_interacciones WHERE tipo = 'finalizada'
    AND (registrado_en AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS finalizadas_hoy,
  (SELECT count(*) FROM consultas_seguimiento WHERE respondida) AS archivadas_en_cola;
