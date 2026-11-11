import { clientesDemo } from "@/lib/mailing/clientes-demo";
import { vendedorDe } from "@/lib/mailing/contactos";
import { hoyArgentina, redondear, totalProductos } from "@/lib/usuarios/analisis";
import type { FichaUsuario, ProductoUsuario } from "@/types/usuarios";

/** Operaciones ficticias para revisar la gestión interna antes de conectar el ERP/BD. */
const PRODUCTOS = [
  ["172226X", "Guante americano de vaqueta con refuerzo antiimpacto", "DPS", 11.6],
  ["DPS11255X", "Guante de nitrilo con protección TPR", "DPS", 9.1],
  ["122225X", "Guante de vaqueta puño corto", "DPS", 8.4],
  ["DPS11855X", "Guante de nitrilo medio baño", "DPS", 7.3],
  ["222025X", "Guante Lincoln reforzado", "DP", 6.2],
  ["322125", "Guante de descarne largo", "DP", 5.1],
  ["221024X", "Guante de protección mecánica", "DP", 4.7],
  ["DPT300075605", "Eslinga de 3 toneladas, 3 metros", "NUBUS", 26.3],
  ["DPT200060605", "Eslinga de 2 toneladas, 3 metros", "NUBUS", 18.1],
  ["DPT100030605", "Eslinga de 1 tonelada, 3 metros", "NUBUS", 13.2],
] as const;

function productos(semilla: number): ProductoUsuario[] {
  return [0, 1, 2].map((posicion) => {
    const [codigo, descripcion, linea, precioUnitario] = PRODUCTOS[(semilla + posicion * 3) % PRODUCTOS.length];
    return { codigo, descripcion, linea, precioUnitario, cantidad: (4 + (semilla * 7 + posicion * 13) % 32) * 24 };
  });
}
const fecha = (anio: number, mes: number, dia: number) => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const sumarDias = (dia: string, cantidad: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + cantidad * 86_400_000).toISOString().slice(0, 10);

export function clientesUsuariosDemo(hoy = hoyArgentina()): FichaUsuario[] {
  const anioActual = Number(hoy.slice(0, 4));
  const mesActual = Number(hoy.slice(5, 7));
  return clientesDemo(Date.parse(`${hoy}T15:00:00Z`)).filter((d) => d.tipoCliente === "USUARIO").map((d, indice) => {
    const ficha: FichaUsuario = {
      codigo: d.codigo, nombre: d.nombre, provincia: d.provincia, cuit: "",
      actividad: d.rubro, vendedor: vendedorDe(d.grupoVendedor).nombre, contacto: d.contacto,
      email: d.email, telefono: "", moneda: "USD", limiteCredito: 240_000 + indice * 30_000,
      condicionPago: "Cuenta corriente · 30 días fecha de factura",
      pedidos: [], cotizaciones: [], facturas: [], observaciones: [], cobranzas: {}, eventos: [], origen: "demo",
    };
    for (const anio of [anioActual - 1, anioActual]) {
      for (let mes = 1; mes <= 12; mes += 1) {
        const dia = fecha(anio, mes, 3);
        if (dia > hoy) continue;
        const id = `${anio}-${String(mes).padStart(2, "0")}`;
        const articulos = productos(mes + indice * 3 + (anio === anioActual ? 4 : 0));
        const pedido = {
          id, numero: `PED-${d.codigo}-${id}`, fecha: dia, ordenCompra: `OC-${anio}-${mes * 113 + indice}`,
          estado: "ENTREGADO" as const, entregaEstimada: sumarDias(dia, 4), productos: articulos,
        };
        ficha.pedidos.push(pedido);
        const importe = totalProductos(articulos);
        const antiguedad = (anioActual - anio) * 12 + mesActual - mes;
        const saldo = antiguedad < 3 && (indice + mes) % 3 !== 0 ? redondear(importe * (antiguedad === 2 ? 0.5 : 1)) : 0;
        ficha.facturas.push({ id: `fac-${id}`, numero: `A-0003-${anio}${String(mes).padStart(2, "0")}${indice}0`, fecha: dia, vencimiento: sumarDias(dia, 30), pedidoId: id, importe, saldo });
      }
    }
    ficha.pedidos.push({ id: "pedido-en-curso", numero: `PED-${d.codigo}-EN-CURSO`, fecha: fecha(anioActual, mesActual, 1), ordenCompra: `OC-${anioActual}-NUEVA-${indice}`, estado: indice % 2 ? "DESPACHADO" : "EN_PREPARACION", entregaEstimada: sumarDias(hoy, 5), productos: productos(indice + 6) });
    ficha.cotizaciones = [
      { id: "cot-ganada", numero: `COT-${d.codigo}-101`, fecha: sumarDias(hoy, -65), validez: sumarDias(hoy, -35), estado: "GANADA", motivoNoGanada: "", productos: productos(indice + 1) },
      { id: "cot-no-ganada", numero: `COT-${d.codigo}-102`, fecha: sumarDias(hoy, -40), validez: sumarDias(hoy, -10), estado: "NO_GANADA", motivoNoGanada: "El cliente indicó que eligió otra propuesta por precio y plazo de entrega.", productos: productos(indice + 2) },
      { id: "cot-negociacion", numero: `COT-${d.codigo}-103`, fecha: sumarDias(hoy, -10), validez: sumarDias(hoy, 20), estado: "EN_NEGOCIACION", motivoNoGanada: "", productos: productos(indice + 3) },
      { id: "cot-pendiente", numero: `COT-${d.codigo}-104`, fecha: sumarDias(hoy, -3), validez: sumarDias(hoy, 27), estado: "PENDIENTE", motivoNoGanada: "", productos: productos(indice + 4) },
      { id: "cot-vencida", numero: `COT-${d.codigo}-105`, fecha: sumarDias(hoy, -50), validez: sumarDias(hoy, -20), estado: "VENCIDA", motivoNoGanada: "", productos: productos(indice + 5) },
    ];
    ficha.observaciones = [{
      id: `observacion-demo-${d.codigo}`, fecha: `${sumarDias(hoy, -4)}T15:00:00Z`, autor: "Ejemplo · Equipo comercial",
      relacion: indice === 2 ? "EN_RIESGO" : indice === 1 ? "REGULAR" : "BUENA",
      texto: indice === 2 ? "Compras manifestó disconformidad con los plazos de entrega. Retomar contacto y acordar una alternativa antes de la próxima compra." : indice === 1 ? "El contacto está comparando proveedores. Solicita revisar las condiciones de la próxima cotización." : "Contacto fluido con Compras y buena respuesta a las propuestas. Relevar nuevas necesidades del área de Seguridad e Higiene.",
      proximoContacto: sumarDias(hoy, indice === 2 ? -1 : indice),
      proximaAccion: indice === 2 ? "Llamar a Compras y confirmar el plan de entregas" : "Consultar necesidades de reposición y seguir la cotización abierta",
    }];
    const vencida = [...ficha.facturas].reverse().find((f) => f.saldo > 0 && f.vencimiento < hoy);
    if (vencida) ficha.cobranzas[vencida.id] = [{ id: `cobranza-demo-${d.codigo}`, fecha: `${sumarDias(hoy, -2)}T15:00:00Z`, autor: "Ejemplo · Administración", comentario: "Administración del cliente informó que el comprobante está en su circuito de aprobación.", fechaPrometida: sumarDias(hoy, indice === 2 ? -1 : 3) }];
    return ficha;
  });
}
