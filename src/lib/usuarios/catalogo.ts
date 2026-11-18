import type { ItemUsuario } from "@/types/usuarios";

/** Catalogo de productos para cargar pedidos y cotizaciones (precios de lista en USD). */
export const CATALOGO_USUARIOS: readonly Omit<ItemUsuario, "cantidad">[] = [
  { sku: "172226X", descripcion: "Guante americano de vaqueta con refuerzo antiimpacto", linea: "DPS", precioUnitario: 11.6 },
  { sku: "DPS11255X", descripcion: "Guante de nitrilo con protección TPR", linea: "DPS", precioUnitario: 9.1 },
  { sku: "122225X", descripcion: "Guante de vaqueta puño corto", linea: "DPS", precioUnitario: 8.4 },
  { sku: "DPS11855X", descripcion: "Guante de nitrilo medio baño", linea: "DPS", precioUnitario: 7.3 },
  { sku: "222025X", descripcion: "Guante Lincoln reforzado", linea: "DP", precioUnitario: 6.2 },
  { sku: "322125", descripcion: "Guante de descarne largo", linea: "DP", precioUnitario: 5.1 },
  { sku: "221024X", descripcion: "Guante de protección mecánica", linea: "DP", precioUnitario: 4.7 },
  { sku: "DPT300075605", descripcion: "Eslinga de 3 toneladas, 3 metros", linea: "NUBUS", precioUnitario: 26.3 },
  { sku: "DPT200060605", descripcion: "Eslinga de 2 toneladas, 3 metros", linea: "NUBUS", precioUnitario: 18.1 },
  { sku: "DPT100030605", descripcion: "Eslinga de 1 tonelada, 3 metros", linea: "NUBUS", precioUnitario: 13.2 },
];

export function productoDelCatalogo(sku: string): Omit<ItemUsuario, "cantidad"> | null {
  return CATALOGO_USUARIOS.find((producto) => producto.sku === sku) ?? null;
}
