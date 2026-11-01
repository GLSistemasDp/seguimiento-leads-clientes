/**
 * Replica la planilla original de la empresa en la planilla demo.
 *
 * Se pega en la planilla DEMO (la que lee el CRM): Extensiones > Apps Script.
 * Copia los VALORES de todas las pestañas de la original (mismos nombres) y
 * los pega en la demo, pisando lo que haya. No toca la original.
 *
 * Requisito: la cuenta que instala el script tiene que poder VER la original
 * (no hace falta ser duena ni editora).
 *
 * Instalacion (una sola vez):
 *  1. Revisar ORIGEN_ID y, si hace falta, PESTANAS_EXCLUIDAS.
 *  2. Elegir "replicarPlanilla" y tocar Ejecutar: pide permisos la primera vez
 *     (leer la original y editar esta). El registro muestra que se copio.
 *  3. Elegir "instalarActivador" y Ejecutar: desde ahi corre sola cada HORAS.
 *
 * Para frenarlo: Activadores (reloj) > borrar el de replicarPlanilla.
 */

/** ID de la planilla original (lo que va entre /d/ y /edit en su link). */
var ORIGEN_ID = "1Bo5zBqgO2QTIjzob_PSnKaMeQ5BHzFdVd5scV035X54";

/** Pestanas de la original que NO se copian (por nombre exacto). Vacio = todas. */
var PESTANAS_EXCLUIDAS = [];

/** Horas entre copias. Apps Script acepta 1, 2, 4, 6, 8 o 12. */
var HORAS = 2;

function replicarPlanilla() {
  var origen = SpreadsheetApp.openById(ORIGEN_ID);
  var destino = SpreadsheetApp.getActiveSpreadsheet();
  var resumen = [];

  origen.getSheets().forEach(function (hojaOrigen) {
    var nombre = hojaOrigen.getName();
    if (PESTANAS_EXCLUIDAS.indexOf(nombre) !== -1) return;

    var valores = hojaOrigen.getDataRange().getValues();
    var filas = valores.length;
    var columnas = filas ? valores[0].length : 0;
    var hojaDestino = destino.getSheetByName(nombre) || destino.insertSheet(nombre);

    // Se escribe primero y despues se limpia lo que sobra: el CRM nunca lee la pestana vacia.
    if (filas && columnas) {
      if (hojaDestino.getMaxRows() < filas) hojaDestino.insertRowsAfter(hojaDestino.getMaxRows(), filas - hojaDestino.getMaxRows());
      if (hojaDestino.getMaxColumns() < columnas) hojaDestino.insertColumnsAfter(hojaDestino.getMaxColumns(), columnas - hojaDestino.getMaxColumns());
      hojaDestino.getRange(1, 1, filas, columnas).setValues(valores);
    }
    var ultimaFila = hojaDestino.getLastRow();
    var ultimaColumna = hojaDestino.getLastColumn();
    if (ultimaFila > filas) hojaDestino.getRange(filas + 1, 1, ultimaFila - filas, Math.max(ultimaColumna, 1)).clearContent();
    if (ultimaColumna > columnas && filas) hojaDestino.getRange(1, columnas + 1, filas, ultimaColumna - columnas).clearContent();

    resumen.push(nombre + ": " + filas + " filas");
  });

  SpreadsheetApp.flush();
  Logger.log("Copiado desde la original:\n" + resumen.join("\n"));
}

/** Crea el activador por tiempo (borra los anteriores para no duplicarlo). */
function instalarActivador() {
  ScriptApp.getProjectTriggers().forEach(function (activador) {
    if (activador.getHandlerFunction() === "replicarPlanilla") ScriptApp.deleteTrigger(activador);
  });
  ScriptApp.newTrigger("replicarPlanilla").timeBased().everyHours(HORAS).create();
  Logger.log("Activador creado: cada " + HORAS + " horas.");
}
