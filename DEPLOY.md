# Despliegue de demo en Vercel

Importar `GLSistemasDp/seguimiento-leads-clientes`, rama `main`, con el preset
Next.js y la carpeta raiz del repositorio. Instalacion: `npm ci`.
Compilacion: `npm run build`.

Configurar estas variables en Vercel antes de desplegar:

```dotenv
DB_BACKEND=demo
SEGUIMIENTO_BACKEND=sheets
SEGUIMIENTO_ACCESO=publico
SEGUIMIENTO_SHEETS_ID=ID_DE_LA_PLANILLA
SEGUIMIENTO_HOJA=Seguimiento
SEGUIMIENTO_FILA_INICIO=600
```

El ID se toma de la URL de Google Sheets, entre `/d/` y `/edit`.
La planilla debe permitir lectura con el enlace. No hace falta una clave
privada para este modo. Altas y formularios de reclamo usan datos de ejemplo.
`APP_URL` puede configurarse con la URL del despliegue para los enlaces del resumen.

## Almacenamiento y acceso

En Vercel, las notas, indicaciones, evaluaciones e historial de esta demo se
guardan en archivos temporales. Pueden desaparecer al reiniciar una instancia,
al desplegar o al atender una solicitud desde otra instancia. No constituyen
un almacenamiento persistente ni compartido entre usuarios. Las solicitudes
en memoria tambien son temporales. En local se mantiene `.data/`.

Para uso operativo hace falta implementar almacenamiento persistente para
estas funciones. Configurar solamente `DB_BACKEND=postgres` no migra el
historial ni los cambios del seguimiento.

La aplicacion actualmente abre sin login. Quienes tengan acceso al despliegue
pueden ver los datos de la planilla y usar las acciones disponibles. Para
compartir una demo con terceros, usar una planilla de prueba y/o configurar
proteccion de acceso al despliegue.

No subir `.env.local`, credenciales, `.data/` ni `node_modules/` al repositorio.

## Notificaciones por Telegram

Cada pantalla tiene su notificacion. Todas se arman y se envian desde
`src/lib/notificaciones/envios.ts`, que usan los botones, los crons y los
formularios publicos por igual:

| Notificacion | Cuando sale | Contenido |
| --- | --- | --- |
| Seguimiento de chats | 13:00 y 17:00 (`/api/cron/cierre-del-dia`) y boton en Seguimiento y Resumen | Varios mensajes por prioridad: resumen de pendientes, reclamos, pedidos nuevos, refacturar y el resto. Cada chat con razon social, N° de cliente, estado de cuenta, hito y link al grupo |
| Reclamo nuevo | Al instante, cuando el cliente completa `/formularios/reclamo` | Razon social, N° de cliente, grupo de WhatsApp, estado de cuenta, hito (motivo) y link al reclamo |
| Reclamos pendientes | 17:00 (`/api/cron/reclamos`) y boton en Reclamos | Los reclamos sin resolver con los mismos datos |
| Alta nueva | Al instante, cuando se completa `/formularios/alta` | Razon social, CUIT, rubro, puntuacion (ej. 9/10) y link a la solicitud |
| Altas pendientes | Boton en Solicitudes de alta | Las solicitudes pendientes, de mayor a menor puntuacion |

Los botones "Enviar a Telegram" (`POST /api/notificaciones/<tipo>`) mandan en
el momento, sin mirar horarios ni feriados.

Por defecto todo va al grupo de `TELEGRAM_VENDEDORES_CHAT_ID`. Para separar,
configurar `TELEGRAM_SEGUIMIENTO_CHAT_ID`, `TELEGRAM_RECLAMOS_CHAT_ID` y/o
`TELEGRAM_ALTAS_CHAT_ID` (el bot tiene que estar en cada grupo). Los links de
los mensajes usan `APP_URL`, o el dominio de produccion de Vercel si no esta.

1. En Telegram, hablarle a **@BotFather**, enviar `/newbot` y copiar el token.
2. Agregar el bot al grupo de vendedores y escribir cualquier mensaje en el grupo.
3. Abrir `https://api.telegram.org/bot<TOKEN>/getUpdates` y copiar el
   `chat.id` del grupo (empieza con `-100`).
4. En Vercel configurar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_VENDEDORES_CHAT_ID` y
   `CRON_SECRET` (texto largo y aleatorio) y volver a desplegar.

`vercel.json` programa `/api/cron/cierre-del-dia` de lunes a viernes a las
16:00 y 20:00 UTC (13:00 y 17:00 de Argentina) y `/api/cron/reclamos` a las
20:00 UTC (17:00). Los endpoints saltean fines de semana y feriados nacionales
(API argentinadatos, con respaldo 2026 en el codigo); los puentes turisticos
cuentan como dias habiles.

- **Plan Hobby:** admite estos tres crons (cada uno corre una vez por dia), pero
  Vercel los dispara en cualquier momento dentro de la hora (13:00 a 13:59).
  En **Pro** salen al minuto.
- **Registro:** cada ejecucion (enviada, salteada o con error) queda en los Logs
  de Vercel con el prefijo `[automatizacion]`. Con Postgres (`DATABASE_URL`)
  tambien se guarda en la tabla `automation_logs` (crearla con `npm run db:push`).
- **Probar a mano:** `curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/cierre-del-dia`
  (o `/api/cron/reclamos`; en feriado o fin de semana responde `{"status":"skipped"}`).
- Los avisos al instante salen despues de contestarle al cliente: si Telegram
  falla, el formulario igual queda guardado y el error queda en el registro.

## Formularios para clientes (reclamo y alta)

Son HTML + Tailwind + JS (`public/formularios/`) que se comparten por link:

- Reclamo: `https://<dominio>/formularios/reclamo`
- Alta de clientes: `https://<dominio>/formularios/alta`

Desde la intranet hay botones para copiar el link (Reclamos y Solicitudes de
alta). En cada reclamo de WhatsApp, "Copiar link del formulario para el
cliente" lo manda precargado con razón social y N° de cliente, y lo que el
cliente cargue queda unido a ese reclamo.

Los formularios solo envían datos a `/api/publico/*`, que responde "recibido"
(y el N° de reclamo). No muestran nada de la intranet.

**Antes de mandar los links a clientes reales:**

1. Configurar `INTRANET_USUARIO` e `INTRANET_PASSWORD`: sin eso la intranet
   abre sin login en el mismo dominio que los formularios.
2. Pasar a almacenamiento persistente. En Vercel lo que mandan los clientes
   (formularios, adjuntos, firma) hoy se guarda en archivos temporales y se
   puede perder. Hace falta Postgres + un almacenamiento de archivos
   (Vercel Blob, S3 o Google Drive).
3. Los adjuntos de un envío no pueden superar ~4 MB en total (límite de
   Vercel por request).

Para publicar los HTML en otro sitio (ej. la web de De Pascale): copiar la
carpeta `public/formularios`, completar `<meta name="dp-api" content="https://<dominio-del-crm>">`
en cada HTML y agregar ese sitio en `FORMULARIOS_ORIGENES`.
