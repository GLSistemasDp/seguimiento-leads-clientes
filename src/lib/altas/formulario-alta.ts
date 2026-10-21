import { cuitValido } from "@/lib/solicitudes/presentacion";
import type { DatosSolicitud } from "@/types/solicitud";

/**
 * Formulario de Alta de Clientes que completa el cliente desde
 * /formularios/alta (mismo formulario que pedidos-web-dp, en 4 pasos, mas la
 * documentacion obligatoria y la firma). Solo clientes de Argentina (CUIT). Valida lo que llega y lo convierte
 * en una solicitud de alta de la intranet.
 */

export class ErrorAlta extends Error {}

/**
 * Documentos de "Informacion adicional": todos obligatorios (solo operamos en
 * Argentina). Las etiquetas son las que usa la clasificacion
 * (lib/solicitudes/evaluacion.ts).
 */
export const DOCUMENTOS_ALTA = [
  { campo: "doc_legajo", etiqueta: "Legajo impositivo" },
  { campo: "doc_cm05", etiqueta: "Formulario CM05" },
  { campo: "doc_cuit", etiqueta: "Constancia de CUIT" },
  { campo: "doc_iva", etiqueta: "Declaración jurada de IVA" },
  { campo: "doc_cargas", etiqueta: "Última DDJJ de cargas sociales" },
  { campo: "doc_ganancias", etiqueta: "Última DDJJ de Ganancias" },
  { campo: "doc_estatuto", etiqueta: "Contrato social / Estatuto" },
  { campo: "doc_balance", etiqueta: "Último balance" },
] as const;

const CANALES = [
  "Facebook", "Instagram", "YouTube", "Web", "Publicidad", "Nuestras capacitaciones",
  "Cámara Argentina de Seguridad (CAS)", "La chica HyS (Laura Yaya)", "Rescue Training",
  "Referencia de otro cliente", "Otro",
];

export const PROVINCIAS = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa",
  "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

const INDUSTRIAS = [
  "Seguridad industrial", "Petrolera", "Construcción", "Marítima", "Retail / Distribuidora", "Salud", "Agro",
  "Metalúrgica", "Siderúrgica", "Química", "Logística", "Automotor", "Aeronáutica", "Gastronomía", "Gráfica",
  "Servicio de mantenimiento", "Turística", "Otros",
];
const PUNTOS_VENTA = ["Comercio digital", "Comercio físico", "Ambos"];
const TIPOS_COMPRA = ["Compras semanales", "Compras mensuales", "Compras anuales", "Por licitación", "Por contrato"];

type Direccion = { direccion: string; provincia: string; lat: string; lng: string };

function texto(valor: unknown, maximo = 200): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : typeof valor === "number" ? String(valor) : "";
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

function obligatorio(valor: string, etiqueta: string): string {
  if (!valor) throw new ErrorAlta(`Completá: ${etiqueta}.`);
  return valor;
}

function deLista(valor: string, lista: readonly string[], etiqueta: string, requerido: boolean): string {
  if (!valor) {
    if (requerido) throw new ErrorAlta(`Elegí una opción en: ${etiqueta}.`);
    return "";
  }
  if (!lista.includes(valor)) throw new ErrorAlta(`Opción inválida en: ${etiqueta}.`);
  return valor;
}

function direccion(valor: unknown): Direccion {
  const datos = objeto(valor);
  const coordenada = (dato: unknown) => {
    const numero = Number(texto(dato, 30));
    return Number.isFinite(numero) && texto(dato, 30) ? numero.toFixed(6) : "";
  };
  return {
    direccion: texto(datos.direccion, 300),
    provincia: PROVINCIAS.includes(texto(datos.provincia, 60)) ? texto(datos.provincia, 60) : "",
    lat: coordenada(datos.lat),
    lng: coordenada(datos.lng),
  };
}

function formatoDireccion(dir: Direccion): string {
  if (!dir.direccion) return "";
  const conProvincia =
    dir.provincia && !dir.direccion.toLowerCase().includes(dir.provincia.toLowerCase())
      ? `${dir.direccion}, ${dir.provincia}`
      : dir.direccion;
  return /argentina/i.test(conProvincia) ? conProvincia : `${conProvincia}, Argentina`;
}

/** Cantidad entera razonable (antiguedad, empleados); vacio si no la cargo. */
function entero(valor: unknown, maximo: number, etiqueta: string): string {
  const crudo = texto(valor, 10);
  if (!crudo) return "";
  const numero = Number(crudo);
  if (!Number.isInteger(numero) || numero < 0 || numero > maximo) throw new ErrorAlta(`${etiqueta} no es válido.`);
  return String(numero);
}

const TELEFONO = /^\+?[0-9 ()-]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AltaValidada = { nombre: string; email: string; datos: DatosSolicitud };

/**
 * Valida el JSON del formulario. Los adjuntos y la firma se agregan despues,
 * cuando ya estan guardados (sus links van en `datos`).
 */
