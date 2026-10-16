import type { Destinatario } from "@/types/mailing";

/**
 * Base de clientes de EJEMPLO para el mailing. La planilla de seguimiento no
 * trae mail, saldo ni fecha de ultima compra: en produccion esta base sale
 * del ERP / maestro de clientes. Los nombres son ficticios.
 */

const DIA_MS = 86_400_000;

type Semilla = [
  nombre: string,
  rubro: string,
  provincia: string,
  clasificacion: string,
  grupoVendedor: string,
  situacion: string,
  /** Saldo vencido en miles de pesos. */
  deudaMiles: number,
  /** Hace cuantos dias compro por ultima vez (null = nunca). */
  ultimaCompra: number | null,
  /** false = el cliente no tiene mail cargado. */
  conMail?: boolean,
];

const SEMILLAS: Semilla[] = [
  ["Bulonera Sarmiento S.R.L.", "Ferretería y bulonería", "Buenos Aires", "A", "GERENCIA+A", "OK", 0, 6],
  ["Seguridad Industrial del Plata S.A.", "Seguridad industrial / EPP", "Buenos Aires", "A", "GERENCIA+A", "OK", 0, 12],
  ["Ferretería Industrial Oeste", "Ferretería y bulonería", "Buenos Aires", "B", "GERENCIA", "TIENE DEUDA", 845, 41],
  ["Construcciones Andinas S.A.", "Construcción", "Mendoza", "B", "IDP - MZA - CUYO", "OK", 0, 132],
  ["Agroinsumos Pergamino S.R.L.", "Agro", "Buenos Aires", "C", "GERENCIA", "OK", 0, 210],
  ["Metalúrgica Rafaela S.A.", "Metalúrgica", "Santa Fe", "A", "LITORAL", "OK", 0, 9],
  ["Distribuidora EPP Rosario", "Seguridad industrial / EPP", "Santa Fe", "A", "LITORAL", "TIENE DEUDA", 1320, 18],
  ["Servicios Petroleros Comahue S.A.", "Petróleo y energía", "Neuquén", "A", "GERENCIA+A", "OK", 0, 27],
  ["Corralón El Progreso", "Corralón de materiales", "Córdoba", "C", "EPP - CORDOBA", "OK", 0, 154, false],
  ["Logística Ruta 9 S.A.", "Logística", "Córdoba", "B", "EPP - CORDOBA", "OK", 0, 63],
  ["Clínica San Rafael", "Sanidad", "Buenos Aires", "B", "VENTAS - SANIDAD", "OK", 0, 35],
  ["Ferretería Don Pedro", "Ferretería y bulonería", "Tucumán", "C", "VENDEDOR NOA", "NO RESPONDER", 410, 300],
  ["Minera Puna S.A.", "Minería", "Jujuy", "A", "VENDEDOR NOA", "OK", 0, 21],
  ["Taller Metalmecánico Sur", "Metalúrgica", "Buenos Aires", "C", "GERENCIA", "TIENE DEUDA", 96, 118],
  ["Seguridad Total Paraná", "Seguridad industrial / EPP", "Entre Ríos", "B", "LITORAL", "OK", 0, 74],
  ["Obras Civiles Cuyo S.R.L.", "Construcción", "San Juan", "B", "IDP - MZA - CUYO", "OK", 0, 99],
  ["Frigorífico La Pampa S.A.", "Alimentos", "La Pampa", "B", "GERENCIA", "OK", 0, 48],
  ["Limpieza Integral Norte", "Limpieza y mantenimiento", "Salta", "C", "VENDEDOR NOA", "OK", 0, 190],
  ["Bulonería Parque Patricios", "Ferretería y bulonería", "Buenos Aires", "C", "GERENCIA+A", "TIENE DEUDA", 230, 15],
  ["Petroquímica del Sur S.A.", "Petróleo y energía", "Buenos Aires", "A", "GERENCIA+A", "OK", 0, 4],
  ["Hospital Privado Centro", "Sanidad", "Córdoba", "B", "VENTAS - SANIDAD", "OK", 0, 88],
  ["Agro Servicios Venado Tuerto", "Agro", "Santa Fe", "C", "LITORAL", "OK", 0, null],
  ["Constructora Patagónica S.A.", "Construcción", "Chubut", "A", "GERENCIA+A", "TIENE DEUDA", 2150, 57],
  ["Industrias Plásticas Pilar", "Industria plástica", "Buenos Aires", "B", "GERENCIA", "OK", 0, 23],
  ["Ferretería Central Mendoza", "Ferretería y bulonería", "Mendoza", "B", "IDP - MZA - CUYO", "OK", 0, 140],
  ["Transportes del Litoral S.A.", "Logística", "Corrientes", "C", "LITORAL", "JUDICIALIZADO", 3900, 420],
  ["Seguridad Laboral Tucumán", "Seguridad industrial / EPP", "Tucumán", "A", "VENDEDOR NOA", "OK", 0, 11],
  ["Proveedora Naval Ribera", "Metalúrgica", "Buenos Aires", "B", "GERENCIA", "OK", 0, 205],
  ["Cooperativa Eléctrica Rural", "Petróleo y energía", "Córdoba", "C", "EPP - CORDOBA", "OK", 0, 96, false],
  ["Distribuidora Química Avellaneda", "Industria química", "Buenos Aires", "A", "GERENCIA+A", "OK", 0, 8],
  ["Corralón San Martín", "Corralón de materiales", "Buenos Aires", "C", "GERENCIA", "TIENE DEUDA", 58, 102],
  ["Viñedos y Bodegas del Este", "Agro", "Mendoza", "B", "IDP - MZA - CUYO", "OK", 0, 71],
  ["Mantenimiento Industrial Campana", "Limpieza y mantenimiento", "Buenos Aires", "B", "GERENCIA", "OK", 0, 30],
  ["Ferretería del Norte Salteño", "Ferretería y bulonería", "Salta", "A", "VENDEDOR NOA", "OK", 0, 16],
  ["Montajes Electromecánicos Norte", "Petróleo y energía", "Salta", "B", "VENDEDOR NOA", "TIENE DEUDA", 512, 136],
  ["Laboratorio Bioquímico Rosario", "Sanidad", "Santa Fe", "C", "VENTAS - SANIDAD", "OK", 0, 260],
];

