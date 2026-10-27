# CRM De Pascale

Panel interno para centralizar la relacion con clientes: seguimiento de los
grupos de WhatsApp, solicitudes de alta y reclamos. Esta pensado para sumarse
al portal actual como un grupo "CRM" en la barra lateral (igual que "VENDEDOR").

## MVP para gerencia

**Problema.** La planilla que llena el bot de WhatsApp no la mira nadie si no
se presiona por los grupos; los reclamos se reenvian por Telegram y se pierden
entre mensajes; las altas se evaluan a mano y sin prioridad.

**Menu principal**

| Seccion | Que resuelve |
| --- | --- |
| Resumen | Inicio + tablero en uno: chats sin responder, demoras, reclamos que esperan a gerencia, altas para priorizar, cierre del dia por WhatsApp y graficos por hito / encargado / vendedor. |
| Seguimiento de clientes | La cola priorizada que lee la planilla del bot. Al marcar "respondido" hay que elegir **como quedo** (resuelto, derivado, escalado, espera al cliente…) y opcionalmente la **relacion** (buena / regular / en riesgo) y una observacion. Todo queda en el **historial del cliente** (ficha del cliente). Si gerencia indico algo sobre un reclamo, se ve en la fila. |
| Solicitudes de alta | Formulario publico de 4 pasos (`/formularios/alta`) con 8 documentos y firma. Cada solicitud se clasifica por **cuanto completo** el formulario (A completa, B casi completa, C incompleta, D muy incompleta) y se ordena por las mas completas. Link a **Nosis** con el CUIT. Aprobar / rechazar y armar el mail de respuesta. **Importar Excel** y **Plantillas de mail** son subsecciones. |
| Reclamos | Panel de gerencia que reemplaza Telegram: reclamos de WhatsApp (hito "Reclamo") y formularios FOR-03. En **cada reclamo** se indica la accion para el vendedor; con "Ofrecer producto sustituto" se escribe que producto ofrecer. Estados: esperando gerencia → indicado/en gestion → respondido al cliente. |

**Resumen diario.** `GET /api/resumen-diario` devuelve el mensaje de cierre del
dia (finalizadas, sin responder, demoras de 1+ dia, reclamos sin indicar,
clientes en riesgo) y el link `wa.me` para enviarlo. En el MVP se envia desde
el boton del Resumen; el envio automatico queda para la tarea programada de la
PC interna (la misma del bot).

**Fuera del MVP (siguiente iteracion):** bot de Telegram, envio automatico por
WhatsApp Business API, login/roles del portal, formularios FOR-03 reales,
catalogo real para los sustitutos y escritura en la planilla de produccion
(falta la service account).

### Guion de demo (10 minutos)

1. **Resumen**: "esto es lo que hoy no ve nadie" — chats demorados, reclamos sin indicacion, altas pendientes.
2. **Reclamos** → *Indicar accion* → "Ofrecer producto sustituto" → escribir el producto → guardar.
3. **Seguimiento** → filtrar hito Reclamo: se ve la indicacion de gerencia en la fila. Tildar *respondido* → elegir resultado y relacion → abrir la ficha del cliente y mostrar el historial.
4. **Solicitudes de alta**: las mas completas arriba; abrir una, ver que falta y el informe en Nosis; aprobar y *Comunicar resultado por mail*.
5. **Resumen** → *Ver mensaje* / *Enviar por WhatsApp* del cierre del dia.

### Datos de la demo

- Seguimiento: planilla de **test** leida por su link publico (`SEGUIMIENTO_ACCESO="publico"`, desde la fila 600).
- Altas y formularios de reclamo: datos de ejemplo en memoria (`DB_BACKEND="demo"`).
- Lo que genera la app (historial, indicaciones de gerencia, evaluaciones de IA, tildes) queda en `.data/*.json`. Borrar esa carpeta deja la demo como nueva.
- Variables nuevas en `.env.example`: `RESUMEN_WHATSAPP_NUMERO`, `APP_URL`, `PORTAL_USUARIO`.
- Link a los grupos de WhatsApp: agregar en la hoja `Desplegable` (o en `Seguimiento`) una columna **Link grupo WhatsApp** con el link de invitacion (`https://chat.whatsapp.com/...`). Sin link, el boton copia el nombre del grupo y abre WhatsApp Web.

