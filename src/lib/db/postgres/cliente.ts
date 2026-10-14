import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Instancia singleton de PrismaClient, creada de forma perezosa.
 *
 * Es perezosa a proposito: mientras `DB_BACKEND` sea "sheets" este modulo se
 * puede importar sin tener un Postgres configurado, y nadie paga el costo de
 * abrir un pool que no se va a usar.
 *
 * El cache global existe porque en dev Next recarga los modulos en cada
 * cambio: sin el se abririan decenas de pools contra la base.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function prisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Falta DATABASE_URL. Con DB_BACKEND="postgres" hace falta una base Postgres configurada.',
    );
  }

  globalForPrisma.prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globalForPrisma.prisma;
}
