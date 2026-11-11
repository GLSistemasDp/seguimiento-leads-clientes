import "server-only";
import { cache } from "react";
import { leer, modificar } from "@/lib/db/local/almacen";
import { clientesUsuariosDemo } from "@/lib/usuarios/demo";
import { aplicarGestion, gestionVacia, registrarGestionUsuario } from "@/lib/usuarios/gestion";
import type { CambioUsuario, FichaUsuario, GestionUsuario } from "@/types/usuarios";

// Fuente comercial reemplazable por el conector de ERP/BD al pasar a producción.
// Las gestiones de esta demostración quedan separadas de las futuras cuentas reales.
const COLECCION = "usuarios-gestiones-demo-v1";
const fuenteComercial = () => clientesUsuariosDemo();

export const getUsuarios = cache(async (): Promise<FichaUsuario[]> => {
  const gestiones = await leer<GestionUsuario>(COLECCION);
  return fuenteComercial().map((ficha) => aplicarGestion(ficha, gestiones[ficha.codigo] ?? gestionVacia()));
});

export async function getUsuario(codigo: string): Promise<FichaUsuario | null> {
  return (await getUsuarios()).find((ficha) => ficha.codigo === codigo) ?? null;
}

export async function guardarGestionUsuario(codigo: string, cambio: CambioUsuario, autor: string): Promise<FichaUsuario | null> {
  const base = fuenteComercial().find((ficha) => ficha.codigo === codigo);
  if (!base) return null;
  return modificar<GestionUsuario, FichaUsuario>(COLECCION, (datos) => {
    const gestion = registrarGestionUsuario(base, datos[codigo] ?? gestionVacia(), cambio, autor, new Date().toISOString(), crypto.randomUUID());
    datos[codigo] = gestion;
    return aplicarGestion(base, gestion);
  });
}
