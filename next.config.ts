import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.123.77"],
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
};

export default nextConfig;
