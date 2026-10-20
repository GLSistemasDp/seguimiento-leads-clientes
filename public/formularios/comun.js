/*
 * Funciones comunes de los formularios publicos de De Pascale.
 * Sin dependencias: JS del navegador. Los formularios solo ENVIAN datos a
 * /api/publico/*; no leen nada de la intranet.
 */
(function () {
  "use strict";

  /** Limite total de adjuntos (el servidor rechaza mas de 4 MB). */
  var MAX_BYTES = 4 * 1024 * 1024;
  var TIPOS = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

  /**
   * Base de la API. Si el HTML se publica en otro sitio (ej. depascale.com.ar),
   * se indica con <meta name="dp-api" content="https://crm.ejemplo.com">.
   */
  function baseApi() {
    var meta = document.querySelector('meta[name="dp-api"]');
    return meta && meta.content ? meta.content.replace(/\/$/, "") : "";
  }

  function tamano(bytes) {
    return bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + " MB" : Math.ceil(bytes / 1024) + " KB";
  }

  function tipoValido(archivo) {
    return TIPOS.indexOf(archivo.type) !== -1;
  }

  /** Muestra (o limpia) el mensaje de error general del formulario. */
  function error(mensaje) {
    var caja = document.getElementById("error-general");
    if (!caja) return;
    caja.textContent = mensaje || "";
    caja.classList.toggle("hidden", !mensaje);
    if (mensaje) caja.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** Envia el FormData y devuelve el JSON; ante error lanza con el mensaje del servidor. */
  function enviar(ruta, datos) {
    return fetch(baseApi() + ruta, { method: "POST", body: datos })
      .then(function (respuesta) {
        return respuesta
          .json()
          .catch(function () {
            return {};
          })
          .then(function (cuerpo) {
            if (!respuesta.ok) {
              throw new Error(cuerpo.error || "No pudimos enviar el formulario (" + respuesta.status + "). Intentá de nuevo.");
            }
            return cuerpo;
          });
      })
      .catch(function (causa) {
        if (causa instanceof TypeError) throw new Error("Sin conexión. Revisá tu internet e intentá de nuevo.");
        throw causa;
      });
  }

  /** Valor de un parametro de la URL (para precargar datos desde el link). */
  function parametro(nombre) {
    return new URLSearchParams(window.location.search).get(nombre) || "";
  }

  /** "20/10/2026" para mostrar la fecha de hoy. */
  function hoy() {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
  }

  /** Bloquea el boton mientras se envia. */
  function ocupado(boton, activo, texto) {
    if (!boton) return;
    if (activo) {
      boton.dataset.texto = boton.textContent;
      boton.textContent = texto || "Enviando…";
    } else if (boton.dataset.texto) {
      boton.textContent = boton.dataset.texto;
    }
    boton.disabled = activo;
  }

  window.DP = {
    MAX_BYTES: MAX_BYTES,
    tamano: tamano,
    tipoValido: tipoValido,
    error: error,
    enviar: enviar,
    parametro: parametro,
    hoy: hoy,
    ocupado: ocupado,
  };
})();
