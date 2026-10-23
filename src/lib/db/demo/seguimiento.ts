import "server-only";
import type { RepositorioSeguimiento } from "@/lib/db/repositorio";
import { huella } from "@/lib/seguimiento/huella";
import type { CambiosConsulta, Consulta } from "@/types/seguimiento";

/**
 * Seguimiento en memoria con las consultas reales de la planilla
 * "CONSULTA SERVICIO CLIENTE - 2026" (1 y 2 de octubre). Igual que las
 * solicitudes demo, los cambios viven mientras el servidor este levantado.
 */

/** [dia de octubre, encargado, cliente, lista, clasif., grupo vendedor, estado, grupo WhatsApp, consulta, hito, respondida, observaciones] */
type Fila = [number, string, string, string, string, string, string, string, string, string, boolean, string?];

const FILAS: Fila[] = [
  [1, "bot", "5615 - BALLERGA FLORENCIA", "D01W", "C", "FILTRO GRUPO GERENCIA", "OK", "DP-VT BALLERGA FLOR. ELI", "Cliente detalla pago: e-cHEQ 11073563 cancela Fc Agosto (traspapelada); Cheque 11073567 es a cuenta de futuras compras.", "Informa pago", true],
  [1, "bot", "8255 - BLUMZAK CLAUDIO DANIEL", "D01W", "C", "FILTRO GRUPO LITORAL", "OK", "DP-VT BLUMZAK CLAUDIO DANIEL - GOF", "Cliente envía 2 comprobantes de pago (comprobante70066374011261001.pdf y comprobante70066374015261001.pdf) para acreditar a su cuenta.", "Informa pago", true],
  [1, "bot", "1319 - SEYCO S.A.C.I.F", "D05W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP- VT A SEYCO--ELI", "Cliente confirma cargar directo el pedido de 14 pares guante (sustituto cod. descontinuado 313135), sin modificar la OC.", "Pedido nuevo", true],
  [1, "bot", "6994 - CR WORK CLOTHES AND INDUSTRIAL", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP - VT A DS CR WORK -ELI", "Faltante: OC 2464, pidieron 9600 guantes moteados G7 y facturaron solo 2400, pregunta novedades del faltante físico. Además adjunta nueva OC (Orden 0001-00002563-DPS01-10.pdf).", "Reclamo", true],
  [1, "bot", "329 - CASA GABARDINI S.A.", "D01W", "", "FILTRO GRUPO LITORAL", "OK", "DPS - VT CASA GABARDINI SA - LITORAL", "Cliente confirma pedido ingresado y pide despachar (\"OK POR FAVOR DESPACHAR\").", "Estado de pedido", true],
  [1, "bot", "3171 - AFP SERVICE S.A.", "D03W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT AFP SERVICE-ELI", "Cliente envía orden de compra N°12738 (Ord. Cmp. 00000-00012738.pdf) para procesar.", "Pedido nuevo", true],
  [1, "bot", "2663 - LOPEZ ANIBAL RODOLFO", "D01W", "C", "FILTRO GRUPO GERENCIA", "OK", "DP-VT LOPEZ ANIBAL-JONY", "Cliente consulta por ítems pendientes de cotización 3011: 24 Gte. Latex Uso Industrial Negro Talle XL, 24 E. Anteojo Negro K. Patilla recta regulable, y 'doce de estos' (otro ítem con foto).", "Estado de pedido", true],
  [1, "bot", "3844 - MENDIETA NICOLAS BERNARDO", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "TIENE DEUDA", "DP-VT A DS MENDIETA NICOLAS- LITORAL-ELI", "Cliente pregunta si la semana que viene llega el camión a Aguagleguay.", "Consulta General", false],
  [1, "bot", "234 - SEGUTECNICA S.R.L.", "D234", "A", "FILTRO GRUPO GERENCIA+A", "NO RESPONDER", "DP-VT A DS -Segutecnica-ELI", "Cliente necesita guante anticorte talle 11 (120 pares pendientes); vendedor ofreció talle 10, cliente pregunta demora de talle 11.", "Consulta de stock", true],
  [1, "bot", "8548 - GARCIA LEANDRO", "D01W", "C", "FILTRO GRUPO GERENCIA", "OK", "DP-VT-LEANDRO GARCIA--ELI", "Cliente responde con audio (0:04) sin escuchar, tras recordatorio de pago/retiro en Defensa 2391, Aldo Bonzi.", "Consulta General", true],
  [1, "bot", "3323 - INDUSTRIAL TAYLOR S.A.", "D05W", "B", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DS - TAYLOR -ELI", "Cliente envía pedido por foto (\"Les paso un pedido!\").", "Pedido nuevo", true],
  [1, "bot", "1711 - GIOVANARDI CARINA ANDREA", "D01W", "C", "FILTRO GRUPO GERENCIA", "OK", "DP-VT GIOVANARDI-ELI-", "Cliente pide despacho urgente: 40 cascos amarillos con arnés, 48 anteojos bandido negro, 36 anteojo negro otro modelo (no 021E), 20 chaleco vial amarillo liviano, y guante anticorte talle 10.", "Pedido nuevo", true],
  [1, "bot", "383 - GAMA S.R.L.", "D03W", "C", "FILTRO GRUPO EPP - CORDOBA", "OK", "DP-VT A DS - GAMA- CBA", "Falla en producto.", "Reclamo", true],
  [1, "bot", "787 - D´ANUNZIO ARGENTINA S.R.L.", "D05W", "B", "FILTRO GRUPO LITORAL", "OK", "DP-VT A DS D'ANUNZIO - LITORAL-ELI", "Cliente informa fecha de cheque (15/10) para pago ~$17.500; coordinar retiro (camión/personal/correo).", "Informa pago", true],
  [1, "bot", "8257 - MEDIK S SRL", "D01W", "C", "FILTRO GRUPO VENTAS - SANIDAD", "OK", "Depascale DP-VT MEDIK S SRL - SANIDAD", "Cliente pide cotización: chalecos gardina naranja (varios talles/cant), camisas de grafa mangas largas (varios talles/cant), y fajas worker varios tamaños. Sin respuesta aún.", "Consulta precio", true],
  [1, "bot", "6127 - ALBANESE DANIEL ALEJANDRO", "D05W", "A", "FILTRO GRUPO LITORAL", "OK", "DP-VT A DS Albanese Daniel-LITORAL-ELI", "Cliente (Santiago) pide que Elizabeth le escriba por privado para consultar sobre una posible venta.", "Consulta General", true],
  [1, "bot", "6515 - D-K KOMUR", "D01W", "C", "FILTRO GRUPO GERENCIA", "OK", "DP - VT D-K KOMUR - ELI", "Cliente solicita presupuesto por guantes moteados, 240 pares.", "Consulta precio", true],
  [1, "bot", "3643 - MASEFER S.R.L", "D05W", "A", "FILTRO GRUPO EPP - CORDOBA", "OK", "DP-VT A DS -GF MASEFER-CBA-ELI", "Cliente reclama que no enviaron las balizas; sin respuesta (\"??\").", "Reclamo", true],
  [1, "bot", "1494 - 4 MDQ STORE S.R.L.", "D05W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A -4MDQ -ROCCO", "Cliente pregunta si llega a tiempo de agregar algo al pedido (OC 6379) para que salga todo junto.", "Pedido nuevo", true],
  [1, "bot", "2316 - PRODUCTORA INDUSTRIAL Y ABRASIVOS CONITEC SRL", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A - ABRASIVOS CONITEC -ELI", "Pedido grande: 60 Cono UCU0002PV, 48 baliza UCU0002PV, 400 cadena UCU0100PV, 20 casco UCUKIT1510PC, 2304 anteojo UCU021E, 432 anteojo UCU022E, 2 DPT4000100611, 100 DPS7209.", "Pedido nuevo", true],
  [1, "bot", "4716 - SANDRI E HIJOS SEGURIDAD INDUSTRIAL SRL", "D03W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DS -SANDRI E HIJOS -ELI", "Cliente envía nueva orden de compra OC 419 DPS.pdf.", "Pedido nuevo", true],
  [1, "bot", "1877 - BULONERIA BELGRANO", "D05W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "VT-DP GRUPO BELGRANO-JONY-ELI", "Quiere saber el estado de su pedido.", "Estado de Cuenta", false],
  [1, "bot", "1494 - 4 MDQ STORE S.R.L.", "D05W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A -4MDQ -ROCCO", "Envió OC.", "Pedido nuevo", true],
  [1, "bot", "335 - PROVEEDORA INDUSTRIAL S.R.L.", "D01W", "", "FILTRO GRUPO GERENCIA", "OK", "DP-VT PROVEEDORA IND- JONY", "Enviaron fotos de productos que llegaron mal.", "Reclamo", true],
  [1, "bot", "241 - PROV-IND S.R.L.", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DS - PROVIND-ELI", "Consultan por cadena roja y blanca.", "Consulta de stock", true],
  [1, "bot", "5594 - PARROT S.A.S.", "D03W", "C", "FILTRO GRUPO VENDEDOR NOA", "OK", "DP- VT PARROT SAS - NOA", "Solicita recibo y movimientos de su cuenta para acomodar su deuda.", "Enviar Factura", true],
  [1, "bot", "6588 - SANTIAGO RICARDO GAIDO", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP- VT A DS SANTIAGO GAIDO - CBA - ELI. Dps", "Cliente pide que no envíen el pedido al precio de \"segunda\" y que le pasen la nota de crédito urgente antes de que la cuenta se exceda del límite; Lucas Ventas le dijo que la NC sale en los próximos días.", "Estado de Cuenta", true],
  [1, "bot", "3719 - LAURENZANO HNOS", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DF LAURENZANO HNOS. -ELI", "Cliente confirma el pedido de conos (conitos) y pide que se lo envíen por camión; también había consultado disponibilidad de unos guantes.", "Estado de pedido", true],
  [1, "bot", "4873 - SERVEFER SRL", "D01W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DF - SERVEFER SRL - ELI- JONY", "Cliente (Diego) pide cotización y especificación técnica del guantín que va debajo del guante dieléctrico, versión común e ignífuga, para un cliente suyo.", "Consulta precio", true],
  [1, "bot", "2924 - DEBORA ALICIA LACUNZA", "D05W", "B", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DS -Lacunza-Eli", "Pedido nuevo urgente: Enrique (Sergio Vanela) pide 2400 pares de guantes cod 85803E, talle 8, para su cliente Sergio.", "Pedido nuevo", true],
  [1, "Gonza", "225 - DISTRIBUIDORA RIO S.R.L.(1215)", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DS -Distribuid.Río-ELI", "No cambiar el talle.", "Consulta General", true],
  [1, "Gonza", "365 - BERGALLO Y PASTRONE S.A.", "D05W", "C", "FILTRO GRUPO EPP - CORDOBA", "OK", "DP-VT A DF BERGALLO Y PAST- CBA", "Envió unos productos para cotizar.", "Pedido nuevo", true],
  [2, "bot", "4873 - SERVEFER SRL", "D01W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DF - SERVEFER SRL - ELI- JONY", "Cliente (Diego) pide el certificado del guantín que va abajo del guante dieléctrico y consulta si es ignífugo.", "Consulta Tecnica", false],
  [2, "bot", "2924 - DEBORA ALICIA LACUNZA", "D05W", "B", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DS -Lacunza-Eli", "Cliente (Enrique, de Sergio Vanela) consulta si hay aunque sea un parcial de guantes cod 85803E talle 8.", "Consulta de stock", true],
  [2, "bot", "5594 - PARROT S.A.S.", "D03W", "C", "FILTRO GRUPO VENDEDOR NOA", "OK", "DP- VT PARROT SAS - NOA", "Cliente informa que los cheques rechazados no le aparecen devueltos (ninguno); indica que parece que hicieron mal el rechazo.", "Reclamo", true],
  [2, "bot", "1775 - VICENTIN GASTON DANIEL", "D05W", "C", "FILTRO GRUPO LITORAL", "OK", "DP-VT A DF - VICENTIN - LITORAL", "Cliente (Singlar Compras) pide lo que queda de lo programado, consulta cómo/cuándo pedir y si facturan mensualmente, y envía orden de compra adjunta.", "Pedido nuevo", true],
  [2, "bot", "3747 - BENEDETTI SAIC.", "D01W", "", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT BENEDETTI -JONY", "Cliente confirma que cargó los datos del pedido web y revisó las cantidades; aguarda que se le dé curso.", "Estado de pedido", false],
  [2, "bot", "1319 - SEYCO S.A.C.I.F", "D05W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP- VT A SEYCO--ELI", "Cliente SEYCO pregunta la demora de entrega del PCO de cola de amarre enviado por Lucas.", "Estado de pedido", true],
  [2, "bot", "5455 - VILARIÑO JORGE ALBERTO", "D03W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A VILARIÑO JORGE -ELI", "Jorge compró 4800 pares acrílico nitrilo verde (2400 retirados, 2400 a retirar el lunes); consulta si agregando 3000 pares más puede tener descuento adicional.", "Consulta precio", true],
  [2, "bot", "1671 - JUAN CARLOS NARCISI S.R.L", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A GS Narcisi-ELI", "Cliente envía comprobantes de pago (OP 1-66556.pdf y DE PASCALE 02-10-26.pdf) aplicables a saldo pendiente de $5.502,84 en Factura N°145934 y N°146593.", "Informa pago", false],
  [2, "bot", "2018 - OXITODO S.A.", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DF OXITODO - LITORAL-ELI", "Cliente avisa que ya pasó su pedido para el camión que sale entre el 5 y 12 de octubre y pide que no lo dejen afuera del envío.", "Estado de pedido", false],
  [2, "bot", "8727 - MORE CLEAN SRL", "D01W", "C", "FILTRO GRUPO EPP - BS AS", "OK", "DP- VT MORE CLEAN SRL- JONY De pascale", "Cliente confirma dar curso al pedido web recibido.", "Pedido nuevo", true],
  [2, "bot", "3719 - LAURENZANO HNOS", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DF LAURENZANO HNOS. -ELI", "Laurenzano deja pedido por CTA 1 para enviar por camión.", "Pedido nuevo", true],
  [2, "bot", "1020 - OXI - MERCEDES S.A.", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DS -Oximercedes-ELI", "Francisco envía OC con precios hablados con Eli.", "Pedido nuevo", true],
  [2, "bot", "3405 - OXICAS S.R.L.", "D05W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP - VT A DS - OXICAS -ELI-", "María Luz Poggi pide adelantar 2400 pares de moteados del programado, con urgencia; pregunta si se puede despachar el lunes.", "Estado de pedido", true],
  [2, "bot", "1182 - FORTIN REPUBLICA S.A.", "D05W", "A", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A DS -FORTIN-ELI", "Dylan de Fortín pregunta si habrá modificaciones en la lista de precios de este mes.", "Lista de precios", true],
  [2, "bot", "5455 - VILARIÑO JORGE ALBERTO", "D03W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "DP-VT A VILARIÑO JORGE -ELI", "Hace una consulta: si agregando cantidad al pedido ya realizado, tiene descuento.", "Consulta General", true],
  [2, "bot", "8755 - JFS TECNOTOOLS SRL", "D03W", "C", "FILTRO GRUPO GERENCIA+A", "OK", "Delta Roel - JFS TECNOTOOLS-ELI-", "Pidieron arnés DPA00002 - 5 unidades | cabo de vida DPA000103 - 4 | cabo de vida DPA003100 - 4.", "Pedido nuevo", true],
  [2, "bot", "6088 - SANCHEZ MEDINA GABRIEL DARIO", "D02EPP", "C", "FILTRO GRUPO IDP - MZA - cuyo", "OK", "EPP-VT SANCHEZ MEDINA (TECSAN) - MZA", "Quiere cotizar.", "Pedido nuevo", false, "Lo ve Exe"],
];

/** Las consultas de ejemplo (tambien las usa la semilla de Postgres). */
export function consultasDemo(): Consulta[] {
  return FILAS.map(
    ([dia, encargado, cliente, listaPrecio, clasificacion, grupoVendedor, estadoCuenta, grupoWhatsapp, consulta, hito, respondida, observaciones = ""], orden) => ({
      // El orden entra en la huella: hay clientes con dos consultas el mismo dia.
      id: huella(`${cliente}|${consulta}|${orden}`),
      // Hora de Argentina (UTC-3), escalonada para que el orden de carga se respete.
      fecha: new Date(Date.UTC(2026, 9, dia, 12 + Math.floor(orden / 6), (orden * 7) % 60)),
      encargado,
      cliente,
      listaPrecio,
      clasificacion,
      grupoVendedor,
      estadoCuenta,
      grupoWhatsapp,
      linkWhatsapp: "",
      consulta,
      hito,
      respondida,
      dias: null,
      observaciones,
      tentativoRespuesta: "",
    }),
  );
}

const almacen = globalThis as typeof globalThis & { __demoSeguimiento2026?: Consulta[] };

function todas(): Consulta[] {
  almacen.__demoSeguimiento2026 ??= consultasDemo();
  return almacen.__demoSeguimiento2026;
}

export async function getAll(): Promise<Consulta[]> {
  return todas().map((consulta) => ({ ...consulta }));
}

export async function getById(id: string): Promise<Consulta | null> {
  const consulta = todas().find((item) => item.id === id);
  return consulta ? { ...consulta } : null;
}

export async function update(id: string, cambios: CambiosConsulta): Promise<Consulta> {
  const consulta = todas().find((item) => item.id === id);
  if (!consulta) {
    throw new Error(`No existe la consulta ${id}`);
  }
  Object.assign(consulta, cambios);
  return { ...consulta };
}

const repositorio: RepositorioSeguimiento = { getAll, getById, update };

export default repositorio;
