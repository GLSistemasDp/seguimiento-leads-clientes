-- =============================================================================
-- Migracion 2: clasificacion de los mensajes (IA) y relacion obligatoria al cerrar
--
-- - consultas_seguimiento guarda lo que devolvio el clasificador al entrar el
--   mensaje: estado de la relacion, hito y resumen (y si vino de la IA o de
--   las reglas).
-- - Al finalizar, fn_archivar_consulta_finalizada copia esa clasificacion a
--   chat_interacciones.payload_ai junto con la relacion que eligio el agente.
-- - clientes suma el CUIT para el perfil.
-- =============================================================================

ALTER TABLE consultas_seguimiento
  ADD COLUMN relacion_ia relacion_cliente,
  ADD COLUMN hito_ia text NOT NULL DEFAULT '',
  ADD COLUMN resumen_ia text NOT NULL DEFAULT '',
  ADD COLUMN clasificado_por text;

ALTER TABLE clientes ADD COLUMN cuit text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION fn_archivar_consulta_finalizada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.respondida IS DISTINCT FROM OLD.respondida THEN
    INSERT INTO chat_interacciones (
      consulta_id, cliente_id, cliente_texto, tipo, fecha_consulta, consulta, hito,
      encargado, grupo_whatsapp, resultado, relacion, observacion, payload_ai
    ) VALUES (
      NEW.id, NEW.cliente_id, NEW.cliente_texto,
      CASE WHEN NEW.respondida THEN 'finalizada'::tipo_interaccion ELSE 'reabierta'::tipo_interaccion END,
      NEW.fecha, NEW.consulta, NEW.hito, NEW.encargado, NEW.grupo_whatsapp,
      CASE WHEN NEW.respondida THEN NEW.resultado END,
      CASE WHEN NEW.respondida THEN NEW.relacion END,
      CASE WHEN NEW.respondida THEN NEW.observaciones ELSE '' END,
      CASE WHEN NEW.clasificado_por IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
        'estado_relacion', NEW.relacion_ia,
        'hito_detectado', NEW.hito_ia,
        'resumen', NEW.resumen_ia,
        'origen', NEW.clasificado_por
      ) END
    );
  END IF;
  RETURN NULL;
END $$;

-- La bandeja suma las relaciones en riesgo (segun la clasificacion del mensaje).
CREATE OR REPLACE VIEW vw_seguimiento_kpis AS
SELECT
  (SELECT count(*) FROM consultas_seguimiento WHERE NOT respondida) AS pendientes,
  (SELECT count(DISTINCT cliente_texto) FROM consultas_seguimiento WHERE NOT respondida) AS chats_pendientes,
  (SELECT count(*) FROM consultas_seguimiento WHERE NOT respondida AND fecha < now() - interval '1 day') AS demoradas,
  (SELECT count(*) FROM consultas_seguimiento WHERE NOT respondida AND hito = 'Reclamo') AS reclamos_pendientes,
  (SELECT count(*) FROM chat_interacciones WHERE tipo = 'finalizada'
    AND (registrado_en AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS finalizadas_hoy,
  (SELECT count(*) FROM consultas_seguimiento WHERE respondida) AS archivadas_en_cola,
  (SELECT count(DISTINCT cliente_texto) FROM consultas_seguimiento WHERE NOT respondida AND relacion_ia = 'EN_RIESGO') AS chats_en_riesgo;
