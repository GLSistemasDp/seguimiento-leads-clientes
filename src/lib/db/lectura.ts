import "server-only";

type Lectura<T> = { datos: T; error: false } | { datos: null; error: true };

/** Conserva el detalle en el servidor; la pantalla recibe solo el estado de la fuente. */
export async function leerDatos<T>(fuente: string, cargar: () => Promise<T>): Promise<Lectura<T>> {
  try {
    return { datos: await cargar(), error: false };
  } catch (error) {
    console.error(`[lectura:${fuente}]`, error);
    return { datos: null, error: true };
  }
}
