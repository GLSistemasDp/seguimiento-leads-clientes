import Link from "next/link";
import { notFound } from "next/navigation";
import { AccionReclamo } from "@/components/reclamos/AccionReclamo";
import { getFormulario } from "@/lib/db/reclamos";

export const metadata = { title: "Formulario de reclamo · CRM De Pascale" };
export const dynamic = "force-dynamic";
function Datos({ valores }: { valores: Record<string, string | null> }) {
  return <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(valores).map(([etiqueta, valor]) => <div key={etiqueta}><dt className="text-xs text-slate-500">{etiqueta}</dt><dd className="mt-1 break-words text-sm text-slate-900">{valor || "Sin informar"}</dd></div>)}</dl>;
}
const panel = "space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
export default async function ReclamoPage({ params }: { params: Promise<{ id: string }> }) {
  const r = await getFormulario((await params).id);
  if (!r) notFound();
  return <div className="space-y-5">
    <Link href="/reclamos" className="text-sm text-blue-700 hover:underline">← Volver a reclamos</Link>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-slate-500">Reclamo de cliente · FOR-03 Rev04 · Demo</p><h1 className="mt-1 text-2xl font-semibold">{r.id} · {r.razonSocial}</h1><p className="mt-2 text-sm text-slate-500">Fecha: {r.fecha.split("-").reverse().join("/")}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-800">{r.indicacion ? "Con acción indicada" : "Pendiente de definición"}</span></div>
    <section className={panel}><h2 className="font-semibold">Datos del cliente</h2><Datos valores={{ "Razón social": r.razonSocial, "N° de cliente": r.numeroCliente, Sucursal: r.sucursal, Transporte: r.transporte, "Nombre y apellido": r.contacto, Cargo: r.cargo, Teléfono: r.telefono, "E-mail": r.email }} /></section>
    <section className={panel}><h2 className="font-semibold">Comprobantes y referencias</h2><Datos valores={{ "N° de orden de compra del cliente": r.ordenCompra, "N° de pedido": r.pedido, "N° de factura": r.factura, "N° de remito": r.remito }} /><div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500"><p className="font-medium text-slate-700">Documentación adjunta</p><p className="mt-1">Sin archivos adjuntos en este ejemplo. El formulario contempla remito, factura, orden de compra y pedido del cliente.</p></div></section>
    <section className={panel}><h2 className="font-semibold">Clasificación del problema</h2><span className="inline-block rounded-lg bg-amber-50 px-3 py-1 text-sm text-amber-900">{r.clasificacion}</span><div><h3 className="text-xs text-slate-500">Detalle del problema</h3><p className="mt-2 whitespace-pre-wrap text-sm">{r.detalle}</p></div></section>
    <section className={panel}><h2 className="font-semibold">Productos sobre los que se realiza el reclamo</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Código de producto", "Descripción", "Cantidad facturada", "Cantidad reclamada"].map((c) => <th scope="col" className="p-3" key={c}>{c}</th>)}</tr></thead><tbody>{r.productos.map((p, i) => <tr key={i} className="border-t border-slate-100"><td className="p-3 font-mono">{p.codigo}</td><td className="p-3">{p.descripcion}</td><td className="p-3">{p.cantidadFacturada}</td><td className="p-3 font-semibold text-amber-800">{p.cantidadReclamo}</td></tr>)}</tbody></table></div></section>
    <section className={panel}><h2 className="font-semibold">Evaluación de Calidad y acciones correctivas</h2><p className="text-xs text-slate-500">Datos correspondientes a la segunda página del formulario, a completar por el área de Calidad.</p><Datos valores={{ "Clasificación del reclamo": r.calidad.clasificacion, Causa: r.calidad.causa, "¿El reclamo es procedente?": r.calidad.procedente === null ? null : r.calidad.procedente ? "Sí" : "No" }} /><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Fecha", "Acción", "Responsable", "Tiempo", "Resultado"].map((c) => <th scope="col" className="p-3" key={c}>{c}</th>)}</tr></thead><tbody>{r.calidad.acciones.map((a, i) => <tr key={i}>{[a.fecha, a.accion, a.responsable, a.tiempo, a.resultado].map((v, j) => <td className="p-3" key={j}>{v}</td>)}</tr>)}</tbody></table>{!r.calidad.acciones.length && <p className="p-3 text-sm text-slate-500">Sin acciones correctivas registradas.</p>}</div></section>
    <section className={panel}><h2 className="font-semibold">Cierre del reclamo</h2><Datos valores={r.cierre} /></section>
    <AccionReclamo id={r.id} inicial={r.indicacion} />
  </div>;
}
