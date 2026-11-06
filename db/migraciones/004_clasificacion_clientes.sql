-- La clasificación comercial viene de Sheets y también puede ser N u otro valor.
-- No se descartan clasificaciones válidas por limitar el catálogo a A/B/C.
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_clasificacion_check;
