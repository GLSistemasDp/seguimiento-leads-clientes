import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.123.77"],
  // db/schema.sql y db/migraciones se leen al conectarse a Postgres: tienen que viajar con las funciones.
  outputFileTracingIncludes: { "/**": ["./db/schema.sql", "./db/migraciones/*.sql"] },
  // Inicio y Tablero se unieron en Resumen; Importar y Plantillas pasaron a
  // ser parte de Solicitudes de alta. Los links viejos siguen funcionando.
  async redirects() {
    return [
      { source: "/inicio", destination: "/resumen", permanent: false },
      { source: "/tablero", destination: "/resumen", permanent: false },
      { source: "/importar", destination: "/solicitudes/importar", permanent: false },
      { source: "/plantillas", destination: "/solicitudes/plantillas", permanent: false },
    ];
  },
  // Los formularios que completan los clientes son HTML estatico (public/formularios).
  async rewrites() {
    return [
      { source: "/formularios/reclamo", destination: "/formularios/reclamo.html" },
      { source: "/formularios/alta", destination: "/formularios/alta.html" },
    ];
  },
};

export default nextConfig;
