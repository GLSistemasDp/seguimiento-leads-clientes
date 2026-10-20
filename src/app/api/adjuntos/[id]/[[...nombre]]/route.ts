import { getAdjunto } from "@/lib/db/adjuntos";

export const runtime = "nodejs";

/**
 * GET /api/adjuntos/:id/:nombre — abre un archivo enviado por un cliente.
 * Es de la intranet: el proxy lo protege igual que el resto del panel.
 */
export const GET = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const adjunto = await getAdjunto(id);
  if (!adjunto) return new Response("Adjunto no encontrado", { status: 404 });
  return new Response(new Uint8Array(adjunto.datos), {
    headers: {
      "Content-Type": adjunto.tipo,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(adjunto.nombre)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
};
