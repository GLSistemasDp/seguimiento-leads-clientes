import "server-only";
import { cache } from "react";
import { leer, modificar } from "@/lib/db/local/almacen";
import { hoyArgentina } from "@/lib/usuarios/analisis";
import { clientesUsuariosDemo } from "@/lib/usuarios/demo";
import { aplicarGestion, gestionVacia, registrarGestionUsuario } from "@/lib/usuarios/gestion";
import type { CambioUsuario, FichaUsuario, GestionUsuario } from "@/types/usuarios";

/**
 * Acceso a los datos de las cuentas clave.
 *
 * - La fuente comercial (clientes, pedidos, facturas, pagos historicos) es de
 *   ejemplo: `fuenteComercial()` es lo unico que cambia al conectar el ERP o
 *   las tablas de db/propuestas/cuentas-clave.sql.
 * - Lo que se carga desde el CRM (partes, pagos, pedidos, cotizaciones) va al
 *   almacen existente: Postgres si esta configurado, archivos en desarrollo.
 *   La coleccion lleva "demo" para no mezclar pruebas con cuentas reales.
 */
const COLECCION = "usuarios-cuentas-demo-v2";
const fuenteComercial = () => clientesUsuariosDemo();

export const getUsuarios = cache(async (): Promise<FichaUsuario[]> => {
  const gestiones = await leer<GestionUsuario>(COLECCION);
  return fuenteComercial().map((ficha) => aplicarGestion(ficha, { ...gestionVacia(), ...gestiones[ficha.codigo] }));
});

export async function getUsuario(codigo: string): Promise<FichaUsuario | null> {
  return (await getUsuarios()).find((ficha) => ficha.codigo === codigo) ?? null;
}

/** Registra una gestion y devuelve la ficha actualizada (null si la cuenta no existe). */
export async function guardarGestionUsuario(codigo: string, cambio: CambioUsuario, autor: string): Promise<FichaUsuario | null> {
  const base = fuenteComercial().find((ficha) => ficha.codigo === codigo);
  if (!base) return null;
  return modificar<GestionUsuario, FichaUsuario>(COLECCION, (datos) => {
    const actual = { ...gestionVacia(), ...datos[codigo] };
    const gestion = registrarGestionUsuario(base, actual, cambio, autor, new Date().toISOString(), crypto.randomUUID(), hoyArgentina());
    datos[codigo] = gestion;
    return aplicarGestion(base, gestion);
  });
}
