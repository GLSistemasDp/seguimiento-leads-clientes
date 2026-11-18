-- CRM de cuentas clave (clientes USUARIOS): esquema relacional PROPUESTO.
--
-- No se aplica solo: las migraciones automaticas solo corren los archivos
-- listados en src/lib/db/postgres/pg.ts. Hoy el modulo guarda sus datos en el
-- almacen existente (almacen_registros). Para pasar a estas tablas hay que
-- sumar este archivo como migracion y cambiar src/lib/db/usuarios.ts.
--
-- Convenciones: importes en numeric(14,2), una sola moneda por cuenta, fechas
-- comerciales en date y momentos de carga en timestamptz. Los saldos no se
-- guardan: salen de las facturas menos sus imputaciones (vista al final).

CREATE TABLE kam_cuentas (
  id                      serial PRIMARY KEY,
  -- Codigo del ERP; el mismo que usa el resto del CRM (clientes.codigo).
  codigo                  text NOT NULL UNIQUE,
  cliente_id              int REFERENCES clientes (id),
  razon_social            text NOT NULL,
  nombre_fantasia         text NOT NULL DEFAULT '',
  cuit                    text NOT NULL DEFAULT '',
  condicion_iva           text NOT NULL DEFAULT '',
  provincia               text NOT NULL DEFAULT '',
  actividad               text NOT NULL DEFAULT '',
  ejecutivo               text NOT NULL DEFAULT '',
  moneda                  text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'ARS')),
  limite_credito          numeric(14,2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),
  lista_precios           text NOT NULL DEFAULT '',
  -- Plazo de pago pactado y dias sin contacto que disparan "Requiere seguimiento".
  plazo_pago_dias         int NOT NULL DEFAULT 30 CHECK (plazo_pago_dias >= 0),
  umbral_seguimiento_dias int NOT NULL DEFAULT 15 CHECK (umbral_seguimiento_dias > 0),
  estado                  text NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'INACTIVA')),
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kam_direcciones_entrega (
  id         serial PRIMARY KEY,
  cuenta_id  int NOT NULL REFERENCES kam_cuentas (id) ON DELETE CASCADE,
  direccion  text NOT NULL,
  orden      int NOT NULL DEFAULT 0
);

