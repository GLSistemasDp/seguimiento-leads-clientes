/**
 * Contactos que se insertan en los mails. SON DE EJEMPLO: antes de enviar de
 * verdad hay que completarlos con los datos reales del equipo comercial y de
 * los distribuidores autorizados.
 */

export type ContactoComercial = { nombre: string; email: string; whatsapp: string };

/** Vendedor responsable por grupo vendedor (el mismo de la planilla de seguimiento). */
const VENDEDORES: Record<string, ContactoComercial> = {
  "GERENCIA+A": { nombre: "Elizabeth (Cuentas A)", email: "cuentasa@depascale.com.ar", whatsapp: "+54 9 11 5555-0101" },
  GERENCIA: { nombre: "Jonathan (Gerencia comercial)", email: "comercial@depascale.com.ar", whatsapp: "+54 9 11 5555-0102" },
  LITORAL: { nombre: "Equipo Litoral", email: "litoral@depascale.com.ar", whatsapp: "+54 9 341 555-0103" },
  "EPP - CORDOBA": { nombre: "Equipo Córdoba", email: "cordoba@depascale.com.ar", whatsapp: "+54 9 351 555-0104" },
  "VENDEDOR NOA": { nombre: "Equipo NOA", email: "noa@depascale.com.ar", whatsapp: "+54 9 381 555-0105" },
  "VENTAS - SANIDAD": { nombre: "Equipo Sanidad", email: "sanidad@depascale.com.ar", whatsapp: "+54 9 11 5555-0106" },
  "IDP - MZA - CUYO": { nombre: "Equipo Cuyo", email: "cuyo@depascale.com.ar", whatsapp: "+54 9 261 555-0107" },
};

export const CONTACTO_GENERAL: ContactoComercial = {
  nombre: "Equipo comercial De Pascale",
  email: "ventas@depascale.com.ar",
  whatsapp: "+54 9 11 5555-0100",
};

export function vendedorDe(grupoVendedor: string): ContactoComercial {
  return VENDEDORES[grupoVendedor.trim().toUpperCase()] ?? CONTACTO_GENERAL;
}

/** A que grupo vendedor va cada provincia (para las altas, que todavia no tienen grupo). */
export function grupoPorProvincia(provincia: string): string {
  const texto = provincia.toLowerCase();
  if (/santa fe|entre rios|corrientes|misiones|chaco|formosa/.test(texto)) return "LITORAL";
  if (/cordoba|la rioja|san luis/.test(texto)) return "EPP - CORDOBA";
  if (/tucuman|salta|jujuy|santiago|catamarca/.test(texto)) return "VENDEDOR NOA";
  if (/mendoza|san juan/.test(texto)) return "IDP - MZA - CUYO";
  return "GERENCIA";
}

export type Distribuidor = { nombre: string; ciudad: string; telefono: string; email: string };

/** Distribuidores autorizados por zona, para derivar a quien no se le da el alta directa. */
const DISTRIBUIDORES: Record<string, Distribuidor[]> = {
  LITORAL: [
    { nombre: "Seguridad Total Rosario S.R.L.", ciudad: "Rosario, Santa Fe", telefono: "0341 455-0201", email: "ventas@seguridadtotalrosario.com.ar" },
    { nombre: "EPP Paraná Distribuciones", ciudad: "Paraná, Entre Ríos", telefono: "0343 422-0202", email: "contacto@eppparana.com.ar" },
  ],
  "EPP - CORDOBA": [
    { nombre: "Protección Mediterránea S.A.", ciudad: "Córdoba capital", telefono: "0351 470-0203", email: "ventas@proteccionmediterranea.com.ar" },
  ],
  "VENDEDOR NOA": [
    { nombre: "Industrial Norte Seguridad", ciudad: "San Miguel de Tucumán", telefono: "0381 421-0204", email: "info@industrialnorte.com.ar" },
    { nombre: "Salta EPP", ciudad: "Salta capital", telefono: "0387 431-0205", email: "ventas@saltaepp.com.ar" },
  ],
  "IDP - MZA - CUYO": [
    { nombre: "Cuyo Protección Industrial", ciudad: "Mendoza", telefono: "0261 429-0206", email: "ventas@cuyoproteccion.com.ar" },
  ],
  GERENCIA: [
    { nombre: "Distribuidora Seguridad Sur", ciudad: "Lanús, Buenos Aires", telefono: "011 4241-0207", email: "ventas@seguridadsur.com.ar" },
    { nombre: "Patagonia EPP", ciudad: "Neuquén", telefono: "0299 448-0208", email: "contacto@patagoniaepp.com.ar" },
    { nombre: "Bonaerense Industrial", ciudad: "La Plata, Buenos Aires", telefono: "0221 421-0209", email: "info@bonaerenseindustrial.com.ar" },
  ],
};

export function distribuidoresPara(provincia: string): Distribuidor[] {
  return DISTRIBUIDORES[grupoPorProvincia(provincia)] ?? DISTRIBUIDORES.GERENCIA;
}

/** Datos de cobranza para los mails de deuda. Completar con los reales antes de enviar. */
export const DATOS_PAGO = "Transferencia a la cuenta de Industrias De Pascale · [completar CBU / alias de cobranzas]";
