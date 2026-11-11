# Gestión interna de clientes USUARIOS

La sección `/usuarios` reúne la cartera de grandes empresas. Permite filtrar por vendedor, actividad, relación y prioridades de gestión. Cada cuenta tiene su ficha en `/usuarios/[codigo]`.

La ficha muestra pedidos y sus artículos, cotizaciones con estado y motivo informado por el cliente cuando no se ganan, facturas con saldo pendiente, comentarios de cobranza, compromisos de pago y observaciones sobre la relación. Cada gestión conserva fecha y autor. La última observación define el resumen de la relación y la próxima acción del vendedor.

El resumen incluye crédito, deuda, evolución mensual de pedidos y facturación, conversión de cotizaciones y ranking de productos y líneas. Los importes mantienen la moneda de la cuenta. El consumo se calcula sobre pedidos entregados; los cancelados no alimentan el volumen de pedidos. Las comparaciones de facturación interanual usan el mismo período. Las facturas pendientes siguen visibles aunque correspondan a años anteriores.

## Datos y futura conexión al ERP o base de datos

La fuente comercial actual es de ejemplo y se indica en ambas pantallas. `src/lib/db/usuarios.ts` concentra su acceso mediante `fuenteComercial()`. El contrato de la ficha y sus documentos está en `src/types/usuarios.ts`; la generación ficticia está en `src/lib/usuarios/demo.ts`.

Al implementar el conector productivo:

- Conservar códigos de cliente e identificadores de documentos estables. Las notas se vinculan por cliente y documento.
- Entregar fechas `AAAA-MM-DD`, moneda explícita y saldos pendientes reales, incluidos los pagos parciales. No sumar documentos de monedas diferentes en una misma ficha.
- Mantener separados los datos comerciales del ERP y las gestiones internas. Un comentario o una promesa de pago no modifica el saldo de una factura.
- Definir si el estado de la cotización se gestionará en este CRM o se sincronizará con el ERP.
- Cambiar el espacio de almacenamiento de la demostración para evitar trasladar sus notas a cuentas reales.

Las gestiones se almacenan en la colección `usuarios-gestiones-demo-v1` del almacén existente: Postgres cuando está configurado, archivos en `.data/` en desarrollo sin base. No se realizan escrituras sobre sistemas externos.

`GET /api/usuarios/[codigo]` devuelve la ficha; `PATCH` acepta las acciones `perfil`, `observacion`, `cotizacion` y `cobranza`. La API valida estados, fechas y pertenencia del documento a la cuenta. Exige motivo para una cotización no ganada y solo agrega comentarios a facturas con saldo pendiente. El autor lo asigna el servidor con la identidad configurada en la intranet; la asignación de vendedores organiza la cartera, sin agregar un sistema nuevo de permisos por vendedor.

El enlace “Preparar mail para este cliente” abre las plantillas de USUARIOS con la cuenta seleccionada. El contacto, email y actividad editados en la ficha se reflejan también en la base de mailing.

## Simular todos los datos

El botón está en la cartera y en cada ficha. Activa `?simulacion=1` y prepara escenarios a partir de los mismos clientes, productos, precios y estados del módulo existente. Incluye pedidos en todos los estados, cotizaciones ganadas y no ganadas con su motivo, facturas pagadas, pendientes y vencidas con pago parcial, comentarios de cobranza, compromisos de pago y la evolución de la relación.

La simulación mantiene el recorrido entre cartera y ficha. Se pueden probar los formularios de gestión con la misma lógica de validación de documentos e historial; sus cambios quedan en la pantalla y no se envían a la API de guardado. “Volver a datos guardados” recupera la ficha original. Recargar o salir descarta los cambios de prueba.

## Verificación

Los casos de relación, cobranza, estados de cotización y cálculos comerciales están en `tests/usuarios-gestion.test.mjs`. Se ejecutan con `node --test tests/usuarios-gestion.test.mjs`.
