import { NextResponse } from "next/server";
import { reclamosEnPostgres } from "@/lib/db/reclamos";
import { backendActivo } from "@/lib/db/repositorio";
import { backendSeguimiento } from "@/lib/db/seguimiento";
import { consultar, postgresConfigurado } from "@/lib/db/postgres/pg";
import { sincronizacionConfigurada, ultimaSincronizacion } from "@/lib/sync/planilla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const definida = (nombre: string) => Boolean(process.env[nombre]?.trim());

/**
 * GET /api/salud — diagnostico del despliegue: que motor usa cada pantalla,
 * que variables estan definidas (nunca sus valores) y si la base responde,
 * con su version de esquema y la semilla. Queda dentro de la intranet.
 */
export const GET = async () => {
  const variables = Object.fromEntries(
    [
      "DATABASE_URL",
      "POSTGRES_URL",
      "DB_BACKEND",
      "SEGUIMIENTO_BACKEND",
      "RECLAMOS_BACKEND",
      "DB_SEMILLA",
      "BOT_TOKEN",
      "CRON_SECRET",
      "SEGUIMIENTO_SHEETS_ID",
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_PRIVATE_KEY",
      "SYNC_TOKEN",
      "ANTHROPIC_API_KEY",
      "TELEGRAM_BOT_TOKEN",
    ].map((nombre) => [nombre, definida(nombre)]),
  );
  const motores = {
    solicitudes: backendActivo(),
    seguimiento: backendSeguimiento(),
    seguimientoPedido: process.env.SEGUIMIENTO_BACKEND || null,
    reclamos: reclamosEnPostgres() ? "postgres" : "almacen",
  };

  let base: Record<string, unknown> = { configurada: postgresConfigurado() };
  if (postgresConfigurado()) {
    const inicio = Date.now();
    try {
      const [migraciones, conteos] = await Promise.all([
        consultar<{ version: number; nombre: string; aplicada_en: Date }>("SELECT * FROM crm_migraciones ORDER BY version"),
        consultar<{ consultas: string; interacciones: string; reclamos: string; clientes: string; semilla: boolean }>(
          `SELECT (SELECT count(*) FROM consultas_seguimiento) AS consultas,
                  (SELECT count(*) FROM chat_interacciones) AS interacciones,
                  (SELECT count(*) FROM reclamos) AS reclamos,
                  (SELECT count(*) FROM clientes) AS clientes,
                  EXISTS (SELECT 1 FROM almacen_registros WHERE coleccion = 'crm' AND clave = 'semilla-demo') AS semilla`,
        ),
      ]);
      base = { ...base, conecta: true, milisegundos: Date.now() - inicio, migraciones, ...conteos[0] };
    } catch (error) {
      base = { ...base, conecta: false, milisegundos: Date.now() - inicio, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const sincronizacion = {
    configurada: sincronizacionConfigurada(),
    acceso: process.env.SEGUIMIENTO_ACCESO === "publico" ? "link publico" : "cuenta de servicio",
    ultima: base.conecta ? await ultimaSincronizacion().catch(() => null) : null,
  };
  const ok = !postgresConfigurado() || base.conecta === true;
  return NextResponse.json({ ok, entorno: process.env.VERCEL_ENV ?? "local", motores, variables, base, sincronizacion }, { status: ok ? 200 : 500 });
};