## Formularios de reclamo (FOR-03)

Con `DB_BACKEND="demo"` hay seis formularios ficticios, uno por clasificacion
del formulario FOR-03 Rev04, con el detalle de cliente, comprobantes,
productos, evaluacion de Calidad, acciones correctivas y cierre. No se importan
PDFs ni adjuntos. La integracion con la fuente real queda pendiente.

Herramienta interna del equipo comercial: importa las solicitudes de alta que
llegan del formulario de Acrobat, permite aprobarlas o rechazarlas y arma el
mail de respuesta listo para pegar en el cliente de correo.

El MVP guarda los datos en una planilla de Google. La capa de acceso a datos
esta detras de una interfaz (`src/lib/db/repositorio.ts`), asi que pasar a
Postgres mas adelante no toca ninguna pantalla.

## Puesta en marcha

### 1. Credenciales de Google

La app entra a la planilla con una *service account*, no con tu usuario. Eso
permite que la planilla quede privada y que el servidor no tenga que pedirte
login cada vez.

1. Entrar a [Google Cloud Console](https://console.cloud.google.com/) y crear
   un proyecto (o usar uno existente).
2. En **APIs y servicios → Biblioteca**, habilitar **Google Sheets API**.
3. En **APIs y servicios → Credenciales**, crear una **Cuenta de servicio**.
4. Sobre esa cuenta, pestana **Claves → Agregar clave → Crear clave nueva →
   JSON**. Se descarga un archivo.
5. Del JSON salen dos valores para el `.env`:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (copiala tal cual, con los `\n`)
6. Abrir la planilla y **compartirla con ese `client_email` como Editor**. Sin
   este paso la API responde 403.

### 2. Variables de entorno

Copiar `.env.example` a `.env` y completar:

- `DB_BACKEND="sheets"`
- `GOOGLE_SHEETS_ID`: el id de la planilla (esta en su URL, entre `/d/` y `/edit`).
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY`.

### 3. Levantar

```
npm install
npm run dev
```

Entrar a http://localhost:3000. Las hojas `Solicitudes` y `Plantillas` se crean
solas en la planilla la primera vez que la app las necesita, con sus
encabezados y las dos plantillas por defecto.

## Estructura de la planilla

Las columnas son exactamente las del modelo Prisma, para que migrar sea copiar
columna por columna.

**Hoja `Solicitudes`**

| Columna            | Contenido                                        |
| ------------------ | ------------------------------------------------ |
| `id`               | UUID generado por la app                         |
| `nombre`           | Nombre del cliente                               |
| `email`            | Clave unica: por aca se identifica cada solicitud |
| `datos`            | JSON con el resto de las columnas del formulario |
| `estado`           | `PENDIENTE`, `APROBADO` o `RECHAZADO`            |
| `fechaImportacion` | ISO 8601                                         |
| `fechaDecision`    | ISO 8601, vacio mientras este pendiente          |
| `usuarioDecisor`   | Vacio en esta demo sin usuarios                 |

**Hoja `Plantillas`**

| Columna      | Contenido                                     |
| ------------ | --------------------------------------------- |
| `id`         | UUID generado por la app                      |
| `tipo`       | `aprobado` o `rechazado`                      |
| `asunto`     | Admite placeholders                           |
| `cuerpoHtml` | HTML con `{{nombre}}`, `{{usuario}}`, etc.    |
| `headerImg`  | URL de la imagen de encabezado (opcional)     |
| `headerAlt`  | Texto alternativo del encabezado              |
| `footerImg`  | URL de la imagen de pie (opcional)            |
| `footerAlt`  | Texto alternativo del pie                     |

> Se puede editar a mano, con cuidado: la columna `datos` tiene que seguir
> siendo JSON valido y `estado` uno de los tres valores.

## Migrar a Postgres mas adelante

1. Crear la base (Neon y Supabase tienen plan gratuito) y poner `DATABASE_URL`.
2. `npm run db:migrate` — el `schema.prisma` ya esta escrito.
3. Volcar las dos hojas a las tablas (mismas columnas, mismo orden).
4. Cambiar `DB_BACKEND="postgres"`.

No hay que tocar pantallas ni route handlers: importan de
`@/lib/db/solicitudes` y `@/lib/db/plantillas`, que eligen la implementacion
por import dinamico segun `DB_BACKEND`.

## Comandos

| Comando              | Para que sirve                                  |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Levanta la app en modo desarrollo                |
| `npm run build`      | Build de produccion (corre TypeScript y ESLint)  |
| `npm run typecheck`  | Solo chequeo de tipos                            |
| `npm run db:migrate` | Migraciones de Prisma (solo backend Postgres)    |
| `npm run db:studio`  | Explorador visual de la base Postgres            |

## Como esta organizado

- `src/app` — rutas. `(dashboard)` es el panel de acceso directo,
  `api` los route handlers.
- `src/components` — componentes agrupados por pantalla, mas `ui/` con los
  basicos propios (no usamos libreria de componentes).
- `src/lib` — logica agrupada por dominio:
  - `db/` acceso a datos: `repositorio.ts` define el contrato, `sheets/` la
    implementacion activa, `postgres/` la futura, y `solicitudes.ts` /
    `plantillas.ts` son la fachada que usan las pantallas,
  - `import/` parseo y normalizacion de planillas,
  - `email/` armado del HTML y copiado al portapapeles,
  - `utils/` helpers de HTML, strings y fechas.

## Planilla modificada de seguimiento

La pestaña `Seguimiento` de `consulta cliente 26` se integra con esta configuración:

```dotenv
SEGUIMIENTO_BACKEND="sheets"
SEGUIMIENTO_SHEETS_ID="1vlLExkogxqDGqkxcrwX3JeczI16pwxFbs6wL0XFL6Xk"
SEGUIMIENTO_HOJA="Seguimiento"
SEGUIMIENTO_ACCESO="publico"
```

En Vercel, cargar estas variables en los entornos correspondientes y volver a desplegar.
Si el seguimiento ya usa Postgres con sincronización, conservar `SEGUIMIENTO_BACKEND="postgres"`:
la importación usa el mismo lector y admite el encabezado nuevo.
La columna `grillo` contiene el código y nombre del cliente. También se admiten
`Cliente`, `Grupo / Cliente` y `Razón social`; las columnas se ubican por nombre,
incluso si cambia su orden. `Columna 2` se ignora. Las fechas pueden ser números
de serie o texto como `9/25/2026`.

El acceso público fue comprobado para esta planilla. En este modo la aplicación
lee Sheets y guarda las gestiones en su almacén; para escribir directamente en
Sheets, quitar `SEGUIMIENTO_ACCESO="publico"` y configurar la service account.
`SEGUIMIENTO_FILA_INICIO` sigue permitiendo omitir filas históricas; vacío lee desde el inicio.

Si una lectura falla, Resumen conserva las secciones disponibles y muestra un
aviso con **Reintentar**. Seguimiento y Solicitudes mantienen la navegación y
muestran el aviso en lugar de una tabla vacía o métricas en cero. Los detalles del
error quedan en los logs del servidor. Si falla la sincronización a Postgres,
se conservan los registros y se informa el fallo del último intento.

Pruebas del lector: `node --test tests/sheets-seguimiento.test.mjs`.

## Decisiones a tener presentes

- **Acceso directo para pruebas.** Se eliminaron el login, las sesiones y los
  controles de acceso de paginas y APIs. `/` abre `/resumen` sin credenciales.
  La autenticacion y los roles se rediseñaran en una etapa posterior.
- **Sin envio automatico.** El mail se copia al portapapeles ya renderizado y
  se pega en Gmail / Outlook / Apple Mail. El envio con un proveedor tipo
  Resend queda para una fase posterior.
- **Sheets lee la hoja completa en cada operacion.** No sabe filtrar ni
  ordenar, asi que el filtrado se hace en memoria. Con cientos de filas va
  holgado; cuando sean decenas de miles, ese es el momento de pasar a Postgres.
- **Mapeo de columnas pendiente de confirmar.** Los alias de encabezados del
  export de Acrobat estan en `src/lib/import/normalize-solicitud.ts`
  (`ALIAS_NOMBRE` y `ALIAS_EMAIL`); hay que validarlos contra un archivo real.
- **Compatibilidad de los mails.** Los templates usan tablas, estilos inline,
  600px de ancho fijo, boton bulletproof con fallback VML para Outlook,
  preheader oculto, fuentes web-safe y ninguna `background-image` en CSS.
