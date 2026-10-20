import { cuitValido } from "@/lib/solicitudes/presentacion";
import type { DatosSolicitud } from "@/types/solicitud";

/**
 * Formulario de Alta de Clientes que completa el cliente desde
 * /formularios/alta. Valida lo que llega y lo convierte en una solicitud de
 * alta de la intranet (nombre, email y `datos` con etiquetas legibles).
 */

export class ErrorAlta extends Error {}

/** Documentos obligatorios de "Informacion adicional", con el nombre del campo del formulario. */
export const DOCUMENTOS_ALTA = [
  { campo: "doc_cm05", etiqueta: "Formulario CM05" },
  { campo: "doc_legajo", etiqueta: "Legajo impositivo" },
  { campo: "doc_cuit", etiqueta: "Constancia de CUIT" },
  { campo: "doc_iva", etiqueta: "Declaración jurada de IVA" },
  { campo: "doc_cargas", etiqueta: "Última DDJJ de cargas sociales" },
  { campo: "doc_ganancias", etiqueta: "Última DDJJ de Ganancias" },
  { campo: "doc_estatuto", etiqueta: "Contrato social / Estatuto" },
  { campo: "doc_balance", etiqueta: "Último balance" },
] as const;

export const DIRECCIONES = [
  { clave: "legal", etiqueta: "Dirección legal" },
  { clave: "comercial", etiqueta: "Dirección comercial" },
  { clave: "correspondencia", etiqueta: "Dirección de envío de correspondencia" },
  { clave: "entrega", etiqueta: "Dirección de entrega de la mercadería" },
  { clave: "sucursal", etiqueta: "Sucursal" },
] as const;

const ENVIOS = {
  retira: "Retira cliente",
  transporte: "Usa transporte",
  sin_cargo: "Entrega sin cargo (logística De Pascale)",
  con_cargo_24hs: "Entrega 24 hs con cargo (AMBA / CABA)",
} as const;

const ANTIGUEDADES = ["1 año", "2 años", "3 años", "5 años", "10 años", "20 años", "+20 años", "otros"];
const FRECUENCIAS = ["Anual", "Mensual", "Semanal", "otros"];
const RUBROS = ["Seguridad", "Ferretería"];

type Direccion = { direccion: string; localidad: string; ciudad: string; cp: string; provincia: string; pais: string };
type Transporte = {
  fantasia: string;
  razonSocial: string;
  cuit: string;
  direccion: string;
  telDireccion: string;
  destino: string;
  telDestino: string;
};
type Referencia = { empresa: string; direccion: string; credito: string; contacto: string; email: string; telefono: string };

function texto(valor: unknown, maximo = 200): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

function obligatorio(valor: string, etiqueta: string): string {
  if (!valor) throw new ErrorAlta(`Completá: ${etiqueta}.`);
  return valor;
}

/** Una opcion de la lista o, si eligio "otros", el texto que escribio. */
function opcion(valor: unknown, otro: unknown, opciones: readonly string[], etiqueta: string): string {
  const elegido = texto(valor, 40);
  if (!opciones.includes(elegido)) throw new ErrorAlta(`Elegí una opción en: ${etiqueta}.`);
  return elegido === "otros" ? obligatorio(texto(otro), `${etiqueta} (otros)`) : elegido;
}

function direccion(valor: unknown, etiqueta: string): Direccion {
  const datos = objeto(valor);
  return {
    direccion: obligatorio(texto(datos.direccion), `${etiqueta} · calle y número`),
    localidad: obligatorio(texto(datos.localidad, 120), `${etiqueta} · localidad`),
    ciudad: texto(datos.ciudad, 120),
    cp: obligatorio(texto(datos.cp, 20), `${etiqueta} · código postal`),
    provincia: obligatorio(texto(datos.provincia, 80), `${etiqueta} · provincia`),
    pais: texto(datos.pais, 80) || "Argentina",
  };
}

function formatoDireccion(dir: Direccion): string {
  return `${dir.direccion}, ${[dir.localidad, dir.ciudad].filter(Boolean).join(", ")} (CP ${dir.cp}), ${dir.provincia}, ${dir.pais}`;
}

function transporte(valor: unknown, etiqueta: string, requerido: boolean): Transporte | null {
  const datos = objeto(valor);
  const resultado: Transporte = {
    fantasia: texto(datos.fantasia),
    razonSocial: texto(datos.razonSocial),
    cuit: texto(datos.cuit, 20),
    direccion: texto(datos.direccion),
    telDireccion: texto(datos.telDireccion, 60),
    destino: texto(datos.destino),
    telDestino: texto(datos.telDestino, 60),
  };
  const vacio = Object.values(resultado).every((campo) => !campo);
  if (vacio && !requerido) return null;
  obligatorio(resultado.razonSocial || resultado.fantasia, `${etiqueta} · nombre o razón social`);
  obligatorio(resultado.direccion, `${etiqueta} · dirección en Bs. As.`);
  obligatorio(resultado.telDireccion || resultado.telDestino, `${etiqueta} · teléfono`);
  return resultado;
}

