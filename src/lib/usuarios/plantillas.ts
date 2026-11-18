import { htmlATextoPlano } from "@/lib/email/clipboard";
import { dineroUsuario, facturasConEstado, fechaUsuario, totalItems } from "@/lib/usuarios/analisis";
import { textoAParrafos } from "@/lib/utils/html";
import { ESTADOS_PEDIDO_USUARIO } from "@/types/usuarios";
import type { PlantillaMailing, TipoMailUsuario } from "@/types/mailing";
import type { CotizacionUsuario, FacturaUsuario, FichaUsuario, PedidoUsuario } from "@/types/usuarios";

export type PlantillasUsuarios = Record<TipoMailUsuario, PlantillaMailing>;
export type ContextoMailUsuario = { pedido?: PedidoUsuario; cotizacion?: CotizacionUsuario; factura?: FacturaUsuario };
export type BorradorMailUsuario = { asunto: string; texto: string };

/** Usa el contacto del área correspondiente, sin inventar nombres ni direcciones. */
export function contactoMailUsuario(ficha: FichaUsuario, tipo: TipoMailUsuario) {
  const rol = tipo === "usuario_cobranza" || tipo === "usuario_factura" ? "PAGOS" : "COMPRAS";
  const contacto = ficha.contactos.find((item) => item.rol === rol && (item.nombre || item.email));
  return {
    nombre: contacto?.nombre || ficha.contacto || ficha.nombre,
    email: contacto?.email || ficha.email,
  };
}

/**
 * Las mismas plantillas del mailing, completadas con la ficha y el documento
 * elegido. Los datos que no existen quedan entre corchetes para revisarlos.
 * No se eligen documentos implícitamente: un pedido nuevo nunca toma los
 * productos, el número ni la validez de otra cotización de la cuenta.
 */
