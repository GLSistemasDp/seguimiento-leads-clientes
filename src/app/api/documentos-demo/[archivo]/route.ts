import { backendActivo } from "@/lib/db/repositorio";
import { escapeHtml } from "@/lib/utils/html";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ archivo: string }> };

const TITULOS: Record<string, string> = {
  "constancia-afip": "Constancia de inscripción - ARCA (ex AFIP)",
  "constancia-iibb": "Constancia de Ingresos Brutos / CM05",
  estatuto: "Estatuto / Contrato social",
  "dni-firmante": "DNI del firmante",
  "referencias-comerciales": "Referencias comerciales",
};

/**
 * Documentos de ejemplo para el visor de altas en modo demo: en produccion los
 * adjuntos son los links de Drive que deja el formulario.
 */
export async function GET(request: Request, contexto: Contexto) {
  if (backendActivo() !== "demo") {
    return new Response("No encontrado", { status: 404 });
  }

  const { archivo } = await contexto.params;
  const empresa = new URL(request.url).searchParams.get("empresa") ?? "Empresa de ejemplo";
  const titulo = TITULOS[archivo] ?? "Documento adjunto";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title>
<style>
  body{margin:0;background:#e2e8f0;font-family:system-ui,sans-serif;color:#0f172a}
  .hoja{max-width:640px;margin:24px auto;background:#fff;padding:40px;box-shadow:0 2px 12px #0002}
  h1{font-size:18px;margin:0 0 4px} .sub{color:#64748b;font-size:13px;margin:0 0 24px}
  .fila{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:8px 0;font-size:14px}
  .marca{margin-top:32px;padding:10px;border:2px dashed #f59e0b;color:#b45309;font-size:12px;text-align:center}
</style></head>
<body><div class="hoja">
  <h1>${escapeHtml(titulo)}</h1>
  <p class="sub">${escapeHtml(empresa)}</p>
  <div class="fila"><span>Razón social</span><strong>${escapeHtml(empresa)}</strong></div>
  <div class="fila"><span>Fecha de emisión</span><strong>${new Date().toLocaleDateString("es-AR")}</strong></div>
  <div class="fila"><span>Estado</span><strong>Vigente</strong></div>
  <p class="marca">DOCUMENTO DE EJEMPLO — modo demo, sin valor legal</p>
</div></body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
