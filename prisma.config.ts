import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Configuracion del CLI de Prisma (migrate, db push, studio).
 * Desde Prisma 7 la URL de conexion vive aca y no en schema.prisma.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // Generar el cliente no requiere una base; las migraciones si necesitan la URL.
    url: process.env.DATABASE_URL,
  },
});
