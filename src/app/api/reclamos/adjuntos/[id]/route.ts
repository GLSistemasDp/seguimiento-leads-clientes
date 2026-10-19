import { getAdjunto } from "@/lib/db/reclamos";

export const runtime = "nodejs";

/** GET /api/reclamos/adjuntos/:id — abre un adjunto del formulario (PDF o imagen). */
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
