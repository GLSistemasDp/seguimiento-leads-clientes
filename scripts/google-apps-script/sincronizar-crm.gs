/**
 * Sincronizacion de la planilla de seguimiento con el CRM De Pascale.
 *
 * Se pega en la planilla de la empresa: Extensiones > Apps Script. Cada 2
 * horas avisa al CRM, que lee la planilla y carga en la base lo nuevo
 * (clientes, consultas que cargo el bot y tildes de RESPUESTA). El CRM nunca
 * escribe en la planilla.
 *
 * Instalacion (una sola vez):
 *  1. Configuracion del proyecto (engranaje) > Propiedades de la secuencia de comandos:
 *       CRM_URL        https://<dominio-del-crm>      (sin barra al final)
 *       CRM_SYNC_TOKEN el mismo valor que SYNC_TOKEN en Vercel
 *  2. Elegir la funcion "instalarActivador" y tocar Ejecutar (pide permisos la primera vez).
 *  3. Elegir "sincronizarConCrm" y Ejecutar para probar: el registro muestra la respuesta.
 *
 * Para dejar de sincronizar: Activadores (reloj) > borrar el de sincronizarConCrm.
 */

/** Horas entre sincronizaciones. Apps Script acepta 1, 2, 4, 6, 8 o 12. */
var HORAS = 2;

function sincronizarConCrm() {
  var propiedades = PropertiesService.getScriptProperties();
  var url = propiedades.getProperty("CRM_URL");
  var token = propiedades.getProperty("CRM_SYNC_TOKEN");
  if (!url || !token) throw new Error("Faltan CRM_URL o CRM_SYNC_TOKEN en las propiedades del script.");

  var respuesta = UrlFetchApp.fetch(url.replace(/\/$/, "") + "/api/sync/planilla", {
    method: "post",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  var codigo = respuesta.getResponseCode();
  Logger.log(codigo + " " + respuesta.getContentText().slice(0, 500));
  if (codigo >= 500) throw new Error("El CRM respondio " + codigo + ": " + respuesta.getContentText().slice(0, 200));
}

/** Crea el activador por tiempo (borra los anteriores para no duplicarlo). */
function instalarActivador() {
  ScriptApp.getProjectTriggers().forEach(function (activador) {
    if (activador.getHandlerFunction() === "sincronizarConCrm") ScriptApp.deleteTrigger(activador);
  });
  ScriptApp.newTrigger("sincronizarConCrm").timeBased().everyHours(HORAS).create();
  Logger.log("Activador creado: cada " + HORAS + " horas.");
}
