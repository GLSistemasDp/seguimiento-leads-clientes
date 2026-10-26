import "server-only";
import type { FilaSheet } from "@/lib/db/sheets/cliente";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { FichaCliente } from "@/types/seguimiento";

/**
 * Las otras pestanas de la planilla de seguimiento, que el equipo usa como
 * informacion de consulta: "Desplegable" y "MaestroCliente" (datos del
 * cliente) y "Rtas RÁPIDAS" / "Rtas RECLAMO" (respuestas tipo). Igual que la
 * hoja de seguimiento, las columnas se ubican por su encabezado.
 */

type Alias = Record<string, readonly string[]>;

function clave(encabezado: string): string {
  return normalizarEncabezado(encabezado).replace(/\s+/g, " ");
}

/** Busca la fila de encabezados (la primera que tenga `obligatorio`) y ubica cada campo. */
function tabla<A extends Alias>(
  filas: FilaSheet[],
  alias: A,
  obligatorio: keyof A,
): { datos: FilaSheet[]; celda: (fila: FilaSheet, campo: keyof A) => string } | null {
  for (let indice = 0; indice < Math.min(filas.length, 10); indice += 1) {
    const claves = filas[indice].map(clave);
    const columnas: Partial<Record<keyof A, number>> = {};
    for (const campo of Object.keys(alias) as (keyof A)[]) {
      const posicion = claves.findIndex((texto) => alias[campo].includes(texto));
      if (posicion !== -1) columnas[campo] = posicion;
    }
    if (columnas[obligatorio] === undefined) continue;

    return {
      datos: filas.slice(indice + 1),
      celda: (fila, campo) => {
        const posicion = columnas[campo];
        return posicion === undefined ? "" : (fila[posicion] ?? "").trim();
      },
    };
  }
  return null;
}

/** "1877 - BULONERIA BELGRANO" -> "1877"; sin codigo, el nombre normalizado. */
export function claveCliente(cliente: string): string {
  const codigo = cliente.match(/^\s*(\d+)\s*-/);
  return codigo ? codigo[1] : normalizarEncabezado(cliente);
}

/** Valores que la planilla usa como "vacio". */
function limpio(valor: string): string {
  return ["null", "#n/a", "-", "—"].includes(valor.toLowerCase()) ? "" : valor;
}

// --- Fichas de clientes ----------------------------------------------------

const ALIAS_DESPLEGABLE = {
  cliente: ["cliente", "grupo cliente"],
  listaPrecio: ["listaprecio", "lista de precio", "lista precio"],
  clasificacion: ["cla vta", "clasificacion venta", "clasificacion"],
  grupoVendedor: ["grupo vendedor"],
  // En la planilla actual los encabezados estan corridos: el grupo vendedor
  // quedo bajo "Limite de credito disponible" y "Grupo Vendedor" esta vacia.
  limiteDisponible: ["limite de credito disponible"],
  grupoWhatsapp: ["grupo whatsapp"],
  grupoWhatsapp2: ["grp wsp 2", "grupo whatsapp 2"],
  linkWhatsapp: ["link grupo whatsapp", "link grupo", "link whatsapp", "link wsp"],
  situacion: ["situacion del cliente", "situacion"],
  observacion: ["observacion", "observaciones"],
} as const;

const ALIAS_MAESTRO = {
  cliente: ["cliente"],
  actividad: ["actividad"],
  categoria: ["catergoria act", "categoria act", "categoria actividad", "categoria"],
  condicionPago: ["cond de pago", "condicion de pago"],
  limiteCredito: ["limite de credito"],
  deuda: ["deuda"],
  cuit: ["cuit", "c.u.i.t.", "nro cuit", "cuit cliente"],
} as const;

function fichaVacia(cliente: string): FichaCliente {
  const partes = cliente.match(/^\s*(\d+)\s*-\s*(.+)$/);
  return {
    codigo: partes ? partes[1] : "",
    nombre: partes ? partes[2].trim() : cliente.trim(),
    listaPrecio: "",
    clasificacion: "",
    grupoVendedor: "",
    grupoWhatsapp: "",
    grupoWhatsapp2: "",
    linkWhatsapp: "",
    situacion: "",
    observacion: "",
    actividad: "",
    categoria: "",
    condicionPago: "",
    limiteCredito: "",
    deuda: "",
  };
}