export function validarAlta(valor: unknown, fecha: string): AltaValidada {
  const datos = objeto(valor);

  // Paso 1: datos del cliente
  let canal = deLista(texto(datos.canal, 80), CANALES, "¿Cómo nos conociste?", true);
  if (canal === "Otro" && texto(datos.canalOtro)) canal = `Otro: ${texto(datos.canalOtro)}`;

  const nombreFantasia = obligatorio(texto(datos.nombreFantasia), "Nombre de fantasía");
  const razonSocial = obligatorio(texto(datos.razonSocial), "Razón social");
  const cuit = obligatorio(texto(datos.cuit, 20), "CUIT");
  if (cuit.replace(/\D/g, "").length !== 11) throw new ErrorAlta("El CUIT tiene que tener 11 números.");
  // Un digito verificador que no coincide no frena el alta: queda marcado para revisar.
  const cuitARevisar = !cuitValido(cuit);

  const telefono = obligatorio(texto(datos.telefono, 30), "Teléfono");
  if (!TELEFONO.test(telefono)) throw new ErrorAlta("El teléfono debe tener entre 7 y 15 números (podés empezar con +).");
  const responsable = obligatorio(texto(datos.responsable, 120), "Nombre del responsable");
  const email = obligatorio(texto(datos.email).toLowerCase(), "Email");
  if (!EMAIL.test(email)) throw new ErrorAlta("El email no es válido.");

  const crudas = objeto(datos.direcciones);
  const legal = direccion(crudas.legal);
  obligatorio(legal.direccion, "Dirección legal");
  obligatorio(legal.provincia, "Provincia de la dirección legal");
  const sucursal = direccion(crudas.sucursal);
  const comercial = direccion(crudas.comercial);

  // Paso 2: empresa
  const industria = deLista(texto(datos.industria, 60), INDUSTRIAS, "Tipo de industria", true);
  const industriaFinal = industria === "Otros" && texto(datos.industriaOtra) ? `Otros: ${texto(datos.industriaOtra)}` : industria;
  const puntosVenta = deLista(texto(datos.puntosVenta, 40), PUNTOS_VENTA, "Puntos de venta", industria === "Retail / Distribuidora");
  const antiguedad = entero(datos.antiguedad, 200, "La antigüedad");
  const empleados = entero(datos.empleados, 1_000_000, "La cantidad de empleados");
  const tipoCompra = deLista(texto(datos.tipoCompra, 40), TIPOS_COMPRA, "Tipo de compra", false);

  // Paso 3: envio
  const retira = datos.retiraCliente === true;
  const usaTransporte = datos.usaTransporte === true;
  if (!retira && !usaTransporte) throw new ErrorAlta("Indicá si retirás vos o si usás transporte.");
  const t = objeto(datos.transportista);
  const transportista = {
    fantasia: texto(t.fantasia),
    razonSocial: texto(t.razonSocial),
    cuit: texto(t.cuit, 20),
    direccion: texto(t.direccion),
    telefono: texto(t.telefono, 30),
    destino: texto(t.destino),
  };
  if (usaTransporte) {
    obligatorio(transportista.fantasia || transportista.razonSocial, "Transportista · nombre o razón social");
    obligatorio(transportista.telefono, "Transportista · teléfono");
  }

  // Paso 4: referencias (tres)
  const referencias = (Array.isArray(datos.referencias) ? datos.referencias : []).slice(0, 3).map((fila) => {
    const item = objeto(fila);
    return { empresa: texto(item.empresa), email: texto(item.email), telefono: texto(item.telefono, 30) };
  });
  if (referencias.length < 3 || referencias.some((ref) => !ref.empresa)) {
    throw new ErrorAlta("Completá las tres referencias comerciales.");
  }
  if (referencias.some((ref) => !ref.email && !ref.telefono)) {
    throw new ErrorAlta("Cada referencia comercial necesita un email o un teléfono.");
  }
  if (referencias.some((ref) => ref.email && !EMAIL.test(ref.email))) throw new ErrorAlta("Hay un email de referencia inválido.");
  if (datos.aceptaTerminos !== true) throw new ErrorAlta("Para enviar tenés que aceptar los términos y condiciones.");

  const ubicacion = (dir: Direccion) => (dir.lat && dir.lng ? `${dir.lat}, ${dir.lng}` : "");
  const salida: DatosSolicitud = {
    Origen: "Formulario web del cliente",
    "Fecha del formulario": fecha,
    "Cómo nos conoció": canal,
    "Nombre de fantasía": nombreFantasia,
    "Razón social": razonSocial,
    CUIT: cuit,
    ...(cuitARevisar ? { "CUIT a verificar": "El dígito verificador no coincide" } : {}),
    Responsable: responsable,
    Teléfono: telefono,
    "Dirección legal": formatoDireccion(legal),
    Provincia: legal.provincia,
    "Ubicación legal (lat, lng)": ubicacion(legal),
    "Dirección de sucursal": formatoDireccion(sucursal),
    "Dirección comercial": formatoDireccion(comercial),
    "Tipo de industria": industriaFinal,
    "Puntos de venta": puntosVenta,
    "Antigüedad (años)": antiguedad,
    "Cantidad de empleados": empleados,
    "Tipo de compra": tipoCompra,
    Envío: [retira ? "Retira cliente" : "", usaTransporte ? "Envío por transporte" : ""].filter(Boolean).join(" y "),
    Transportista: usaTransporte
      ? [
          transportista.fantasia || transportista.razonSocial,
          transportista.fantasia && transportista.razonSocial ? transportista.razonSocial : "",
          transportista.cuit && `CUIT ${transportista.cuit}`,
          transportista.direccion && `Bs. As.: ${transportista.direccion}`,
          transportista.telefono && `Tel. ${transportista.telefono}`,
          transportista.destino && `Destino: ${transportista.destino}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : "",
    "Referencias comerciales": referencias.map((ref) => [ref.empresa, ref.email, ref.telefono].filter(Boolean).join(" · ")).join(" | "),
    "Aceptó términos y condiciones": "Sí",
  };
  // Sin campos vacios: la clasificacion cuenta lo que se completo.
  for (const [clave, valorCampo] of Object.entries(salida)) if (valorCampo === "") delete salida[clave];

  return { nombre: razonSocial, email, datos: salida };
}
