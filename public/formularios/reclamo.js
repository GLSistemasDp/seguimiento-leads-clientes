/* Formulario publico de reclamo (FOR-03 Rev04). */
(function () {
  "use strict";

  var MAX_PRODUCTOS = 10;
  var MAX_ADJUNTOS = 4;

  var formulario = document.getElementById("formulario");
  var productos = document.getElementById("productos");
  var plantilla = document.getElementById("fila-producto");
  var agregar = document.getElementById("agregar-producto");
  var entradaAdjuntos = document.getElementById("adjuntos");
  var listaAdjuntos = document.getElementById("lista-adjuntos");
  var boton = document.getElementById("enviar");
  var archivos = [];

  document.getElementById("fecha").textContent = DP.hoy();

  // El equipo puede compartir el link con el cliente ya identificado:
  // /formularios/reclamo?razon=...&cliente=...&ref=...
  formulario.razonSocial.value = DP.parametro("razon");
  formulario.numeroCliente.value = DP.parametro("cliente");
  var referencia = DP.parametro("ref");

  // --- Productos ---
  function actualizarProductos() {
    var filas = productos.children.length;
    agregar.disabled = filas >= MAX_PRODUCTOS;
    agregar.textContent = "+ Otro producto (" + filas + " de " + MAX_PRODUCTOS + ")";
    Array.prototype.forEach.call(productos.querySelectorAll("[data-quitar]"), function (quitar) {
      quitar.disabled = filas === 1;
    });
  }

  function agregarProducto() {
    if (productos.children.length >= MAX_PRODUCTOS) return;
    productos.appendChild(plantilla.content.cloneNode(true));
    actualizarProductos();
  }

  productos.addEventListener("click", function (evento) {
    var quitar = evento.target.closest("[data-quitar]");
    if (!quitar || productos.children.length === 1) return;
    quitar.parentElement.remove();
    actualizarProductos();
  });
  agregar.addEventListener("click", agregarProducto);
  for (var i = 0; i < 3; i += 1) agregarProducto();

  // --- Adjuntos ---
  function pintarAdjuntos() {
    listaAdjuntos.innerHTML = "";
    archivos.forEach(function (archivo, indice) {
      var item = document.createElement("li");
      item.className = "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
      var nombre = document.createElement("span");
      nombre.className = "min-w-0 flex-1 truncate";
      nombre.textContent = archivo.name;
      var peso = document.createElement("span");
      peso.className = "text-xs text-slate-500";
      peso.textContent = DP.tamano(archivo.size);
      var quitar = document.createElement("button");
      quitar.type = "button";
      quitar.className = "rounded px-2 text-lg text-slate-500 hover:bg-slate-100";
      quitar.setAttribute("aria-label", "Quitar " + archivo.name);
      quitar.textContent = "×";
      quitar.addEventListener("click", function () {
        archivos.splice(indice, 1);
        pintarAdjuntos();
      });
      item.append(nombre, peso, quitar);
      listaAdjuntos.appendChild(item);
    });
  }

  entradaAdjuntos.addEventListener("change", function () {
    var nuevos = archivos.concat(Array.prototype.slice.call(entradaAdjuntos.files));
    entradaAdjuntos.value = "";
    if (nuevos.length > MAX_ADJUNTOS) return DP.error("Podés adjuntar hasta " + MAX_ADJUNTOS + " archivos.");
    var invalido = nuevos.find(function (archivo) {
      return !DP.tipoValido(archivo);
    });
    if (invalido) return DP.error(invalido.name + ": solo se aceptan PDF o imágenes (JPG, PNG, WEBP).");
    var total = nuevos.reduce(function (suma, archivo) {
      return suma + archivo.size;
    }, 0);
    if (total > DP.MAX_BYTES) return DP.error("Los archivos superan los 4 MB en total. Probá con archivos más livianos.");
    DP.error("");
    archivos = nuevos;
    pintarAdjuntos();
  });

  // --- Envio ---
  formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();
    DP.error("");
    if (!formulario.checkValidity()) {
      formulario.reportValidity();
      return;
    }

    var datos = {
      razonSocial: formulario.razonSocial.value,
      numeroCliente: formulario.numeroCliente.value,
      sucursal: formulario.sucursal.value,
      transporte: formulario.transporte.value,
      contacto: formulario.contacto.value,
      cargo: formulario.cargo.value,
      telefono: formulario.telefono.value,
      email: formulario.email.value,
      clasificacion: formulario.clasificacion.value,
      detalle: formulario.detalle.value,
      ordenCompra: formulario.ordenCompra.value,
      factura: formulario.factura.value,
      pedido: formulario.pedido.value,
      remito: formulario.remito.value,
      consultaId: referencia || null,
      productos: Array.prototype.map.call(productos.children, function (fila) {
        var producto = {};
        Array.prototype.forEach.call(fila.querySelectorAll("[data-campo]"), function (campo) {
          producto[campo.dataset.campo] = campo.value;
        });
        return producto;
      }),
    };

    var cuerpo = new FormData();
    cuerpo.set("datos", JSON.stringify(datos));
    cuerpo.set("sitio_web", formulario.sitio_web.value);
    archivos.forEach(function (archivo) {
      cuerpo.append("adjuntos", archivo);
    });

    DP.ocupado(boton, true, "Enviando…");
    DP.enviar("/api/publico/reclamos", cuerpo)
      .then(function (respuesta) {
        document.getElementById("numero-reclamo").textContent = respuesta.numero;
        document.getElementById("formulario-contenedor").classList.add("hidden");
        document.getElementById("enviado").classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (causa) {
        DP.error(causa.message);
        DP.ocupado(boton, false);
      });
  });
})();
