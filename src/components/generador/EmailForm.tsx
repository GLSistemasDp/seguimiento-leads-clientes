"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/generador/CopyButton";
import { EmailPreview } from "@/components/generador/EmailPreview";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { buildEmailHtml } from "@/lib/email/build-email-html";
import { generarPassword, usuarioDesdeEmail } from "@/lib/utils/strings";
import type { PlantillaEmail } from "@/types/plantilla";
import type { Estado } from "@/types/solicitud";

export type EmailFormProps = {
  estado: Estado;
  plantilla: PlantillaEmail;
  nombreInicial: string;
  emailInicial: string;
};

export function EmailForm({ estado, plantilla, nombreInicial, emailInicial }: EmailFormProps) {
  const esAprobado = estado === "APROBADO";

  const [nombre, setNombre] = useState(nombreInicial);
  const [email, setEmail] = useState(emailInicial);
  const [usuario, setUsuario] = useState(esAprobado ? usuarioDesdeEmail(emailInicial) : "");
  const [password, setPassword] = useState("");
  const [textoGenerico, setTextoGenerico] = useState("");
  const [headerImg, setHeaderImg] = useState(plantilla.headerImg ?? "");
  const [footerImg, setFooterImg] = useState(plantilla.footerImg ?? "");

  // El HTML se rearma en cada tecla: es una funcion pura y barata, no hace
  // falta debounce ni pedirle nada al servidor.
  const { html, asunto } = useMemo(
    () =>
      buildEmailHtml(
        plantilla,
        {
          nombre,
          email,
          usuario: esAprobado ? usuario : undefined,
          password: esAprobado ? password : undefined,
          texto_generico: textoGenerico,
        },
        {
          headerImg: headerImg.trim() || null,
          footerImg: footerImg.trim() || null,
        },
      ),
    [plantilla, nombre, email, usuario, password, textoGenerico, headerImg, footerImg, esAprobado],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre"
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </div>

        {esAprobado ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Usuario de la plataforma"
              value={usuario}
              onChange={(evento) => setUsuario(evento.target.value)}
            />
            <div className="flex flex-col gap-1">
              <Input
                label="Contrasena"
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
              />
              <Button
                tamano="sm"
                variante="fantasma"
                className="self-start"
                onClick={() => setPassword(generarPassword())}
              >
                Generar una al azar
              </Button>
            </div>
          </div>
        ) : null}

        <Textarea
          label="Texto para el cliente"
          value={textoGenerico}
          placeholder="Texto que va en el cuerpo del mail, debajo de lo fijo de la plantilla."
          onChange={(evento) => setTextoGenerico(evento.target.value)}
          ayuda="Reemplaza el placeholder {{texto_generico}} de la plantilla."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Imagen de encabezado (URL)"
            value={headerImg}
            placeholder="https://…"
            onChange={(evento) => setHeaderImg(evento.target.value)}
            ayuda="Si la dejas vacia, se usa un encabezado de texto."
          />
          <Input
            label="Imagen de pie (URL)"
            value={footerImg}
            placeholder="https://…"
            onChange={(evento) => setFooterImg(evento.target.value)}
            ayuda="Si la dejas vacia, se usa un pie de texto."
          />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <CopyButton html={html} />
          <p className="mt-2 text-xs text-slate-500">
            Se copia el mail ya renderizado: al pegarlo en Gmail, Outlook o Apple Mail
            aparece con formato, no como codigo.
          </p>
        </div>
      </div>

      <EmailPreview html={html} asunto={asunto} />
    </div>
  );
}
