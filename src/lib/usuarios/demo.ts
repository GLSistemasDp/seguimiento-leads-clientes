import { CATALOGO_USUARIOS } from "@/lib/usuarios/catalogo";
import { hoyArgentina, redondear, sumarDias, totalItems } from "@/lib/usuarios/analisis";
import type {
  ContactoUsuario,
  CotizacionUsuario,
  EstadoPedido,
  FichaUsuario,
  ItemUsuario,
  MedioPago,
  ParteUsuario,
  TipoParte,
} from "@/types/usuarios";

/**
 * Cuentas clave (clientes USUARIOS) con datos comerciales de EJEMPLO, hasta
 * conectar el sistema de gestion. Los nombres son los clientes reales; los
 * importes, pedidos, facturas y partes son inventados para probar el CRM, y
 * cada cuenta tiene un escenario distinto. Las fechas se calculan desde hoy:
 * el escenario se ve igual cualquier dia que se abra.
 *
 * CUIT, contactos, direcciones y ejecutivo quedan vacios a proposito: no se
 * inventan datos de empresas reales (y sin email, el mailing no les escribe).
 */

type Escenario = "DEUDA" | "AL_DIA" | "BRECHA" | "SIN_CONTACTO" | "RECHAZO";

const CUENTAS: readonly {
  codigo: string;
  nombre: string;
  actividad: string;
  escenario: Escenario;
  limiteCredito: number;
  /** Posiciones del catalogo que la cuenta compra siempre. */
  canasta: number[];
  /** Pedidos todavia sin entregar: [dias atras, estado]. */
  enCurso: [number, EstadoPedido][];
  /** Cotizacion abierta extra (en negociacion), para cuentas con oportunidades. */
  negociacion?: number[];
}[] = [
  { codigo: "TOYOTA", nombre: "Toyota", actividad: "Industria automotriz", escenario: "DEUDA", limiteCredito: 90_000, canasta: [0, 1, 7, 8], enCurso: [[2, "DESPACHADO"]] },
  { codigo: "HONDA", nombre: "Honda", actividad: "Industria automotriz", escenario: "AL_DIA", limiteCredito: 120_000, canasta: [1, 3, 5, 9], enCurso: [[1, "RECIBIDO"], [3, "EN_PREPARACION"]] },
  { codigo: "ARCOR", nombre: "Arcor", actividad: "Industria alimenticia", escenario: "BRECHA", limiteCredito: 60_000, canasta: [0, 1, 7, 8], enCurso: [] },
  { codigo: "ROWING", nombre: "Rowing", actividad: "", escenario: "SIN_CONTACTO", limiteCredito: 75_000, canasta: [1, 3, 5, 9], enCurso: [] },
  { codigo: "TERNIUM", nombre: "Ternium", actividad: "Siderurgia", escenario: "RECHAZO", limiteCredito: 150_000, canasta: [0, 2, 3, 8], enCurso: [[4, "EN_PREPARACION"]] },
  { codigo: "TECHINT", nombre: "Techint", actividad: "Ingeniería y construcción", escenario: "AL_DIA", limiteCredito: 140_000, canasta: [4, 5, 6, 9], enCurso: [[5, "DESPACHADO"]], negociacion: [7, 8, 9] },
  { codigo: "EMOVA", nombre: "Emova", actividad: "Transporte (subterráneos)", escenario: "AL_DIA", limiteCredito: 50_000, canasta: [2, 4, 6, 9], enCurso: [] },
];

const AUTOR_DEMO = "Ejemplo · Equipo comercial";
/** Pedidos mensuales hacia atras. */
const PEDIDOS = 9;
const PLAZO_DIAS = 30;