const CONTACTOS = ["Laura", "Martín", "Silvina", "Diego", "Carolina", "Pablo", "Verónica", "Hernán", "Natalia", "Federico"];

function dominio(nombre: string): string {
  return (
    nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\b(s\.?a\.?|s\.?r\.?l\.?)\b/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 22) + ".com.ar"
  );
}

function fecha(diasAtras: number, ahora: number): string {
  return new Date(ahora - diasAtras * DIA_MS).toISOString();
}

export function clientesDemo(ahora = Date.now()): Destinatario[] {
  return SEMILLAS.map(
    ([nombre, rubro, provincia, clasificacion, grupoVendedor, situacion, deudaMiles, ultimaCompra, conMail = true], i) => {
      const codigo = String(1100 + i * 137);
      const deuda = deudaMiles * 1000;
      const compra = ultimaCompra === null ? null : fecha(ultimaCompra, ahora);
      const importe = 180_000 + ((i * 73_517) % 2_400_000);
      return {
        id: `cli-${codigo}`,
        origen: "cliente",
        nombre,
        codigo,
        email: conMail ? `compras@${dominio(nombre)}` : "",
        contacto: CONTACTOS[i % CONTACTOS.length],
        rubro,
        clasificacion,
        provincia,
        grupoVendedor,
        situacion,
        deuda,
        saldo: deuda + (i % 3 === 0 ? importe : 0),
        ultimaCompra: compra,
        ultimaFactura:
          ultimaCompra === null
            ? null
            : {
                numero: `A-0003-${String(145_000 + i * 211).padStart(8, "0")}`,
                fecha: compra!,
                importe,
                vencimiento: fecha(ultimaCompra - 30, ahora),
              },
        ultimoPedido:
          ultimaCompra === null
            ? null
            : {
                numero: `NP-${String(52_000 + i * 97)}`,
                fecha: compra!,
                transporte: ["Expreso Cruz del Sur", "Vía Cargo", "Andreani", "Transporte propio"][i % 4],
                guia: `${700_000 + i * 4_519}`,
              },
        cuit: "",
        estadoAlta: null,
      };
    },
  );
}
