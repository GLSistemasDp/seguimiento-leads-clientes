-- Una fila editada cambia de huella. La version anterior se conserva, pero
-- deja de pertenecer a la cola actual de la planilla; no es una respuesta.
ALTER TABLE consultas_seguimiento
  ADD COLUMN vigente_en_planilla boolean NOT NULL DEFAULT true;

CREATE OR REPLACE VIEW vw_seguimiento_kpis AS
WITH vigentes AS (
  SELECT * FROM consultas_seguimiento
    WHERE origen <> 'planilla' OR vigente_en_planilla
)
SELECT
  (SELECT count(*) FROM vigentes WHERE NOT respondida) AS pendientes,
  (SELECT count(DISTINCT cliente_texto) FROM vigentes WHERE NOT respondida) AS chats_pendientes,
  (SELECT count(*) FROM vigentes WHERE NOT respondida AND fecha < now() - interval '1 day') AS demoradas,
  (SELECT count(*) FROM vigentes WHERE NOT respondida AND hito = 'Reclamo') AS reclamos_pendientes,
  (SELECT count(*) FROM chat_interacciones WHERE tipo = 'finalizada'
    AND (registrado_en AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS finalizadas_hoy,
  (SELECT count(*) FROM vigentes WHERE respondida) AS archivadas_en_cola,
  (SELECT count(DISTINCT cliente_texto) FROM vigentes WHERE NOT respondida AND relacion_ia = 'EN_RIESGO') AS chats_en_riesgo;