/** Los partes de cada escenario: [dias atras, tipo, resumen, proximo contacto en dias (o null)]. */
const PARTES: Record<Escenario, readonly [number, TipoParte, string, number | null][]> = {
  DEUDA: [
    [4, "LLAMADA", "Pagos informó que la factura vencida está en circuito de aprobación. Compromiso de pago para la próxima semana; el saldo de la anterior se cancela con e-cheq.", 3],
    [15, "WHATSAPP", "Recordatorio del vencimiento enviado al responsable de Pagos.", null],
    [33, "VISITA", "Visita a planta: prevén reponer guantes y eslingas el mes próximo.", null],
  ],
  AL_DIA: [
    [5, "LLAMADA", "Contacto de rutina con Compras. Sin novedades; reponen en la primera semana del mes.", 25],
    [34, "CORREO", "Se envió el estado de cuenta: todo cancelado en término.", null],
  ],
  BRECHA: [
    [3, "LLAMADA", "Compras confirmó la recepción del último pedido. No mencionó las eslingas que suele reponer todos los meses: consultar si cambiaron de proveedor o si tienen stock.", 4],
    [19, "CORREO", "Se envió la lista de precios vigente y el plan de entregas del trimestre.", null],
    [41, "VISITA", "Visita con Seguridad e Higiene. Relevamos consumo de guantes por turno; piden mantener stock de seguridad.", null],
  ],
  SIN_CONTACTO: [
    [20, "LLAMADA", "Compras pidió revisar el plazo de entrega de la cotización enviada. Quedaron en responder al cerrar el presupuesto mensual.", -6],
    [48, "REUNION", "Reunión por videollamada con Compras y Almacenes para ordenar el calendario de reposición.", null],
  ],
  RECHAZO: [
    [2, "REUNION", "Reunión con Compras por la cotización rechazada: la competencia ofreció 8% menos en guantes de vaqueta. Evaluar una mejora por volumen anual.", 5],
    [12, "LLAMADA", "Seguimiento de la cotización de eslingas: está en negociación, esperan la aprobación de Gerencia.", null],
    [37, "CORREO", "Envío de fichas técnicas y certificados solicitados por Seguridad e Higiene.", null],
  ],
};

const numero = (valor: number, largo = 3) => String(valor).padStart(largo, "0");

