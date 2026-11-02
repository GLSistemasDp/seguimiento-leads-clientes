// ==UserScript==
// @name         CRM De Pascale - CUIT en Nosis Manager
// @namespace    https://depascale.com.ar/crm
// @version      1.0.0
// @description  Al abrir Nosis Manager desde el boton "Ver en Nosis Manager" del CRM, carga el CUIT de la solicitud en el campo Documento.
// @match        https://*.nosis.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

/*
 * El CRM abre Manager con "#cuit=<11 digitos>" al final del link. Si Nosis pide
 * iniciar sesion, el CUIT queda guardado unos minutos y se carga cuando
 * Manager termina de abrir. Solo completa el campo: la consulta la hace la
 * persona con el boton Consultar.
 */
(function () {
  "use strict";

  var CLAVE = "cuitPendiente";
  var VIGENCIA_MS = 10 * 60 * 1000;

  var enLink = location.hash.match(/(?:^#|&)cuit=(\d{11})(?:&|$)/);
  if (enLink) {
    GM_setValue(CLAVE, JSON.stringify({ cuit: enLink[1], hasta: Date.now() + VIGENCIA_MS }));
    // Saca el CUIT de la barra de direcciones sin recargar.
    history.replaceState(null, "", location.pathname + location.search);
  }

  var pendiente = null;
  try {
    pendiente = JSON.parse(GM_getValue(CLAVE, "null"));
  } catch (error) {
    pendiente = null;
  }
  if (!pendiente || pendiente.hasta < Date.now()) {
    GM_deleteValue(CLAVE);
    return;
  }

  function campoDocumento() {
    var campos = document.querySelectorAll("input");
    for (var i = 0; i < campos.length; i += 1) {
      var campo = campos[i];
      var pista = (campo.placeholder || campo.title || campo.getAttribute("aria-label") || "").trim().toLowerCase();
      if (pista === "documento" && campo.offsetParent !== null && !campo.disabled) return campo;
    }
    return null;
  }

  function completar(campo) {
    // Con el setter nativo, para que lo noten tambien los frameworks que escuchan "input".
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(campo, pendiente.cuit);
    ["input", "change", "keyup"].forEach(function (tipo) {
      campo.dispatchEvent(new Event(tipo, { bubbles: true }));
    });
    campo.focus();
    GM_deleteValue(CLAVE);
  }

  // Manager arma la pantalla despues de cargar: se espera al campo hasta 30 segundos.
  var inicio = Date.now();
  var espera = setInterval(function () {
    var campo = campoDocumento();
    if (campo) {
      clearInterval(espera);
      completar(campo);
    } else if (Date.now() - inicio > 30000) {
      clearInterval(espera);
    }
  }, 300);
})();
