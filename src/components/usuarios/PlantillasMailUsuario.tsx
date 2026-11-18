"use client";

import { useState } from "react";
import { campoUsuario, PanelUsuario } from "@/components/usuarios/Compartidos";
import { Button } from "@/components/ui/Button";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";
import { copiarEmail } from "@/lib/email/clipboard";
import { pendientesDelMail } from "@/lib/mailing/borrador-usuario";
import { fechaUsuario } from "@/lib/usuarios/analisis";
import { contactoMailUsuario, htmlMailUsuario, prepararMailUsuario } from "@/lib/usuarios/plantillas";
import type { BorradorMailUsuario, ContextoMailUsuario, PlantillasUsuarios } from "@/lib/usuarios/plantillas";
import { TIPOS_MAIL_USUARIOS } from "@/types/mailing";
import type { PlantillaMailing, TipoMailUsuario } from "@/types/mailing";
import type { FichaUsuario } from "@/types/usuarios";

/** Borrador individual: se puede ajustar sin cambiar la plantilla compartida. */
function EditorMailUsuario({ borrador, email }: { borrador: BorradorMailUsuario; email?: string }) {
  const { mostrar } = useToast();
  const [asunto, setAsunto] = useState(borrador.asunto);
  const [texto, setTexto] = useState(borrador.texto);
  const [copiado, setCopiado] = useState<"asunto" | "mensaje" | null>(null);
  const [copiando, setCopiando] = useState(false);
  const pendientes = pendientesDelMail(asunto, texto);

  async function copiar(parte: "asunto" | "mensaje") {
    setCopiando(true);
    try {
      const resultado = await copiarEmail(htmlMailUsuario(parte === "asunto" ? asunto : texto));
      if (!resultado.ok) {
        mostrar("No se pudo copiar. Podés seleccionar el texto y copiarlo manualmente.", "error");
        return;
      }
      setCopiado(parte);
      mostrar(parte === "asunto" ? "Asunto copiado." : "Mail copiado. Pegalo directamente en el cuerpo de tu correo.", "exito");
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      mostrar("No se pudo copiar. Podés seleccionar el texto y copiarlo manualmente.", "error");
    } finally {
      setCopiando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {email ? <p className="text-xs text-slate-600"><strong>Para:</strong> {email}</p> : null}
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Asunto del correo
        <input value={asunto} onChange={(evento) => setAsunto(evento.target.value)} className={campoUsuario} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Mensaje
        <textarea rows={12} value={texto} onChange={(evento) => setTexto(evento.target.value)} className={`${campoUsuario} resize-y leading-6 font-normal`} />
      </label>
      {pendientes.length > 0 ? (
        <details className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <summary className="cursor-pointer font-medium">{pendientes.length} {pendientes.length === 1 ? "campo o sección para revisar" : "campos o secciones para revisar"}</summary>
          <p className="mt-1 break-words leading-5">Completá los datos que faltan y quitá los bloques opcionales que no correspondan: {pendientes.join(" · ")}</p>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copiar("mensaje")} disabled={!texto.trim() || copiando}>
          <Icono nombre={copiado === "mensaje" ? "check" : "copiar"} className="size-4" />
          {copiado === "mensaje" ? "Mail copiado" : "Copiar mail para pegar"}
        </Button>
        <Button variante="secundario" onClick={() => void copiar("asunto")} disabled={!asunto.trim() || copiando}>
          <Icono nombre={copiado === "asunto" ? "check" : "copiar"} className="size-4" />
          {copiado === "asunto" ? "Asunto copiado" : "Copiar asunto"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">Podés editar este mensaje antes de copiarlo. Pegá el asunto y el mensaje en tu correo y adjuntá la documentación que corresponda.</p>
    </div>
  );
}

/** Plantilla al pie del pedido o cotización, con los productos de ese documento. */
export function MailDocumentoUsuario({ ficha, hoy, plantilla, contexto }: {
  ficha: FichaUsuario;
  hoy: string;
  plantilla: PlantillaMailing;
  contexto: ContextoMailUsuario;
}) {
  const borrador = prepararMailUsuario("usuario_respuesta_cotizacion", plantilla, hoy, ficha, contexto);
  return (
    <section aria-label="Plantilla de mail con los productos" className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icono nombre="mail" className="size-4 text-blue-700" />Plantilla de mail con los productos</h3>
      <p className="mt-1 mb-4 text-xs text-slate-500">Con los datos de {ficha.nombre}, los artículos, las cantidades y los precios de este documento.</p>
      <EditorMailUsuario key={JSON.stringify(borrador)} borrador={borrador} email={contactoMailUsuario(ficha, "usuario_respuesta_cotizacion").email} />
    </section>
  );
}

/** Biblioteca compartida entre el resumen de la cartera y la ficha de cada cuenta. */
export function PlantillasMailUsuario({ plantillas, hoy, ficha }: { plantillas: PlantillasUsuarios; hoy: string; ficha?: FichaUsuario }) {
  const [tipo, setTipo] = useState<TipoMailUsuario | null>(null);
  const [pedidoId, setPedidoId] = useState("");
  const [cotizacionId, setCotizacionId] = useState("");
  const [facturaId, setFacturaId] = useState("");
  const ordenar = <T extends { fecha: string; numero: string }>(documentos: readonly T[]) =>
    [...documentos].filter((item) => item.fecha <= hoy).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));
  const pedidos = ordenar(ficha?.pedidos ?? []);
  const cotizaciones = ordenar(ficha?.cotizaciones ?? []);
  const facturas = ordenar(ficha?.facturas ?? []);
  const pedido = pedidos.find((item) => item.id === pedidoId) ?? pedidos[0];
  const cotizacion = cotizaciones.find((item) => item.id === cotizacionId) ?? cotizaciones[0];
  const factura = facturas.find((item) => item.id === facturaId) ?? facturas[0];
  const usaPedido = tipo === "usuario_estado_pedido" || tipo === "usuario_remito_conformado";
  const usaCotizacion = tipo === "usuario_respuesta_cotizacion" || tipo === "usuario_info_cotizacion";
  const contexto: ContextoMailUsuario = usaPedido ? { pedido } : usaCotizacion ? { cotizacion } : tipo === "usuario_factura" ? { factura } : {};
  const borrador = tipo ? prepararMailUsuario(tipo, plantillas[tipo], hoy, ficha, contexto) : null;

  return (
    <PanelUsuario titulo="Plantillas de mail" detalle={ficha ? `Se completan con los datos de ${ficha.nombre}. Elegí la plantilla que necesitás.` : "Elegí una plantilla para verla y copiarla. Al abrir un cliente se completa con los datos de su ficha."}>
      <div className="flex flex-col gap-4 p-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(TIPOS_MAIL_USUARIOS) as TipoMailUsuario[]).map((opcion) => (
            <button
              key={opcion}
              type="button"
              aria-pressed={tipo === opcion}
              onClick={() => setTipo(opcion)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tipo === opcion ? "border-blue-300 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700 hover:border-blue-200 hover:bg-slate-50"}`}
            >
              <Icono nombre="mail" className="size-3.5 shrink-0" />
              {TIPOS_MAIL_USUARIOS[opcion].etiqueta}
            </button>
          ))}
        </div>
        {tipo && borrador ? (
          <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-900">{TIPOS_MAIL_USUARIOS[tipo].etiqueta}</h4>
              <Button variante="fantasma" tamano="sm" onClick={() => setTipo(null)}>Cerrar plantilla</Button>
            </div>
            {ficha && usaPedido && pedidos.length > 0 ? (
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                Pedido a incluir
                <select className={campoUsuario} value={pedido?.id ?? ""} onChange={(evento) => setPedidoId(evento.target.value)}>
                  {pedidos.map((item) => <option key={item.id} value={item.id}>{item.numero} · {fechaUsuario(item.fecha)}{item.ordenCompra ? ` · OC ${item.ordenCompra}` : ""}</option>)}
                </select>
              </label>
            ) : null}
            {ficha && usaCotizacion && cotizaciones.length > 0 ? (
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                Cotización a incluir
                <select className={campoUsuario} value={cotizacion?.id ?? ""} onChange={(evento) => setCotizacionId(evento.target.value)}>
                  {cotizaciones.map((item) => <option key={item.id} value={item.id}>{item.numero} · {fechaUsuario(item.fecha)}</option>)}
                </select>
              </label>
            ) : null}
            {ficha && tipo === "usuario_factura" && facturas.length > 0 ? (
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                Factura a incluir
                <select className={campoUsuario} value={factura?.id ?? ""} onChange={(evento) => setFacturaId(evento.target.value)}>
                  {facturas.map((item) => <option key={item.id} value={item.id}>{item.numero} · {fechaUsuario(item.fecha)}</option>)}
                </select>
              </label>
            ) : null}
            <EditorMailUsuario key={JSON.stringify([ficha?.codigo, tipo, contexto, borrador])} borrador={borrador} email={ficha ? contactoMailUsuario(ficha, tipo).email : undefined} />
          </div>
        ) : null}
      </div>
    </PanelUsuario>
  );
}