export function clientesUsuariosDemo(hoy = hoyArgentina()): FichaUsuario[] {
  const dia = (atras: number) => sumarDias(hoy, -atras);
  return CUENTAS.map((cuenta, indice) => {
    const { codigo, escenario } = cuenta;
    // Contactos por area, a completar con los datos reales.
    const contactos: ContactoUsuario[] = [
      { id: "compras", nombre: "", rol: "COMPRAS", email: "", telefono: "" },
      { id: "pagos", nombre: "", rol: "PAGOS", email: "", telefono: "" },
      { id: "gerencia", nombre: "", rol: "GERENCIA", email: "", telefono: "" },
    ];
    const ficha: FichaUsuario = {
      codigo,
      nombre: cuenta.nombre,
      fantasia: "",
      cuit: "",
      condicionIva: "",
      provincia: "",
      actividad: cuenta.actividad,
      vendedor: "",
      contacto: "",
      email: "",
      telefono: "",
      umbralSeguimientoDias: 15,
      moneda: "USD",
      limiteCredito: cuenta.limiteCredito,
      plazoPagoDias: PLAZO_DIAS,
      listaPrecios: "Lista USUARIOS · USD",
      direccionesEntrega: [],
      contactos,
      partes: [], pedidos: [], facturas: [], notasCredito: [], pagos: [], cotizaciones: [],
      origen: "demo",
    };

    const items = (posiciones: readonly number[], vuelta: number): ItemUsuario[] =>
      posiciones.map((posicion, orden) => ({
        ...CATALOGO_USUARIOS[posicion],
        cantidad: (6 + ((indice * 5 + orden * 7 + vuelta * 3) % 9)) * 24,
      }));

    // Pedidos mensuales entregados y facturados. El mas reciente: hace 26 dias
    // en la cuenta sin contacto, hace 6 en el resto.
    const ultimoPedidoHace = escenario === "SIN_CONTACTO" ? 26 : 6;
    for (let atras = PEDIDOS - 1; atras >= 0; atras -= 1) {
      const fecha = dia(ultimoPedidoHace + atras * 30);
      // Cada tres pedidos suma un producto ocasional (no llega a ser habitual).
      const ocasional = atras % 3 === 2 ? [(cuenta.canasta[0] + 5) % CATALOGO_USUARIOS.length] : [];
      // BRECHA: el ultimo pedido viene sin dos de los productos de siempre.
      const canasta = escenario === "BRECHA" && atras === 0 ? cuenta.canasta.slice(0, 2) : cuenta.canasta;
      const pedido = {
        id: `ped-${atras}`,
        numero: `PED-${codigo}-${numero(PEDIDOS - atras)}`,
        fecha,
        ordenCompra: `OC-${4200 + indice * 310 + (PEDIDOS - atras)}`,
        estado: "ENTREGADO" as const,
        items: items([...canasta, ...ocasional], atras),
      };
      ficha.pedidos.push(pedido);

      const emitida = sumarDias(fecha, 2);
      const vencimiento = sumarDias(emitida, PLAZO_DIAS);
      const total = totalItems(pedido.items);
      const factura = { id: `fac-${atras}`, numero: `A-0003-${codigo}-${numero(PEDIDOS - atras)}`, fecha: emitida, vencimiento, pedidoId: pedido.id, total };
      ficha.facturas.push(factura);
      if (vencimiento >= hoy) continue; // todavia no vence: queda pendiente

      // DEUDA: la penultima queda impaga y la anterior con la mitad pagada.
      if (escenario === "DEUDA" && atras === 1) continue;
      const parcial = escenario === "DEUDA" && atras === 2;
      // Una nota de credito de ejemplo, por diferencia de precio.
      const acreditado = (escenario === "RECHAZO" || codigo === "EMOVA") && atras === 3 ? redondear(total * 0.05) : 0;
      if (acreditado) {
        ficha.notasCredito.push({ id: `nc-${atras}`, numero: `NC-0003-${codigo}-${numero(PEDIDOS - atras)}`, fecha: sumarDias(emitida, 9), facturaId: factura.id, importe: acreditado, motivo: "Diferencia de precio" });
      }
      const importe = redondear((total - acreditado) * (parcial ? 0.5 : 1));
      const medio: MedioPago = atras % 4 === 0 ? "CHEQUE" : atras % 4 === 3 ? "RETENCIONES" : "TRANSFERENCIA";
      ficha.pagos.push({
        id: `pago-${atras}`,
        numero: `REC-${codigo}-${numero(PEDIDOS - atras)}`,
        fecha: sumarDias(vencimiento, parcial ? 6 : -3),
        importe,
        medio,
        referencia: medio === "CHEQUE" ? `E-cheq ${88_000 + indice * 97 + atras}` : medio === "RETENCIONES" ? "Certificado de retención IIBB" : `Transferencia ${510_000 + indice * 613 + atras}`,
        imputaciones: [{ facturaId: factura.id, importe }],
        autor: "Ejemplo · Administración",
      });
    }

    // Pedidos en curso: todavia sin entregar ni facturar.
    cuenta.enCurso.forEach(([hace, estado], orden) => {
      ficha.pedidos.push({
        id: `ped-curso-${orden}`,
        numero: `PED-${codigo}-${numero(PEDIDOS + 1 + orden)}`,
        fecha: dia(hace),
        ordenCompra: `OC-${4200 + indice * 310 + PEDIDOS + 1 + orden}`,
        estado,
        items: items(cuenta.canasta, 20 + orden),
      });
    });

    const cotizacion = (clave: string, orden: number, hace: number, estado: CotizacionUsuario["estado"], posiciones: number[], extra: Partial<CotizacionUsuario> = {}): CotizacionUsuario => ({
      id: `cot-${clave}`,
      numero: `COT-${codigo}-${numero(100 + orden)}`,
      fecha: dia(hace),
      validez: sumarDias(dia(hace), 30),
      estado,
      items: items(posiciones, orden + 2),
      motivoRechazo: null,
      observacionRechazo: "",
      ...extra,
    });
    ficha.cotizaciones = [cotizacion("aprobada", 1, 55, "APROBADA", cuenta.canasta.slice(0, 3))];
    if (escenario === "RECHAZO") {
      ficha.cotizaciones.push(
        cotizacion("rechazada", 2, 16, "RECHAZADA", [0, 2, 4], {
          motivoRechazo: "PRECIO",
          observacionRechazo: "Compras informó que otro proveedor cotizó 8% menos en guantes de vaqueta para el mismo volumen. Piden revisar el precio por contrato anual.",
        }),
        cotizacion("negociacion", 3, 12, "EN_NEGOCIACION", [7, 8, 9]),
      );
    } else if (escenario === "SIN_CONTACTO") {
      ficha.cotizaciones.push(cotizacion("enviada", 2, 22, "ENVIADA", [1, 3, 7]));
    } else if (escenario === "DEUDA") {
      ficha.cotizaciones.push(cotizacion("borrador", 2, 1, "BORRADOR", [4, 5]));
    } else {
      ficha.cotizaciones.push(cotizacion("enviada", 2, 5, "ENVIADA", escenario === "BRECHA" ? [7, 8, 9] : [2, 6]));
    }
    if (cuenta.negociacion) ficha.cotizaciones.push(cotizacion("oportunidad", 4, 8, "EN_NEGOCIACION", cuenta.negociacion));

    ficha.partes = PARTES[escenario].map(([hace, tipo, resumen, proximo], orden): ParteUsuario => ({
      id: `parte-${orden}`,
      fecha: `${dia(hace)}T${numero(13 + orden, 2)}:30:00Z`,
      tipo,
      resumen,
      proximoContacto: proximo === null ? "" : sumarDias(hoy, proximo),
      autor: AUTOR_DEMO,
    }));
    return ficha;
  });
}