function formatoTransporte(dato: Transporte): string {
  return [
    dato.fantasia || dato.razonSocial,
    dato.razonSocial && dato.fantasia ? dato.razonSocial : "",
    dato.cuit && `CUIT ${dato.cuit}`,
    dato.direccion && `Bs. As.: ${dato.direccion}${dato.telDireccion ? ` (Tel. ${dato.telDireccion})` : ""}`,
    dato.destino && `Destino: ${dato.destino}${dato.telDestino ? ` (Tel. ${dato.telDestino})` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type AltaValidada = { nombre: string; email: string; datos: DatosSolicitud };

/**
 * Valida el JSON del formulario. Los adjuntos y la firma se agregan despues,
 * cuando ya estan guardados (sus links van en `datos`).
 */
export function validarAlta(valor: unknown, fecha: string): AltaValidada {
  const datos = objeto(valor);

  const rubros = (Array.isArray(datos.rubro) ? datos.rubro : []).filter(
    (item): item is string => typeof item === "string" && RUBROS.includes(item),
  );
  const rubroOtro = texto(datos.rubroOtro);
  if (rubros.length === 0 && !rubroOtro) throw new ErrorAlta("Elegí al menos un rubro.");

  const razonSocial = obligatorio(texto(datos.razonSocial), "Razón social");
  const cuit = obligatorio(texto(datos.cuit, 20), "CUIT");
  if (!cuitValido(cuit)) throw new ErrorAlta("El CUIT no es válido. Revisá los 11 dígitos.");
  const email = obligatorio(texto(datos.email).toLowerCase(), "E-mail");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorAlta("El e-mail no es válido.");
  const fechaConstitucion = obligatorio(texto(datos.fechaConstitucion, 10), "Fecha de constitución");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaConstitucion)) throw new ErrorAlta("La fecha de constitución no es válida.");

  const crudas = objeto(datos.direcciones);
  const direcciones = Object.fromEntries(
    DIRECCIONES.map(({ clave, etiqueta }) => [clave, direccion(crudas[clave], etiqueta)]),
  ) as Record<(typeof DIRECCIONES)[number]["clave"], Direccion>;

  const envio = texto(datos.envio, 20);
  if (!Object.hasOwn(ENVIOS, envio)) throw new ErrorAlta("Elegí cómo se hacen los envíos.");
  const usaTransporte = envio === "transporte";
  const usual = transporte(datos.transporteUsual, "Transporte usual", usaTransporte);
  const alternativo = transporte(datos.transporteAlternativo, "Transporte alternativo", false);

  const referencias: Referencia[] = (Array.isArray(datos.referencias) ? datos.referencias : [])
    .slice(0, 6)
    .map((fila) => {
      const item = objeto(fila);
      return {
        empresa: texto(item.empresa),
        direccion: texto(item.direccion),
        credito: texto(item.credito, 60),
        contacto: texto(item.contacto, 120),
        email: texto(item.email),
        telefono: texto(item.telefono, 60),
      };
    })
    .filter((ref) => ref.empresa);
  if (referencias.length === 0) throw new ErrorAlta("Indicá al menos una referencia comercial.");
  if (referencias.some((ref) => !ref.contacto && !ref.email && !ref.telefono)) {
    throw new ErrorAlta("Cada referencia comercial necesita un contacto, e-mail o teléfono.");
  }

  const salida: DatosSolicitud = {
    Origen: "Formulario web del cliente",
    "Fecha del formulario": fecha,
    "Nombre de fantasía": obligatorio(texto(datos.nombreFantasia), "Nombre de fantasía"),
    "Razón social": razonSocial,
    CUIT: cuit,
    "Fecha de constitución": fechaConstitucion,
    Rubro: [...rubros, rubroOtro].filter(Boolean).join(", "),
    Antigüedad: opcion(datos.antiguedad, datos.antiguedadOtro, ANTIGUEDADES, "Antigüedad"),
    "Puntos de venta / canal de venta": obligatorio(texto(datos.puntosVenta, 300), "Puntos de venta o canal de venta"),
    "Cantidad de empleados": obligatorio(texto(datos.empleados, 20), "Cantidad de empleados"),
    "Frecuencia de compra": opcion(datos.frecuencia, datos.frecuenciaOtro, FRECUENCIAS, "Frecuencia de compra"),
    Teléfono: obligatorio(texto(datos.telefono, 60), "Teléfono"),
    Provincia: direcciones.legal.provincia,
    ...Object.fromEntries(DIRECCIONES.map(({ clave, etiqueta }) => [etiqueta, formatoDireccion(direcciones[clave])])),
    "Envíos / transporte": ENVIOS[envio as keyof typeof ENVIOS],
    "Transporte usual": usual ? formatoTransporte(usual) : "",
    "Transporte alternativo": alternativo ? formatoTransporte(alternativo) : "",
    "Referencias comerciales": referencias
      .map((ref) =>
        [ref.empresa, ref.direccion, ref.credito && `crédito ${ref.credito}`, ref.contacto, ref.email, ref.telefono]
          .filter(Boolean)
          .join(" · "),
      )
      .join(" | "),
  };

  return { nombre: razonSocial, email, datos: salida };
}