export function prepararMailUsuario(
  tipo: TipoMailUsuario,
  plantilla: PlantillaMailing,
  hoy: string,
  ficha?: FichaUsuario,
  contexto: ContextoMailUsuario = {},
): BorradorMailUsuario {
  const contacto = ficha ? contactoMailUsuario(ficha, tipo) : { nombre: "[NOMBRE CONTACTO]", email: "[EMAIL CLIENTE]" };
  const variables: Record<string, string> = {
    nombre: ficha?.nombre || "[EMPRESA DEL CLIENTE]",
    contacto: contacto.nombre,
    codigo_cliente: ficha?.codigo || "[CÓDIGO CLIENTE]",
    vendedor: ficha?.vendedor || "[EJECUTIVO]",
    rubro: ficha?.actividad || "[ACTIVIDAD CLIENTE]",
    provincia: ficha?.provincia || "[PROVINCIA CLIENTE]",
    cuit: ficha?.cuit || "[CUIT CLIENTE]",
    email: contacto.email || "[EMAIL CLIENTE]",
    telefono: ficha?.telefono || "[TELÉFONO CLIENTE]",
    fecha_hoy: fechaUsuario(hoy),
  };
  const valores: Record<string, string> = {
    "[NOMBRE CONTACTO]": contacto.nombre,
    "[EMPRESA DEL CLIENTE]": variables.nombre,
    "[RAZÓN SOCIAL DEL CLIENTE]": variables.nombre,
  };
  const { cotizacion, factura } = contexto;
  const pedido = contexto.pedido ?? (factura && ficha?.pedidos.find((item) => item.id === factura.pedidoId));
  let cuerpo = htmlATextoPlano(plantilla.cuerpo).replace(/^[ \t]+/gm, "");

  if (ficha) {
    const dinero = (importe: number) => dineroUsuario(importe, ficha.moneda);
    valores["[CONDICIÓN DE PAGO]"] = ficha.plazoPagoDias > 0 ? `${ficha.plazoPagoDias} días` : "Contado";
    if (ficha.direccionesEntrega.length === 1) valores["[DIRECCIÓN / RETIRO EN PLANTA]"] = ficha.direccionesEntrega[0];
    if (pedido) {
      valores["[N° PEDIDO]"] = pedido.numero;
      if (pedido.ordenCompra) {
        valores["[N° ORDEN DE COMPRA]"] = pedido.ordenCompra;
        valores["[N° OC]"] = pedido.ordenCompra;
      }
      valores["[EN PREPARACIÓN / LISTO PARA DESPACHO / DESPACHADO / ENTREGADO]"] = ESTADOS_PEDIDO_USUARIO[pedido.estado];
      valores["ingresado el [FECHA]"] = `ingresado el ${fechaUsuario(pedido.fecha)}`;
    }
    if (cotizacion) {
      valores["[N° COTIZACIÓN]"] = cotizacion.numero;
      valores["[FECHA DE VALIDEZ]"] = fechaUsuario(cotizacion.validez);
    }

    const items = cotizacion?.items ?? pedido?.items;
    if (items?.length && (tipo === "usuario_respuesta_cotizacion" || tipo === "usuario_info_cotizacion")) {
      const descripcion = items.map((item) => item.descripcion).join(", ");
      valores["[DESCRIPCIÓN BREVE]"] = ficha.nombre;
      valores["[ARTÍCULO SOLICITADO]"] = descripcion;
      valores["[ARTÍCULO TAL COMO LO INDICÓ EL CLIENTE]"] = descripcion;
      const detalle = items.map((item) =>
        `• ${item.sku} – ${item.descripcion} (${item.linea}) | Cantidad: ${item.cantidad.toLocaleString("es-AR")} | Precio unitario: ${dinero(item.precioUnitario)} + IVA | Subtotal: ${dinero(item.cantidad * item.precioUnitario)} + IVA`,
      ).join("\n");
      const referencia = [
        `Cliente: ${ficha.nombre} · Código: ${ficha.codigo}`,
        ficha.cuit ? `CUIT: ${ficha.cuit}` : "",
        pedido ? `Pedido: ${pedido.numero}${pedido.ordenCompra ? ` · OC: ${pedido.ordenCompra}` : ""}` : "",
      ].filter(Boolean).join("\n");
      const filaProductos = "• [CÓDIGO] – [DESCRIPCIÓN] | Cantidad: [CANTIDAD] | Precio unitario: $ [PRECIO] + IVA\nFicha técnica: [LINK FICHA TÉCNICA] | Ver en la web: [LINK PRODUCTO]";
      const bloqueProductos = `${referencia}\nMoneda: ${ficha.moneda}\n\n${detalle}\n\nTotal: ${dinero(totalItems(items))} + IVA`;
      valores[filaProductos] = bloqueProductos;
      variables.productos = bloqueProductos;
      // Las plantillas editadas también llevan los productos del documento,
      // aunque se haya quitado el renglón original.
      if (!cuerpo.includes(filaProductos) && !/\{\{\s*productos\s*\}\}/i.test(cuerpo)) cuerpo += "\n\n{{productos}}";
      if (pedido && !cotizacion && tipo === "usuario_respuesta_cotizacion") {
        valores["Cotización N° [N° COTIZACIÓN]"] = "Cotización de productos";
        valores["Adjuntamos la cotización N° [N° COTIZACIÓN], con validez hasta el [FECHA DE VALIDEZ]. A continuación, el resumen de los artículos solicitados:"] =
          "Le compartimos el detalle de los productos a cotizar correspondientes a su pedido:";
      }
    }

    if (tipo === "usuario_cobranza") {
      const pendientes = facturasConEstado(ficha, hoy).filter((item) => item.saldo > 0);
      if (pendientes.length > 0) {
        valores["• Factura [TIPO] N° [N° FACTURA] – Vencimiento: [FECHA] – Importe: $ [IMPORTE]"] = pendientes.map((item) =>
          `• Factura ${item.numero} – Vencimiento: ${fechaUsuario(item.vencimiento)} – Saldo pendiente: ${dinero(item.saldo)}`,
        ).join("\n");
      } else {
        valores["• Factura [TIPO] N° [N° FACTURA] – Vencimiento: [FECHA] – Importe: $ [IMPORTE]"] = "No registra facturas pendientes de pago.";
      }
      valores["$ [IMPORTE TOTAL]"] = dinero(pendientes.reduce((suma, item) => suma + item.saldo, 0));
    }
    if (tipo === "usuario_factura" && factura) {
      valores["[TIPO] N° [N° FACTURA]"] = factura.numero;
      valores["[TIPO] N° [PUNTO DE VENTA-NÚMERO]"] = factura.numero;
      valores["Fecha de emisión: [FECHA]"] = `Fecha de emisión: ${fechaUsuario(factura.fecha)}`;
      valores["[FECHA DE VENCIMIENTO]"] = fechaUsuario(factura.vencimiento);
      valores["$ [IMPORTE]"] = dinero(factura.total);
    }
  }

  // Un solo reemplazo: el texto de un cliente o producto nunca se interpreta
  // como una variable ni como HTML de la plantilla.
  const escaparRegex = (valor: string) => valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patron = new RegExp(`\\{\\{\\s*([a-z_]+)\\s*\\}\\}|${Object.keys(valores).sort((a, b) => b.length - a.length).map(escaparRegex).join("|")}`, "gi");
  const completar = (texto: string) => texto.replace(patron, (original: string, clave?: string) =>
    clave ? variables[clave.toLowerCase()] ?? original : valores[original] ?? original,
  );
  return {
    asunto: completar(plantilla.asunto),
    texto: completar([cuerpo, plantilla.botonUrl ? `${plantilla.botonTexto}: ${plantilla.botonUrl}` : "", plantilla.pie].filter(Boolean).join("\n\n")),
  };
}

/** HTML renderizado para pegar en Gmail u Outlook; todo el borrador es texto. */
export function htmlMailUsuario(texto: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1e293b">${textoAParrafos(texto)}</div>`;
}