CREATE TABLE kam_contactos (
  id         serial PRIMARY KEY,
  cuenta_id  int NOT NULL REFERENCES kam_cuentas (id) ON DELETE CASCADE,
  nombre     text NOT NULL,
  rol        text NOT NULL CHECK (rol IN ('COMPRAS', 'PAGOS', 'GERENCIA', 'OTRO')),
  email      text NOT NULL DEFAULT '',
  telefono   text NOT NULL DEFAULT '',
  -- El contacto principal es el que usa el modulo de mailing.
  principal  boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX kam_contactos_principal ON kam_contactos (cuenta_id) WHERE principal;

-- Partes de seguimiento: llamadas, reuniones, visitas, correos.
CREATE TABLE kam_partes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        int NOT NULL REFERENCES kam_cuentas (id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('LLAMADA', 'REUNION', 'VISITA', 'CORREO', 'WHATSAPP')),
  resumen          text NOT NULL CHECK (btrim(resumen) <> ''),
  proximo_contacto date,
  autor            text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kam_partes_cuenta ON kam_partes (cuenta_id, creado_en DESC);

CREATE TABLE kam_pedidos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     int NOT NULL REFERENCES kam_cuentas (id) ON DELETE CASCADE,
  numero        text NOT NULL UNIQUE,
  fecha         date NOT NULL,
  orden_compra  text NOT NULL DEFAULT '',
  estado        text NOT NULL DEFAULT 'RECIBIDO'
                CHECK (estado IN ('RECIBIDO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'CANCELADO')),
  autor         text NOT NULL DEFAULT '',
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kam_pedidos_cuenta ON kam_pedidos (cuenta_id, fecha DESC);

CREATE TABLE kam_pedido_items (
  id              serial PRIMARY KEY,
  pedido_id       uuid NOT NULL REFERENCES kam_pedidos (id) ON DELETE CASCADE,
  sku             text NOT NULL,
  descripcion     text NOT NULL,
  linea           text NOT NULL DEFAULT '',
  cantidad        int NOT NULL CHECK (cantidad > 0),
  -- Precio historico: el del momento del pedido.
  precio_unitario numeric(14,2) NOT NULL CHECK (precio_unitario >= 0)
);
-- Para "productos habituales": que SKU pidio cada cuenta y cuando.
CREATE INDEX kam_pedido_items_sku ON kam_pedido_items (sku, pedido_id);

CREATE TABLE kam_facturas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id    int NOT NULL REFERENCES kam_cuentas (id) ON DELETE CASCADE,
  pedido_id    uuid REFERENCES kam_pedidos (id),
  numero       text NOT NULL UNIQUE,
  fecha        date NOT NULL,
  vencimiento  date NOT NULL,
  total        numeric(14,2) NOT NULL CHECK (total > 0),
  CHECK (vencimiento >= fecha)
);
CREATE INDEX kam_facturas_cuenta ON kam_facturas (cuenta_id, vencimiento);

CREATE TABLE kam_notas_credito (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id   int NOT NULL REFERENCES kam_cuentas (id) ON DELETE CASCADE,
  factura_id  uuid NOT NULL REFERENCES kam_facturas (id),
  numero      text NOT NULL UNIQUE,
  fecha       date NOT NULL,
  importe     numeric(14,2) NOT NULL CHECK (importe > 0),
  motivo      text NOT NULL DEFAULT ''
);

CREATE TABLE kam_pagos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id   int NOT NULL REFERENCES kam_cuentas (id) ON DELETE CASCADE,
  numero      text NOT NULL UNIQUE,
  fecha       date NOT NULL,
  importe     numeric(14,2) NOT NULL CHECK (importe > 0),
  medio       text NOT NULL CHECK (medio IN ('TRANSFERENCIA', 'CHEQUE', 'EFECTIVO', 'RETENCIONES')),
  referencia  text NOT NULL DEFAULT '',
  autor       text NOT NULL DEFAULT '',
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kam_pagos_cuenta ON kam_pagos (cuenta_id, fecha DESC);

-- A que facturas se aplico cada pago (un pago puede cubrir varias facturas).
CREATE TABLE kam_pago_imputaciones (
  pago_id     uuid NOT NULL REFERENCES kam_pagos (id) ON DELETE CASCADE,
  factura_id  uuid NOT NULL REFERENCES kam_facturas (id),
  importe     numeric(14,2) NOT NULL CHECK (importe > 0),
  PRIMARY KEY (pago_id, factura_id)
);

CREATE TABLE kam_cotizaciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id           int NOT NULL REFERENCES kam_cuentas (id) ON DELETE CASCADE,
  numero              text NOT NULL UNIQUE,
  fecha               date NOT NULL,
  validez             date NOT NULL,
  estado              text NOT NULL DEFAULT 'BORRADOR'
                      CHECK (estado IN ('BORRADOR', 'ENVIADA', 'EN_NEGOCIACION', 'APROBADA', 'RECHAZADA')),
  motivo_rechazo      text CHECK (motivo_rechazo IN
                      ('PRECIO', 'PLAZO_ENTREGA', 'COMPETENCIA', 'PROYECTO_CANCELADO', 'ESPECIFICACION', 'OTRO')),
  observacion_rechazo text NOT NULL DEFAULT '',
  autor               text NOT NULL DEFAULT '',
  creado_en           timestamptz NOT NULL DEFAULT now(),
  -- Rechazada exige motivo y observacion; los demas estados no los llevan.
  CHECK (
    (estado = 'RECHAZADA' AND motivo_rechazo IS NOT NULL AND btrim(observacion_rechazo) <> '')
    OR (estado <> 'RECHAZADA' AND motivo_rechazo IS NULL)
  )
);
CREATE INDEX kam_cotizaciones_cuenta ON kam_cotizaciones (cuenta_id, fecha DESC);

CREATE TABLE kam_cotizacion_items (
  id              serial PRIMARY KEY,
  cotizacion_id   uuid NOT NULL REFERENCES kam_cotizaciones (id) ON DELETE CASCADE,
  sku             text NOT NULL,
  descripcion     text NOT NULL,
  linea           text NOT NULL DEFAULT '',
  cantidad        int NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric(14,2) NOT NULL CHECK (precio_unitario >= 0)
);

-- Estado de cada factura: lo pagado sale de las imputaciones y notas de credito.
CREATE VIEW kam_facturas_estado AS
SELECT f.*,
       coalesce(p.pagado, 0) + coalesce(n.acreditado, 0) AS pagado,
       f.total - coalesce(p.pagado, 0) - coalesce(n.acreditado, 0) AS saldo,
       CASE
         WHEN f.total - coalesce(p.pagado, 0) - coalesce(n.acreditado, 0) <= 0 THEN 'PAGADA'
         WHEN coalesce(p.pagado, 0) + coalesce(n.acreditado, 0) > 0 THEN 'PARCIAL'
         ELSE 'PENDIENTE'
       END AS estado
FROM kam_facturas f
LEFT JOIN (SELECT factura_id, sum(importe) AS pagado FROM kam_pago_imputaciones GROUP BY 1) p ON p.factura_id = f.id
LEFT JOIN (SELECT factura_id, sum(importe) AS acreditado FROM kam_notas_credito GROUP BY 1) n ON n.factura_id = f.id;
