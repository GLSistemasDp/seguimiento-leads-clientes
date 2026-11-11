"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/generador/CopyButton";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { crearBorradorEml, pendientesDelMail } from "@/lib/mailing/borrador-usuario";
import { armarMail, cuerpoMailTexto } from "@/lib/mailing/plantillas";
import type { Extras } from "@/lib/mailing/plantillas";
import { textoAParrafos } from "@/lib/utils/html";
import { TIPOS_MAIL } from "@/types/mailing";
import type { Destinatario, PlantillaMailing, TipoMailUsuario } from "@/types/mailing";

const campo = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

export function PrepararMailUsuario({ tipo, plantilla, destinatario, extras, onCerrar }: {
  tipo: TipoMailUsuario;
  plantilla: PlantillaMailing;
  destinatario: Destinatario;
  extras: Extras;
  onCerrar: () => void;
}) {
  const { mostrar } = useToast();
  // Los datos del caso pertenecen solamente a este destinatario y este borrador.
  const [asunto, setAsunto] = useState(() => armarMail(plantilla, destinatario, extras).asunto);
  const [texto, setTexto] = useState(() => cuerpoMailTexto(plantilla, destinatario, extras));
  const [verVista, setVerVista] = useState(false);
  const pendientes = pendientesDelMail(asunto, texto);
  const listo = asunto.trim() !== "" && texto.trim() !== "" && pendientes.length === 0;
  const mail = useMemo(() => armarMail({
    ...plantilla,
    asunto,
    cuerpo: textoAParrafos(texto),
  }, destinatario, extras), [plantilla, asunto, texto, destinatario, extras]);
  const textoCompleto = [plantilla.titulo, texto, plantilla.botonUrl, plantilla.pie].filter(Boolean).join("\n\n");
  const enlaceCorreo = `mailto:${encodeURIComponent(destinatario.email)}?subject=${encodeURIComponent(mail.asunto)}&body=${encodeURIComponent(textoCompleto)}`;

  function descargar() {
    try {
      const eml = crearBorradorEml(destinatario.email, mail.asunto, textoCompleto, mail.html);
      const url = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `${tipo}-${destinatario.codigo || "cliente"}.eml`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      mostrar(error instanceof Error ? error.message : "No se pudo crear el borrador.", "error");
    }
  }

  return (
    <Modal
      abierto
      ancho="xl"
      titulo={`Preparar mail · ${TIPOS_MAIL[tipo].etiqueta}`}
      onCerrar={onCerrar}
      acciones={<>
        <Button variante="secundario" onClick={onCerrar}>Cerrar</Button>
        <Button disabled={!listo} onClick={descargar}>Descargar borrador (.eml)</Button>
      </>}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950">
          <p><strong>Para:</strong> {destinatario.nombre} &lt;{destinatario.email}&gt;</p>
          <p className="mt-1 text-xs">Este correo se prepara solo para este cliente. Los cambios de este borrador no modifican la plantilla guardada.</p>
        </div>
        <p className="text-sm">Completá los datos entre corchetes y quitá los bloques opcionales que no correspondan. Adjuntá la cotización, remito o factura en tu programa de correo antes de enviarlo.</p>
        <label className="text-sm font-medium text-slate-700">
          Asunto del correo
          <input value={asunto} maxLength={200} onChange={(evento) => setAsunto(evento.target.value)} className={campo} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Mensaje para este cliente
          <textarea rows={16} value={texto} onChange={(evento) => setTexto(evento.target.value)} className={`${campo} leading-6`} />
        </label>
        {pendientes.length > 0 ? <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Quedan datos o secciones por revisar:</p>
          <p className="mt-1 break-words text-xs">{pendientes.join(" · ")}</p>
        </div> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button variante="secundario" onClick={() => setVerVista(!verVista)}>{verVista ? "Ocultar vista previa" : "Ver vista previa"}</Button>
          {listo ? <>
            <CopyButton html={mail.html} />
            <a href={enlaceCorreo} className="rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">Abrir en mi correo</a>
          </> : null}
        </div>
        {verVista ? <iframe title="Vista previa del correo para cliente USUARIO" srcDoc={mail.html} sandbox="" className="h-[55vh] w-full rounded-lg border border-slate-200 bg-white" /> : null}
        <p className="text-xs text-slate-500">El archivo .eml conserva el formato y se abre en programas compatibles, como Outlook. “Abrir en mi correo” usa texto plano. El envío se realiza desde tu cuenta de correo.</p>
      </div>
    </Modal>
  );
}
