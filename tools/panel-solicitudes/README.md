# Panel de Solicitudes (piloto)

Los formularios de alta de clientes llegan desde Adobe Sign y el equipo
comercial los aprueba o rechaza. Los aprobados reciben un mail de bienvenida,
pero **los rechazados nunca recibían respuesta**. Este panel resuelve eso:

- Importa el Excel exportado de Adobe Sign (en el navegador, con SheetJS).
- Saltea solo las filas repetidas, usando `agreementId` como clave: se puede
  subir el mismo export varias veces sin duplicar ni pisar nada.
- Permite marcar cada solicitud como pendiente, aprobada o rechazada.
- Arma el mail de aprobación o de rechazo en HTML compatible con Gmail,
  Outlook, Yahoo y Hotmail, y lo copia al portapapeles para pegarlo a mano.

## Es un piloto que corre como Claude Artifact

El panel que usa el equipo es este link:

**https://claude.ai/artifact/G8AXjyoAY34uFkFiQEfe7T**

`panel-solicitudes.html` es la fuente de ese artifact, versionada acá para
tener historial de cambios. No hace falta desplegarla en ningún lado.

### Por qué el archivo no funciona si se abre o se sirve solo

El panel guarda y sincroniza los datos con `window.claude.use('db')`, una
base compartida que **solo existe cuando la página corre como Claude Artifact
desde claude.ai**. Si el archivo se abre en el navegador o se sube a Vercel,
Netlify o un servidor propio, `window.claude` no existe: el panel muestra el
aviso *"No se pudo conectar el panel a la base de datos compartida"* y nada de
lo que se haga queda guardado.

Para sacarlo de claude.ai hay que reemplazar las llamadas a `db` por un
backend propio (API + base de datos). Esa es la versión escalable que ya está
en este repo (Next.js + Prisma + Postgres, en `src/`). No conviene adaptar el
HTML a medias: o sigue en claude.ai, o se pasa a esa versión completa.

### Datos que guarda

Una colección `solicitudes`, con un documento por solicitud cuyo id es el
`agreementId` (con los caracteres raros reemplazados por `_`):

| Campo               | De dónde sale                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| `nombre`            | Columnas `first` + `last`                                                     |
| `empresa`           | `Datos Cliente ( Razon Social )`, si no `( Nombre Fantasia )`, si no `company` |
| `email`             | `email` (el de quien firma, es al que se le escribe)                          |
| `telefono`          | `Datos Cliente ( Telefono )`                                                  |
| `fechaFormulario`   | `completed`                                                                   |
| `estado`            | `pendiente`, `aprobado` o `rechazado`                                         |
| `fechaImportacion`  | ISO 8601, al importar                                                         |
| `fechaDecision`     | ISO 8601 al aprobar o rechazar, `null` si está pendiente                      |
| `usuarioPlataforma` | El usuario usado en el último mail de aprobación copiado                      |

Las filas sin `agreementId` o sin `email` se descartan. El Excel trae unas 200
columnas; el resto se ignora.

## Cómo se actualiza

1. Editar `panel-solicitudes.html` acá y commitear el cambio.
2. Volver a publicarlo **sobre el mismo artifact** (el mismo link), desde
   claude.ai o desde Claude Code. Si se publica como artifact nuevo, cambia el
   link y se pierden los datos cargados.
3. El artifact tiene que seguir declarando las capacidades `db` y `user`; sin
   `db` el panel se queda sin base.

Todavía no hay CI/CD: publicar es un paso manual.

## Próxima iteración

- **Notificaciones por Telegram** los lunes y viernes con las solicitudes
  pendientes.
- **Envío automático del mail.** Hoy se copia y se pega en el cliente de correo.
- **Migración a la versión Next.js/Prisma/Postgres** de este repo si el piloto
  funciona bien.
