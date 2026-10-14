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
`ANTHROPIC_API_KEY` es opcional para evaluar solicitudes con IA.
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
