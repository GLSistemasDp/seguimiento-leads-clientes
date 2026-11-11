/** Detecta datos por completar y marcadores de secciones opcionales. */
export function pendientesDelMail(...textos: string[]): string[] {
  const texto = textos.join("\n");
  return [...new Set([
    ...texto.matchAll(/\[[^\]\r\n]+\]|\{\{[^}\r\n]+\}\}/g),
  ].map((coincidencia) => coincidencia[0]))];
}

function base64Utf8(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

function asuntoMime(asunto: string): string {
  const partes: string[] = [];
  let parte = "";
  for (const caracter of asunto.replace(/[\r\n]/g, " ")) {
    if (new TextEncoder().encode(parte + caracter).length > 42) {
      partes.push(parte);
      parte = "";
    }
    parte += caracter;
  }
  if (parte) partes.push(parte);
  return partes.map((texto) => `=?UTF-8?B?${base64Utf8(texto)}?=`).join("\r\n ");
}

/** Borrador editable con texto y HTML, compatible con clientes que abren archivos .eml. */
export function crearBorradorEml(email: string, asunto: string, texto: string, html: string): string {
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)) throw new Error("El mail del destinatario no es válido.");
  const limite = "depascale-mail-usuario";
  const cuerpo = (tipo: string, contenido: string) => [
    `--${limite}`,
    `Content-Type: ${tipo}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Utf8(contenido).match(/.{1,76}/g)?.join("\r\n") ?? "",
  ].join("\r\n");
  return [
    "X-Unsent: 1",
    `To: ${email}`,
    `Subject: ${asuntoMime(asunto)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${limite}"`,
    "",
    cuerpo("text/plain", texto),
    cuerpo("text/html", html),
    `--${limite}--`,
    "",
  ].join("\r\n");
}
