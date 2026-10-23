import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient, QueryResultRow } from "pg";

/**
 * Conexion a Postgres compartida por todo el CRM (sin Prisma: el esquema usa
 * triggers, vistas y una vista materializada que se escriben en SQL).
 *
 * La primera vez que una instancia se conecta aplica `db/schema.sql` si la
 * base todavia no lo tiene (tabla `crm_migraciones`, con un lock para que dos
 * instancias no lo apliquen a la vez) y, con DB_SEMILLA="demo", carga los
 * datos de ejemplo.
 */

export function urlPostgres(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export function postgresConfigurado(): boolean {
  return Boolean(urlPostgres());
}

/** Version del esquema; si se cambia db/schema.sql en forma incompatible, se suma una migracion. */
const MIGRACIONES: readonly { version: number; nombre: string; archivo: string }[] = [
  { version: 1, nombre: "esquema inicial del CRM", archivo: "db/schema.sql" },
];

const global = globalThis as typeof globalThis & { crmPool?: Promise<Pool> };

async function migrar(pool: Pool): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('crm_migraciones'))");
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS crm_migraciones (
        version    int PRIMARY KEY,
        nombre     text NOT NULL,
        aplicada_en timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await cliente.query<{ version: number }>("SELECT version FROM crm_migraciones");
    const aplicadas = new Set(rows.map((fila) => fila.version));
    for (const migracion of MIGRACIONES) {
      if (aplicadas.has(migracion.version)) continue;
      await cliente.query(await readFile(path.join(process.cwd(), migracion.archivo), "utf8"));
      await cliente.query("INSERT INTO crm_migraciones (version, nombre) VALUES ($1, $2)", [migracion.version, migracion.nombre]);
      console.info(`[postgres] migracion ${migracion.version} aplicada: ${migracion.nombre}`);
    }
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
  if (process.env.DB_SEMILLA === "demo") {
    const { sembrarSiHaceFalta } = await import("@/lib/db/postgres/semilla");
    await sembrarSiHaceFalta(pool);
  }
}

/** Pool unico por instancia, con el esquema ya aplicado. */
export function pool(): Promise<Pool> {
  if (!postgresConfigurado()) {
    return Promise.reject(new Error("Falta DATABASE_URL (o POSTGRES_URL): no hay base Postgres configurada en este entorno."));
  }
  global.crmPool ??= (async () => {
    const { Pool: PoolPg, types } = await import("pg");
    // `date` como texto AAAA-MM-DD (sin pasar por la zona horaria del servidor).
    types.setTypeParser(1082, (valor: string) => valor);
    const nuevo = new PoolPg({ connectionString: urlPostgres(), max: 5 });
    await migrar(nuevo);
    return nuevo;
  })().catch((error: unknown) => {
    global.crmPool = undefined;
    console.error(`[postgres] no se pudo preparar la base: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  });
  return global.crmPool;
}

export async function consultar<T extends QueryResultRow>(sql: string, valores: readonly unknown[] = []): Promise<T[]> {
  const { rows } = await (await pool()).query<T>(sql, valores as unknown[]);
  return rows;
}

/** Corre `trabajo` en una transaccion (rollback si lanza). */
export async function transaccion<R>(trabajo: (cliente: PoolClient) => Promise<R>): Promise<R> {
  const cliente = await (await pool()).connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await trabajo(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}

/** Refresca la vista materializada de evolucion mensual (sin bloquear lecturas). */
export async function refrescarEvolucion(): Promise<void> {
  await consultar("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reclamos_evolucion_mensual");
}
