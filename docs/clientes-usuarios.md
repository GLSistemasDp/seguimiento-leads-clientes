# CRM de cuentas clave (clientes USUARIOS)

La sección `/usuarios` es el CRM de las grandes cuentas. Arriba hay un menú desplegable con buscador para elegir el cliente (pensado para listas largas: se filtra por nombre, código, CUIT o contacto, y se elige con el mouse o con las flechas y Enter). `/usuarios?cliente=<código>` abre un cliente directamente; `/usuarios/<código>` redirige ahí, o al resumen si el código no existe.

## Qué muestra

**Resumen de la cartera** (antes de elegir un cliente). Totales: saldo, deuda vencida, crédito disponible, pedidos pendientes y cuentas que requieren seguimiento. Debajo, una tabla con cada cliente: estado de cuenta (deuda vencida, crédito excedido, con saldo en plazo o al día), saldo, deuda vencida, crédito disponible, pedidos pendientes, cotizaciones abiertas y último contacto. Primero aparecen los que hay que atender; tiene filtros por alerta y un buscador. Tocar una fila abre el cliente.

**Ficha del cliente.** Encabezado fijo con nombre, actividad, CUIT, ejecutivo y las acciones rápidas: nuevo parte, cargar pedido, registrar pago y nueva cotización. Seis indicadores: estado de cuenta, crédito disponible, pedidos pendientes, facturación acumulada del año, cotizaciones pendientes y días desde el último contacto. Cuatro pestañas:

1. **Resumen & Seguimiento.** Alerta de inactividad, bitácora de partes (llamadas, reuniones, visitas, correos, WhatsApp), pedidos pendientes, contactos por área con copia rápida de teléfono y email, y ficha técnica (datos fiscales, condiciones comerciales y direcciones de entrega).
2. **Estado de cuenta & Facturación.** Facturas con saldo (emisión, vencimiento, días de mora y pendiente), facturación de los últimos 12 meses y cuenta corriente con saldo acumulado.
3. **Cotizaciones.** Número, fechas, ítems, total y estado. El estado se cambia desde la tabla.
4. **Historial de productos & Brechas.** Productos habituales ausentes en el último pedido, comparación completa e historial de pedidos con sus artículos y precios.

## Reglas

- **Inactividad.** Se cuentan los días corridos desde el último parte o pedido (los pedidos cancelados no cuentan). Si superan el umbral de la cuenta (15 días por defecto, editable desde la ficha), la cuenta queda marcada "Requiere seguimiento" en la lista, en su encabezado y en un aviso de la página Resumen.
- **Facturas.** Lo pagado no se guarda: sale de los pagos imputados y las notas de crédito. Estados: Pendiente, Parcial y Pagada. Una factura está vencida cuando tiene saldo y ya pasó su vencimiento (el día del vencimiento todavía no).
- **Pagos.** Un pago se puede aplicar a una o varias facturas, sin superar el saldo de cada una ni el importe del pago. Lo que sobra queda a cuenta y baja el saldo de la cuenta corriente.
- **Cotizaciones.** Estados: Borrador, Enviada, En negociación, Aprobada y Rechazada. Enviada y En negociación cuentan como abiertas. Para pasar a Rechazada son obligatorios el motivo (catálogo `MOTIVOS_RECHAZO`) y las observaciones; al volver a otro estado se borran.
- **Productos habituales.** Se miran los pedidos de los últimos 6 meses. Es habitual lo que aparece en 3 o más. "Ausente" es lo habitual que no vino en la última compra: el último pedido más los de los 10 días anteriores, para que un pedido complementario no deje ausente lo que vino en el anterior. Los valores están en `src/lib/usuarios/analisis.ts` (`MESES_HABITUALES`, `MIN_PEDIDOS_HABITUAL`, `DIAS_MISMA_COMPRA`).
- **Pedidos.** Un pedido cargado desde el CRM queda como Recibido. No genera factura: la facturación viene del sistema de gestión. Son pedidos pendientes los Recibidos, En preparación y Despachados.
- **Estado de cuenta.** Deuda vencida si hay alguna factura vencida con saldo; si no, crédito excedido si el saldo supera el límite; si no, con saldo en plazo o al día.

## Datos y conexión a la base

Los clientes son los reales (Toyota, Honda, Arcor, Rowing, Ternium, Techint y Emova), pero los datos comerciales son de ejemplo (`src/lib/usuarios/demo.ts`) hasta conectar el sistema de gestión: saldos, pedidos, facturas, pagos, cotizaciones y partes son inventados, con un escenario distinto en cada cliente. Las fechas se calculan desde hoy, así el escenario se ve igual cualquier día. CUIT, contactos, direcciones y ejecutivo quedan vacíos a propósito: no se inventan datos de empresas reales, y sin email el módulo de mailing no les escribe.

| Cliente | Escenario |
|---|---|
| Toyota | Deuda vencida (una factura impaga y otra con pago parcial) y un pedido despachado |
| Honda | Al día, con dos pedidos pendientes |
| Arcor | Dejó de pedir 2 productos habituales en su último pedido |
| Rowing | Sin contacto hace 20 días (umbral de 15) |
| Ternium | Cotización rechazada por precio y un pedido en preparación |
| Techint | Cotización en negociación y un pedido despachado |
| Emova | Al día, de referencia |

Para sumar clientes reales hasta tener la conexión, se agregan en la lista `CUENTAS` de `demo.ts`.

Lo que se registra desde el CRM (partes, pagos, pedidos, cotizaciones, cambios de estado y ficha) se guarda aparte de la fuente comercial, en la colección `usuarios-cuentas-demo-v2` del almacén existente: Postgres si está configurado, archivos en `.data/` en desarrollo. No se escribe en sistemas externos.

El esquema relacional propuesto está en `db/propuestas/cuentas-clave.sql` (cuentas, contactos, direcciones, partes, pedidos e ítems, facturas, notas de crédito, pagos e imputaciones, cotizaciones e ítems, y una vista con el estado de cada factura). **No se aplica solo.** Para pasar a esas tablas:

1. Sumar el archivo como migración en `src/lib/db/postgres/pg.ts`.
2. Reemplazar `fuenteComercial()` y el guardado en `src/lib/db/usuarios.ts`. El contrato de la ficha (`src/types/usuarios.ts`) y las reglas (`src/lib/usuarios/gestion.ts`) no cambian.
3. Cambiar el nombre de la colección de demostración para no trasladar pruebas a cuentas reales.

Al conectar el sistema de gestión conviene mantener códigos de cliente e identificadores de documentos estables, entregar fechas `AAAA-MM-DD`, una sola moneda por cuenta, y definir si los pagos y los estados de cotización se gestionan en este CRM o se sincronizan.

## API

`GET /api/usuarios/[codigo]` devuelve la ficha. `PATCH` registra una gestión y devuelve la ficha actualizada. Acciones: `perfil`, `parte`, `pago`, `pedido`, `cotizacion` y `estado-cotizacion`. `src/lib/usuarios/validacion.ts` valida la forma de los datos y `gestion.ts` las reglas de la cuenta (saldos, pertenencia de documentos, fechas); ambos responden 400 con el motivo. El autor lo asigna el servidor con la identidad configurada en la intranet.

El contacto, el email y la actividad editados en la ficha se reflejan también en la base de mailing.

## Verificación

`node --test tests/usuarios-gestion.test.mjs` cubre los escenarios de ejemplo, el resumen de la cartera (estado de cuenta, filtros, orden, totales y buscador), los pedidos pendientes, la cuenta corriente, la imputación de pagos, el rechazo de cotizaciones, los partes, los pedidos, la inactividad y los productos habituales.