/** Une Desplegable y MaestroCliente por codigo de cliente. */
export function armarFichas(desplegable: FilaSheet[], maestro: FilaSheet[]): Map<string, FichaCliente> {
  const fichas = new Map<string, FichaCliente>();
  const ficha = (cliente: string): FichaCliente => {
    const id = claveCliente(cliente);
    let existente = fichas.get(id);
    if (!existente) {
      existente = fichaVacia(cliente);
      fichas.set(id, existente);
    }
    return existente;
  };
  /** Ante codigos repetidos se queda el primer dato no vacio. */
  const completar = (destino: FichaCliente, campo: keyof FichaCliente, valor: string) => {
    if (!destino[campo] && valor) destino[campo] = valor;
  };

  const hojaDesplegable = tabla(desplegable, ALIAS_DESPLEGABLE, "cliente");
  if (hojaDesplegable) {
    const { datos, celda } = hojaDesplegable;
    for (const fila of datos) {
      const cliente = celda(fila, "cliente");
      if (!cliente) continue;
      const destino = ficha(cliente);
      const disponible = celda(fila, "limiteDisponible");
      completar(destino, "listaPrecio", limpio(celda(fila, "listaPrecio")));
      completar(destino, "clasificacion", limpio(celda(fila, "clasificacion")));
      completar(
        destino,
        "grupoVendedor",
        limpio(celda(fila, "grupoVendedor")) || (/^[\d.,\s$]*$/.test(disponible) ? "" : limpio(disponible)),
      );
      completar(destino, "grupoWhatsapp", limpio(celda(fila, "grupoWhatsapp")));
      completar(destino, "grupoWhatsapp2", limpio(celda(fila, "grupoWhatsapp2")));
      completar(destino, "linkWhatsapp", limpio(celda(fila, "linkWhatsapp")));
      completar(destino, "situacion", limpio(celda(fila, "situacion")));
      completar(destino, "observacion", limpio(celda(fila, "observacion")));
    }
  }

  const hojaMaestro = tabla(maestro, ALIAS_MAESTRO, "cliente");
  if (hojaMaestro) {
    const { datos, celda } = hojaMaestro;
    for (const fila of datos) {
      const cliente = celda(fila, "cliente");
      if (!cliente) continue;
      const destino = ficha(cliente);
      completar(destino, "actividad", limpio(celda(fila, "actividad")));
      completar(destino, "categoria", limpio(celda(fila, "categoria")));
      completar(destino, "condicionPago", limpio(celda(fila, "condicionPago")));
      completar(destino, "limiteCredito", limpio(celda(fila, "limiteCredito")));
      completar(destino, "deuda", limpio(celda(fila, "deuda")));
      completar(destino, "cuit", limpio(celda(fila, "cuit")));
    }
  }

  return fichas;
}

// --- Respuestas tipo -------------------------------------------------------

const ALIAS_RAPIDAS = {
  comando: ["comando", "comando /"],
  mensaje: ["mensaje"],
  hito: ["hito"],
  disparadores: ["palabras clave disparadores", "palabras clave"],
  cuando: ["cuando usarla"],
} as const;

const ALIAS_RECLAMO = {
  tipoQueja: ["tipo de queja"],
  mensaje: ["respuesta sugerida copypaste", "respuesta sugerida"],
  accionInterna: ["accion interna requerida", "accion interna"],
  hito: ["hito"],
  comando: ["comando", "comando /"],
  disparadores: ["palabras clave disparadores", "palabras clave"],
  cuando: ["contexto ejemplo real", "contexto"],
} as const;

/** "precio, cotización" -> ["precio", "cotización"]. */
function frases(texto: string): string[] {
  return texto
    .split(/[,;\n]/)
    .map((frase) => frase.replace(/["“”]/g, "").trim())
    .filter((frase) => frase.length > 1);
}

/** Respuestas rapidas y de reclamo de la planilla, en ese orden. */
export function armarCatalogo(rapidas: FilaSheet[], reclamos: FilaSheet[]): RespuestaTipo[] {
  const catalogo: RespuestaTipo[] = [];

  const hojaRapidas = tabla(rapidas, ALIAS_RAPIDAS, "mensaje");
  if (hojaRapidas) {
    const { datos, celda } = hojaRapidas;
    for (const fila of datos) {
      const mensaje = celda(fila, "mensaje");
      const comando = celda(fila, "comando");
      if (!mensaje || !comando) continue;
      catalogo.push({
        comando,
        hito: celda(fila, "hito"),
        mensaje,
        disparadores: frases(celda(fila, "disparadores")),
        cuando: limpio(celda(fila, "cuando")) || undefined,
      });
    }
  }

  const hojaReclamos = tabla(reclamos, ALIAS_RECLAMO, "mensaje");
  if (hojaReclamos) {
    const { datos, celda } = hojaReclamos;
    for (const fila of datos) {
      const mensaje = celda(fila, "mensaje");
      const tipoQueja = celda(fila, "tipoQueja");
      if (!mensaje) continue;
      catalogo.push({
        comando: celda(fila, "comando") || tipoQueja || "Reclamo",
        hito: celda(fila, "hito"),
        mensaje,
        disparadores: frases(celda(fila, "disparadores")),
        tipoQueja: tipoQueja || undefined,
        cuando: limpio(celda(fila, "cuando")) || undefined,
        accionInterna: limpio(celda(fila, "accionInterna")) || undefined,
      });
    }
  }

  return catalogo;
}
