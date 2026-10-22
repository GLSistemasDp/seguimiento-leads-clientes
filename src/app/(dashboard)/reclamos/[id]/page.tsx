import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AccionReclamo } from "@/components/reclamos/AccionReclamo";
import { FormularioCalidad } from "@/components/reclamos/FormularioCalidad";
import { FormularioGestion } from "@/components/reclamos/FormularioGestion";
import { Icono } from "@/components/ui/Icono";
import { urlAdjunto } from "@/lib/db/adjuntos";
import { getFormulario } from "@/lib/db/reclamos";
import { tipoEppDe } from "@/lib/reclamos/informe";
import { CANALES_INGRESO, MOTIVOS_LOGISTICOS } from "@/types/reclamo";

export const metadata = { title: "Formulario de reclamo · CRM De Pascale" };
export const dynamic = "force-dynamic";

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-[#1b2b5e] px-5 py-2.5 text-white">
        <h2 className="text-sm font-semibold">{titulo}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Datos({ valores }: { valores: Record<string, string | null | undefined> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(valores).map(([etiqueta, valor]) => (
        <div key={etiqueta} className="min-w-0">
          <dt className="text-xs text-slate-500">{etiqueta}</dt>
          <dd className={`mt-0.5 text-sm break-words ${valor ? "text-slate-900" : "text-slate-400"}`}>{valor || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ReclamoPage({ params }: { params: Promise<{ id: string }> }) {
  const r = await getFormulario((await params).id);
  if (!r) notFound();
  const fecha = r.fecha.split("-").reverse().join("/");
  const automatico = { ...r, gestion: { ...r.gestion, tipoEpp: null, canalIngreso: null, motivoLogistico: null } };
  const clasificacion = r.calidad.clasificacion ?? r.clasificacion;
  const motivoDeducido =
    clasificacion === "Faltante de Mercadería" ? MOTIVOS_LOGISTICOS.FALTANTE : clasificacion === "Plazo de Entrega" ? MOTIVOS_LOGISTICOS.DEMORA : null;

  return (
    <div className="flex flex-col gap-5 pb-10">
      <Link href="/reclamos" className="text-sm text-blue-700 hover:underline">
        ← Volver a reclamos
      </Link>

      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Reclamo de Cliente · FOR-03 Rev04</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1b2b5e] uppercase">{r.razonSocial}</h1>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{r.id}</span>
            {r.numeroCliente ? ` · Cliente #${r.numeroCliente}` : ""}
            <span className="text-slate-400"> · {fecha}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-lg bg-amber-50 px-3 py-1 text-sm text-amber-900">{r.clasificacion}</span>
          {r.canal === "cliente" ? (
            <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">Cargado por el cliente</span>
          ) : null}
          {r.consultaId ? (
            <Link
              href={`/seguimiento?vista=todas&hito=Reclamo&q=${encodeURIComponent(r.razonSocial)}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
            >
              <Icono nombre="chat" className="size-3.5" />
              Cargado desde WhatsApp · ver chat
            </Link>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Bloque titulo="A completar por el Cliente">
            <Datos
              valores={{
                "Razón social": r.razonSocial,
                "N° de cliente": r.numeroCliente,
                Sucursal: r.sucursal,
                Transporte: r.transporte,
                "Nombre y apellido": r.contacto,
                Cargo: r.cargo,
                Teléfono: r.telefono,
                "E-mail": r.email,
              }}
            />
          </Bloque>

          <Bloque titulo="Clasificación del Problema">
            <p className="text-xs text-slate-500">Detalle del problema</p>
            <p className="mt-1 text-sm whitespace-pre-wrap text-slate-900">{r.detalle}</p>
          </Bloque>

          <Bloque titulo="Datos del Producto sobre el cual se realiza el Reclamo">
            <Datos
              valores={{
                "N° orden de compra": r.ordenCompra,
                "N° de factura": r.factura,
                "N° de pedido": r.pedido,
                "N° de remito": r.remito,
              }}
            />
            {r.productos.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">Sin productos cargados.</p>
            ) : (
              <table className="mt-4 w-full table-fixed text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="w-[18%] p-2.5 font-medium">Código</th>
                    <th scope="col" className="p-2.5 font-medium">Descripción</th>
                    <th scope="col" className="w-28 p-2.5 font-medium">Lote</th>
                    <th scope="col" className="w-24 p-2.5 text-right font-medium">Facturada</th>
                    <th scope="col" className="w-24 p-2.5 text-right font-medium">Reclamo</th>
                  </tr>
                </thead>
                <tbody>
                  {r.productos.map((p, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="truncate p-2.5 font-mono text-xs">{p.codigo || "—"}</td>
                      <td className="p-2.5">{p.descripcion || "—"}</td>
                      <td className="truncate p-2.5 font-mono text-xs">{p.lote || "—"}</td>
                      <td className="p-2.5 text-right tabular-nums">{p.cantidadFacturada}</td>
                      <td className="p-2.5 text-right font-semibold text-amber-800 tabular-nums">{p.cantidadReclamo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Bloque>

          <Bloque titulo="Documentación adjunta">
            {r.adjuntos.length === 0 ? (
              <p className="text-sm text-slate-500">
                Sin adjuntos. El formulario pide copia de remito, factura, orden de compra y pedido del cliente.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {r.adjuntos.map((adjunto) => (
                  <li key={adjunto.id}>
                    <a
                      href={urlAdjunto(adjunto)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-blue-800 hover:bg-blue-50"
                    >
                      <Icono nombre="documento" className="size-4" />
                      <span className="min-w-0 flex-1 truncate">{adjunto.nombre}</span>
                      <Icono nombre="externo" className="size-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>
        </div>

        <div className="flex flex-col gap-5">
          <AccionReclamo id={r.id} inicial={r.indicacion} />
          <FormularioGestion
            id={r.id}
            inicial={r.gestion}
            cerradoEn={r.cerradoEn}
            deducido={{
              tipoEpp: tipoEppDe(automatico),
              canalIngreso: CANALES_INGRESO[r.canal === "cliente" ? "PORTAL" : "COMERCIAL"],
              motivoLogistico: motivoDeducido,
            }}
          />
        </div>
      </div>

      <FormularioCalidad id={r.id} calidad={r.calidad} cierre={r.cierre} />
    </div>
  );
}
