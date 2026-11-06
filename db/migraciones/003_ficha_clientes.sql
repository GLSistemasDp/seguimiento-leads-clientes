-- La observación del cliente pertenece a la última conversación finalizada.
-- La fecha permite distinguirla de la observación inicial importada de Sheets.
ALTER TABLE clientes ADD COLUMN observacion_cierre_en timestamptz;

CREATE FUNCTION fn_actualizar_observacion_cliente() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ultimo chat_interacciones%ROWTYPE;
  nota text;
BEGIN
  IF NEW.tipo <> 'finalizada' OR NEW.cliente_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Serializa cierres simultáneos del mismo cliente antes de buscar el último.
  PERFORM id FROM clientes WHERE id = NEW.cliente_id FOR UPDATE;
  SELECT * INTO ultimo FROM chat_interacciones
    WHERE cliente_id = NEW.cliente_id AND tipo = 'finalizada'
    ORDER BY registrado_en DESC, id DESC LIMIT 1;
  nota := btrim(ultimo.observacion);
  IF ultimo.resultado IS NOT NULL AND nota <> ultimo.resultado::text
     AND left(nota, length(ultimo.resultado::text) + 3) <> ultimo.resultado::text || ' · ' THEN
    nota := concat_ws(' · ', ultimo.resultado::text, nullif(nota, ''));
  END IF;
  UPDATE clientes SET observacion = nota, observacion_cierre_en = ultimo.registrado_en,
    actualizado_en = now() WHERE id = NEW.cliente_id;
  RETURN NULL;
END $$;

CREATE TRIGGER tg_actualizar_observacion_cliente
  AFTER INSERT OR UPDATE OF registrado_en, observacion, resultado ON chat_interacciones
  FOR EACH ROW EXECUTE FUNCTION fn_actualizar_observacion_cliente();

-- Recupera los cierres anteriores, incluso si la consulta ya se purgó de la cola.
WITH ultimos AS (
  SELECT DISTINCT ON (cliente_id) cliente_id, registrado_en, resultado, btrim(observacion) AS nota
    FROM chat_interacciones WHERE tipo = 'finalizada' AND cliente_id IS NOT NULL
    ORDER BY cliente_id, registrado_en DESC, id DESC
)
UPDATE clientes c SET
  observacion = CASE
    WHEN u.resultado IS NULL OR u.nota = u.resultado::text
      OR left(u.nota, length(u.resultado::text) + 3) = u.resultado::text || ' · ' THEN u.nota
    ELSE concat_ws(' · ', u.resultado::text, nullif(u.nota, '')) END,
  observacion_cierre_en = u.registrado_en
FROM ultimos u WHERE c.id = u.cliente_id;

-- Compatibilidad con las dos columnas existentes: ambas reflejan el mismo estado.
WITH estados AS (
  SELECT c.id, coalesce((
    SELECT string_agg(e.valor, ' · ' ORDER BY e.orden) FROM (
      SELECT DISTINCT ON (lower(btrim(valor))) btrim(valor) AS valor, orden
        FROM unnest(string_to_array(c.situacion || ' · ' || c.deuda, ' · ')) WITH ORDINALITY AS t(valor, orden)
        WHERE btrim(valor) <> '' ORDER BY lower(btrim(valor)), orden
    ) e WHERE lower(e.valor) NOT IN ('ok', 'sin deuda', 'sin marca', 'al día')
      OR NOT EXISTS (
        SELECT 1 FROM unnest(string_to_array(c.situacion || ' · ' || c.deuda, ' · ')) AS t(valor)
          WHERE lower(btrim(valor)) NOT IN ('', 'ok', 'sin deuda', 'sin marca', 'al día')
      )
  ), '') AS estado FROM clientes c
)
UPDATE clientes c SET situacion = e.estado, deuda = e.estado FROM estados e WHERE c.id = e.id;
