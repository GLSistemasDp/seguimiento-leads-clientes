import { facturasConEstado, redondear } from "@/lib/usuarios/analisis";
import { productoDelCatalogo } from "@/lib/usuarios/catalogo";
import type { CambioUsuario, FichaUsuario, GestionUsuario, ItemNuevo, ItemUsuario } from "@/types/usuarios";

/**
 * Lo que se carga desde el CRM (partes, pagos, pedidos, cotizaciones y cambios
 * de estado) se guarda aparte de la fuente comercial y se superpone al leer.
 * Las reglas de negocio estan aca, en funciones puras: la API solo valida la
 * forma de los datos y llama a `registrarGestionUsuario`.
 */

/** Un dato que no cumple una regla de negocio (la API responde 400 con el mensaje). */
export class ErrorGestion extends Error {
  readonly esErrorGestion = true;
}

export const gestionVacia = (): GestionUsuario => ({ partes: [], pagos: [], pedidos: [], cotizaciones: [], estadosCotizacion: {} });

/** La ficha de la fuente comercial con todo lo cargado desde el CRM. */
export function aplicarGestion(ficha: FichaUsuario, gestion: GestionUsuario): FichaUsuario {
  const perfil = gestion.perfil;
  return {
    ...ficha,
    ...perfil,
    // El contacto principal de la ficha es el primero de la lista (Compras).
    contactos: perfil
      ? ficha.contactos.map((contacto, indice) =>
          indice === 0 ? { ...contacto, nombre: perfil.contacto, email: perfil.email, telefono: perfil.telefono } : contacto,
        )
      : ficha.contactos,
    partes: [...gestion.partes, ...ficha.partes].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    pagos: [...ficha.pagos, ...gestion.pagos],
    pedidos: [...ficha.pedidos, ...gestion.pedidos],
    cotizaciones: [...ficha.cotizaciones, ...gestion.cotizaciones].map((cotizacion) => ({
      ...cotizacion,
      ...gestion.estadosCotizacion[cotizacion.id],
    })),
  };
}

const numero = (valor: number) => String(valor).padStart(3, "0");

/** Completa cada renglon con la descripcion y la linea del catalogo. */
function armarItems(items: readonly ItemNuevo[]): ItemUsuario[] {
  if (items.length === 0) throw new ErrorGestion("Agregá al menos un producto.");
  if (new Set(items.map((item) => item.sku)).size !== items.length) throw new ErrorGestion("Hay un producto repetido: unificá las cantidades en un solo renglón.");
  return items.map((item) => {
    const producto = productoDelCatalogo(item.sku);
    if (!producto) throw new ErrorGestion(`El producto ${item.sku} no está en el catálogo.`);
    return { ...producto, cantidad: item.cantidad, precioUnitario: item.precioUnitario };
  });
}

/**
 * Suma una gestion a lo ya cargado y devuelve el resultado, sin tocar lo
 * anterior. Corre dentro de la transaccion del almacen.
 *
 * @param momento ISO de la carga; `hoy` es el dia en Argentina ("AAAA-MM-DD").
 */
export function registrarGestionUsuario(
  base: FichaUsuario,
  actual: GestionUsuario,
  cambio: CambioUsuario,
  autor: string,
  momento: string,
  id: string,
  hoy: string,
): GestionUsuario {
  const vigente = aplicarGestion(base, actual);
  const siguiente: GestionUsuario = {
    ...actual,
    partes: [...actual.partes],
    pagos: [...actual.pagos],
    pedidos: [...actual.pedidos],
    cotizaciones: [...actual.cotizaciones],
    estadosCotizacion: { ...actual.estadosCotizacion },
  };

  switch (cambio.accion) {
    case "perfil":
      siguiente.perfil = cambio.perfil;
      break;

    case "parte":
      if (cambio.proximoContacto && cambio.proximoContacto < hoy) throw new ErrorGestion("La próxima fecha de contacto no puede ser anterior a hoy.");
      siguiente.partes.unshift({ id, fecha: momento, tipo: cambio.tipo, resumen: cambio.resumen, proximoContacto: cambio.proximoContacto, autor });
      break;

    case "pago": {
      if (cambio.fecha > hoy) throw new ErrorGestion("La fecha del pago no puede ser futura.");
      const facturas = new Map(facturasConEstado(vigente, hoy).map((factura) => [factura.id, factura]));
      if (new Set(cambio.imputaciones.map((imputacion) => imputacion.facturaId)).size !== cambio.imputaciones.length) {
        throw new ErrorGestion("Una factura figura dos veces en la imputación.");
      }
      for (const imputacion of cambio.imputaciones) {
        const factura = facturas.get(imputacion.facturaId);
        if (!factura) throw new ErrorGestion("Una de las facturas no pertenece a este cliente.");
        if (imputacion.importe > factura.saldo + 0.005) {
          throw new ErrorGestion(`El importe aplicado a ${factura.numero} supera su saldo pendiente.`);
        }
      }
      const aplicado = redondear(cambio.imputaciones.reduce((total, imputacion) => total + imputacion.importe, 0));
      if (aplicado > cambio.importe + 0.005) throw new ErrorGestion("Lo aplicado a las facturas supera el importe del pago.");
      siguiente.pagos.push({
        id,
        numero: `REC-${base.codigo}-${numero(vigente.pagos.length + 1)}`,
        fecha: cambio.fecha,
        importe: cambio.importe,
        medio: cambio.medio,
        referencia: cambio.referencia,
        imputaciones: cambio.imputaciones,
        autor,
      });
      break;
    }

    case "pedido":
      siguiente.pedidos.push({
        id,
        numero: `PED-${base.codigo}-${numero(vigente.pedidos.length + 1)}`,
        fecha: hoy,
        ordenCompra: cambio.ordenCompra,
        estado: "RECIBIDO",
        items: armarItems(cambio.items),
      });
      break;

    case "cotizacion":
      if (cambio.validez < hoy) throw new ErrorGestion("La validez de la cotización no puede ser anterior a hoy.");
      siguiente.cotizaciones.push({
        id,
        numero: `COT-${base.codigo}-${numero(101 + vigente.cotizaciones.length)}`,
        fecha: hoy,
        validez: cambio.validez,
        estado: cambio.estado,
        items: armarItems(cambio.items),
        motivoRechazo: null,
        observacionRechazo: "",
      });
      break;

    case "estado-cotizacion": {
      const cotizacion = vigente.cotizaciones.find((item) => item.id === cambio.cotizacionId);
      if (!cotizacion) throw new ErrorGestion("La cotización no pertenece a este cliente.");
      const rechazada = cambio.estado === "RECHAZADA";
      // Rechazar exige decir por que: motivo del catalogo y observaciones.
      if (rechazada && !cambio.motivoRechazo) throw new ErrorGestion("Elegí el motivo de rechazo.");
      if (rechazada && !cambio.observacionRechazo.trim()) throw new ErrorGestion("Completá las observaciones del rechazo.");
      siguiente.estadosCotizacion[cotizacion.id] = {
        estado: cambio.estado,
        motivoRechazo: rechazada ? cambio.motivoRechazo : null,
        observacionRechazo: rechazada ? cambio.observacionRechazo.trim() : "",
      };
      break;
    }
  }
  return siguiente;
}
