/**
 * Herramientas de prueba y demo ("Simular historial" en el perfil del
 * cliente, "Simular bot" en el Seguimiento). No se ven en produccion: solo
 * con `next dev` o si HERRAMIENTAS_PRUEBA="1" (por ejemplo en un deploy de
 * preview para probar).
 */
export function herramientasDePrueba(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.HERRAMIENTAS_PRUEBA === "1";
}
