/*
 * Formulario publico de Reclamo de Cliente (FOR-03 Rev04), en 4 pasos con el
 * mismo estilo y la misma navegacion que el de alta: nunca bloquea (avisa y
 * marca lo que falta, se puede seguir y volver) y solo el envio exige lo
 * obligatorio. Lo que se va cargando queda como borrador en este dispositivo.
 */
(function () {
  "use strict";

  var MAX_PRODUCTOS = 10;
  var MAX_ADJUNTOS = 4;
  var TOTAL_PASOS = 4;
  var NOMBRES_PASO = ["", "Tus datos", "El problema", "Compra y productos", "Adjuntos y envío"];
  var CLAVE_BORRADOR = "dp-reclamo-borrador";

  // Tipos de problema (los mismos del FOR-03), con lo que conviene contar y adjuntar en cada uno.
  var CLASIFICACIONES = [
    {
      valor: "Falla de Calidad",
      descripcion: "El producto vino con defectos o se rompe con el uso.",
      detalle: "Ej: los guantes del último pedido se descosen a los pocos días de uso. Pasa con 30 de los 120 pares.",
      productos: "Indicá el lote: lo encontrás impreso en el producto o en el envase.",
      adjuntos: "y fotos del producto con la falla. ",
    },
    {
      valor: "Faltante de Mercadería",
      descripcion: "Recibiste menos unidades que las facturadas.",
      detalle: "Ej: en el remito figuran 10 cajas y llegaron 8.",
      productos: "Poné la cantidad facturada y la que falta en cada producto.",
      adjuntos: "y una foto del remito firmado. ",
    },
    {
      valor: "Plazo de Entrega",
      descripcion: "El pedido no llegó en la fecha acordada.",
      detalle: "Ej: el pedido tenía que llegar el lunes y todavía no lo recibimos.",
      productos: "Con el N° de pedido o de factura alcanza para ubicarlo.",
      adjuntos: "",
    },
    {
      valor: "Error de Facturación",
      descripcion: "La factura no coincide con lo que pediste o recibiste.",
      detalle: "Ej: nos facturaron 50 unidades y pedimos 30.",
      productos: "Indicá qué productos están mal facturados.",
      adjuntos: "y la factura con el error. ",
    },
    {
      valor: "Diferencia de Precio",
      descripcion: "El precio facturado no es el acordado.",
      detalle: "Ej: el precio acordado era $1.200 por par y nos facturaron $1.450.",
      productos: "Indicá los productos con diferencia de precio.",
      adjuntos: "y la cotización u orden con el precio acordado. ",
    },
    {
      valor: "Error de Cliente",
      descripcion: "Pediste un producto o talle equivocado y querés cambiarlo.",
      detalle: "Ej: pedimos talle 8 y necesitábamos talle 9.",
      productos: "Indicá el producto que recibiste y, en el detalle, el que necesitás.",
      adjuntos: "",
    },
  ];

  var formulario = document.getElementById("formulario");
  var aviso = document.getElementById("aviso-paso");
  var productos = document.getElementById("productos");
  var plantillaProducto = document.getElementById("plantilla-producto");
  var botonAgregar = document.getElementById("agregar-producto");
  var entradaAdjuntos = document.getElementById("adjuntos");
  var zonaAdjuntos = document.getElementById("zona-adjuntos");
  var paso = 1;
  var archivos = [];

  function $(selector, raiz) {
    return (raiz || document).querySelector(selector);
  }
  function $$(selector, raiz) {
    return Array.prototype.slice.call((raiz || document).querySelectorAll(selector));
  }
  function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function numero(valor) {
    var limpio = String(valor || "").trim().replace(",", ".");
    return limpio === "" ? null : Number(limpio);
  }

  document.getElementById("fecha").textContent = DP.hoy();

  // --- Tipos de problema (tarjetas) ---
  var contenedorClasificaciones = document.getElementById("clasificaciones");
  var plantillaClasificacion = document.getElementById("plantilla-clasificacion");
  CLASIFICACIONES.forEach(function (opcion) {
    var tarjeta = plantillaClasificacion.content.cloneNode(true);
    var radio = $("input", tarjeta);
    radio.value = opcion.valor;
    radio.setAttribute("aria-label", opcion.valor);
    $("[data-titulo]", tarjeta).textContent = opcion.valor;
    $("[data-descripcion]", tarjeta).textContent = opcion.descripcion;
    contenedorClasificaciones.appendChild(tarjeta);
  });

  function clasificacionElegida() {
    var elegida = $('input[name="clasificacion"]:checked');
    return elegida ? CLASIFICACIONES.find(function (opcion) { return opcion.valor === elegida.value; }) : null;
  }

  /** Consejos que cambian segun el tipo de problema. */
  function aplicarConsejos() {
    var opcion = clasificacionElegida();
    formulario.detalle.placeholder = opcion ? opcion.detalle : "Contanos qué pasó, con el mayor detalle posible.";
    document.getElementById("consejo-productos").textContent = opcion ? opcion.productos : "";
    document.getElementById("consejo-adjuntos").textContent = opcion ? opcion.adjuntos : "";
  }
  contenedorClasificaciones.addEventListener("change", aplicarConsejos);

  var contador = document.getElementById("contador-detalle");
  function contarDetalle() {
    contador.textContent = formulario.detalle.value.length + " / 4000";
  }
  formulario.detalle.addEventListener("input", contarDetalle);

  // --- Productos ---
  function actualizarProductos() {
    var filas = productos.children.length;
    botonAgregar.disabled = filas >= MAX_PRODUCTOS;
    botonAgregar.textContent = filas >= MAX_PRODUCTOS ? "Máximo " + MAX_PRODUCTOS + " productos" : "+ Agregar otro producto";
    $$("[data-quitar]", productos).forEach(function (quitar) { quitar.disabled = filas === 1; });
  }
  function agregarProducto(valores) {
    if (productos.children.length >= MAX_PRODUCTOS) return;
    var fila = plantillaProducto.content.cloneNode(true);
    if (valores) {
      $$("[data-campo]", fila).forEach(function (campo) { campo.value = valores[campo.dataset.campo] || ""; });
    }
    productos.appendChild(fila);
    actualizarProductos();
  }
  productos.addEventListener("click", function (evento) {
    var quitar = evento.target.closest("[data-quitar]");
    if (!quitar || productos.children.length === 1) return;
    quitar.closest("[data-producto]").remove();
    actualizarProductos();
    guardarBorrador();
  });
  botonAgregar.addEventListener("click", function () {
    agregarProducto();
    $('[data-producto]:last-child [data-campo="codigo"]', productos).focus();
  });

  function leerProductos() {
    return $$("[data-producto]", productos).map(function (fila) {
      var producto = {};
      $$("[data-campo]", fila).forEach(function (campo) { producto[campo.dataset.campo] = campo.value.trim(); });
      return producto;
    });
  }

  // --- Adjuntos (clic o arrastrar) ---
  function pintarAdjuntos() {
    var lista = document.getElementById("lista-adjuntos");
    lista.innerHTML = "";
    archivos.forEach(function (archivo, indice) {
      var item = document.createElement("li");
      item.className = "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
      var nombre = document.createElement("span");
      nombre.className = "min-w-0 flex-1 truncate";
      nombre.textContent = archivo.name;
      var peso = document.createElement("span");
      peso.className = "text-xs text-slate-500";
      peso.textContent = DP.tamano(archivo.size);
      var quitar = document.createElement("button");
      quitar.type = "button";
      quitar.className = "rounded-lg px-2 text-lg text-slate-400 hover:bg-red-50 hover:text-red-600";
      quitar.setAttribute("aria-label", "Quitar " + archivo.name);
      quitar.textContent = "×";
      quitar.addEventListener("click", function () {
        archivos.splice(indice, 1);
        pintarAdjuntos();
      });
      item.append(nombre, peso, quitar);
      lista.appendChild(item);
    });
    var total = archivos.reduce(function (suma, archivo) { return suma + archivo.size; }, 0);
    document.getElementById("total-adjuntos").textContent = archivos.length
      ? archivos.length + " de " + MAX_ADJUNTOS + " archivos · " + DP.tamano(total) + " de 4 MB"
      : "";
    pintarResumen();
  }

  function sumarArchivos(nuevosArchivos) {
    var nuevos = archivos.concat(nuevosArchivos);
    if (nuevos.length > MAX_ADJUNTOS) return DP.error("Podés adjuntar hasta " + MAX_ADJUNTOS + " archivos.");
    var invalido = nuevos.find(function (archivo) { return !DP.tipoValido(archivo); });
    if (invalido) return DP.error(invalido.name + ": solo se aceptan PDF o imágenes (JPG, PNG, WEBP).");
    var total = nuevos.reduce(function (suma, archivo) { return suma + archivo.size; }, 0);
    if (total > DP.MAX_BYTES) return DP.error("Los archivos superan los 4 MB en total. Probá con archivos más livianos.");
    DP.error("");
    archivos = nuevos;
    pintarAdjuntos();
  }
  entradaAdjuntos.addEventListener("change", function () {
    sumarArchivos(Array.prototype.slice.call(entradaAdjuntos.files));
    entradaAdjuntos.value = "";
  });
  ["dragenter", "dragover"].forEach(function (tipo) {
    zonaAdjuntos.addEventListener(tipo, function (evento) {
      evento.preventDefault();
      zonaAdjuntos.dataset.arrastrando = "1";
    });
  });
  ["dragleave", "drop"].forEach(function (tipo) {
    zonaAdjuntos.addEventListener(tipo, function (evento) {
      evento.preventDefault();
      zonaAdjuntos.dataset.arrastrando = "";
    });
  });
  zonaAdjuntos.addEventListener("drop", function (evento) {
    sumarArchivos(Array.prototype.slice.call(evento.dataTransfer.files));
  });

  // --- Borrador en este dispositivo (los archivos no se guardan) ---
  var CAMPOS_BORRADOR = ["razonSocial", "numeroCliente", "sucursal", "contacto", "cargo", "telefono", "email", "detalle", "factura", "remito", "pedido", "ordenCompra", "transporte"];
  function guardarBorrador() {
    var datos = { productos: leerProductos(), clasificacion: (clasificacionElegida() || {}).valor || "" };
    CAMPOS_BORRADOR.forEach(function (campo) { datos[campo] = formulario[campo].value; });
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(datos));
    } catch (e) {
      /* sin almacenamiento: no pasa nada */
    }
  }
  function leerBorrador() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null");
    } catch (e) {
      return null;
    }
  }
  function borrarBorrador() {
    try {
      localStorage.removeItem(CLAVE_BORRADOR);
    } catch (e) {
      /* nada */
    }
  }

  var borrador = leerBorrador();
  var conBorrador = borrador && CAMPOS_BORRADOR.some(function (campo) { return borrador[campo]; });
  if (conBorrador) {
    CAMPOS_BORRADOR.forEach(function (campo) { formulario[campo].value = borrador[campo] || ""; });
    var radio = borrador.clasificacion && $('input[name="clasificacion"][value="' + borrador.clasificacion + '"]');
    if (radio) radio.checked = true;
    (borrador.productos && borrador.productos.length ? borrador.productos : [null]).forEach(function (producto) { agregarProducto(producto); });
    document.getElementById("borrador").classList.remove("hidden");
  } else {
    agregarProducto();
  }
  document.getElementById("descartar-borrador").addEventListener("click", function () {
    borrarBorrador();
    window.location.reload();
  });

  // El equipo puede compartir el link con el cliente ya identificado:
  // /formularios/reclamo?razon=...&cliente=...&ref=...
  var referencia = DP.parametro("ref");
  if (DP.parametro("razon")) formulario.razonSocial.value = DP.parametro("razon");
  if (DP.parametro("cliente")) formulario.numeroCliente.value = DP.parametro("cliente");
  if (DP.parametro("razon") || DP.parametro("cliente")) document.getElementById("precargado").classList.remove("hidden");

  aplicarConsejos();
  contarDetalle();
  formulario.addEventListener("input", guardarBorrador);
  formulario.addEventListener("change", guardarBorrador);

  // --- Revision de cada paso (sin bloquear) ---
  function marcar(elemento) {
    elemento.classList.add("campo-invalido");
    elemento.setAttribute("aria-invalid", "true");
  }
  function limpiarMarca(elemento) {
    elemento.classList.remove("campo-invalido");
    elemento.removeAttribute("aria-invalid");
  }
  formulario.addEventListener("input", function (evento) { limpiarMarca(evento.target); });
  formulario.addEventListener("change", function (evento) {
    limpiarMarca(evento.target);
    if (evento.target.name === "clasificacion") limpiarMarca(contenedorClasificaciones);
  });

  function nombreDe(campo) {
    var etiqueta = campo.id ? $('label[for="' + campo.id + '"]') : null;
    var texto = (etiqueta && etiqueta.textContent) || campo.getAttribute("aria-label") || campo.placeholder || campo.name;
    return String(texto).replace("*", "").trim();
  }

  /** Lo que falta en un paso. Si `marcarCampos`, ademas los pinta en rojo. */
  function faltantesDelPaso(numeroPaso, marcarCampos) {
    var seccion = $('[data-paso="' + numeroPaso + '"]');
    var faltantes = [];
    $$("input:not([type=radio]):not([type=file]), select, textarea", seccion).forEach(function (campo) {
      if (campo.checkValidity()) return;
      faltantes.push(nombreDe(campo) + (campo.value ? " (revisá el formato)" : ""));
      if (marcarCampos) marcar(campo);
    });
    if (numeroPaso === 2 && !clasificacionElegida()) {
      faltantes.unshift("Tipo de problema");
      if (marcarCampos) marcar(contenedorClasificaciones);
    }
    if (numeroPaso === 3) {
      $$("[data-producto]", productos).forEach(function (fila, indice) {
        var facturada = numero($('[data-campo="cantidadFacturada"]', fila).value);
        var reclamada = numero($('[data-campo="cantidadReclamo"]', fila).value);
        if ((facturada !== null && isNaN(facturada)) || (reclamada !== null && isNaN(reclamada))) {
          faltantes.push("Producto " + (indice + 1) + ": las cantidades tienen que ser números");
        } else if (facturada && reclamada && reclamada > facturada) {
          faltantes.push("Producto " + (indice + 1) + ": la cantidad reclamada supera la facturada");
          if (marcarCampos) marcar($('[data-campo="cantidadReclamo"]', fila));
        }
      });
    }
    return faltantes;
  }

  function mostrarAviso(html) {
    aviso.innerHTML = html || "";
    aviso.classList.toggle("hidden", !html);
  }

  function actualizarIndicadores() {
    $$("[data-indicador]").forEach(function (indicador) {
      var numeroPaso = Number(indicador.dataset.indicador);
      indicador.classList.toggle("activo", numeroPaso <= paso);
      var visitado = indicador.dataset.visitado === "1";
      indicador.classList.toggle("con-faltantes", visitado && numeroPaso !== paso && faltantesDelPaso(numeroPaso, false).length > 0);
    });
  }

  // --- Resumen para revisar antes de enviar ---
  function bloqueResumen(titulo, numeroPaso, filas) {
    return (
      "<div class='rounded-xl border border-slate-200 p-3 text-sm'>" +
      "<div class='mb-2 flex items-center justify-between gap-2'><span class='font-semibold text-azul'>" + titulo + "</span>" +
      "<button type='button' data-ir='" + numeroPaso + "' class='text-xs font-semibold text-azul underline'>Editar</button></div>" +
      filas
        .map(function (fila) {
          return "<p class='text-slate-600'><span class='text-slate-400'>" + fila[0] + ":</span> " +
            (fila[1] ? escapar(fila[1]) : "<span class='text-slate-400'>—</span>") + "</p>";
        })
        .join("") +
      "</div>"
    );
  }
  function pintarResumen() {
    var opcion = clasificacionElegida();
    var cargados = leerProductos().filter(function (p) { return p.codigo || p.descripcion; });
    var detalle = formulario.detalle.value.trim();
    document.getElementById("resumen").innerHTML =
      bloqueResumen("Tus datos", 1, [
        ["Empresa", formulario.razonSocial.value.trim() + (formulario.numeroCliente.value.trim() ? " · N° " + formulario.numeroCliente.value.trim() : "")],
        ["Contacto", formulario.contacto.value.trim()],
        ["Teléfono", formulario.telefono.value.trim()],
        ["Email", formulario.email.value.trim()],
      ]) +
      bloqueResumen("El problema", 2, [
        ["Tipo", opcion ? opcion.valor : ""],
        ["Detalle", detalle.length > 140 ? detalle.slice(0, 140) + "…" : detalle],
      ]) +
      bloqueResumen("Compra y productos", 3, [
        ["Factura", formulario.factura.value.trim()],
        ["Remito", formulario.remito.value.trim()],
        ["Productos", cargados.length ? cargados.map(function (p) { return p.codigo || p.descripcion; }).join(", ") : ""],
        ["Adjuntos", archivos.length ? archivos.length + (archivos.length === 1 ? " archivo" : " archivos") : ""],
      ]);
  }

  function mostrarPaso(numeroPaso) {
    $('[data-indicador="' + paso + '"]').dataset.visitado = "1";
    paso = Math.min(Math.max(numeroPaso, 1), TOTAL_PASOS);
    $$("[data-paso]").forEach(function (seccion) {
      seccion.classList.toggle("hidden", Number(seccion.dataset.paso) !== paso);
    });
    document.getElementById("numero-paso").textContent = paso;
    document.getElementById("anterior").classList.toggle("hidden", paso === 1);
    document.getElementById("siguiente").classList.toggle("hidden", paso === TOTAL_PASOS);
    document.getElementById("enviar").classList.toggle("hidden", paso !== TOTAL_PASOS);
    DP.error("");
    if (paso === TOTAL_PASOS) pintarResumen();
    actualizarIndicadores();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.getElementById("anterior").addEventListener("click", function () {
    mostrarAviso("");
    mostrarPaso(paso - 1);
  });
  document.getElementById("siguiente").addEventListener("click", function () {
    var faltantes = faltantesDelPaso(paso, true);
    var anterior = paso;
    mostrarPaso(paso + 1);
    mostrarAviso(
      faltantes.length
        ? "<strong>En el paso " + anterior + " (" + NOMBRES_PASO[anterior] + ") quedó pendiente:</strong> " +
            escapar(faltantes.join(", ")) + ". Podés seguir y completarlo antes de enviar."
        : ""
    );
  });
  $$("[data-indicador]").forEach(function (indicador) {
    indicador.addEventListener("click", function () {
      mostrarAviso("");
      mostrarPaso(Number(indicador.dataset.indicador));
    });
  });
  // "Ir al paso" del aviso y "Editar" del resumen.
  document.addEventListener("click", function (evento) {
    var ir = evento.target.closest("[data-ir]");
    if (!ir) return;
    var numeroPaso = Number(ir.dataset.ir);
    mostrarAviso("");
    mostrarPaso(numeroPaso);
    faltantesDelPaso(numeroPaso, true);
  });

  // --- Envio: aca si tiene que estar lo obligatorio ---
  formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();
    DP.error("");
    var porPaso = [];
    for (var n = 1; n <= TOTAL_PASOS; n += 1) {
      var faltantes = faltantesDelPaso(n, n === paso);
      if (faltantes.length) porPaso.push({ numero: n, faltantes: faltantes });
    }
    if (porPaso.length) {
      mostrarAviso(
        "<strong>Antes de enviar, completá:</strong><ul class='mt-1 list-disc pl-5'>" +
          porPaso.map(function (p) {
            return "<li>Paso " + p.numero + " (" + NOMBRES_PASO[p.numero] + "): " + escapar(p.faltantes.join(", ")) +
              " <button type='button' data-ir='" + p.numero + "' class='ml-1 font-semibold text-azul underline'>Ir al paso " + p.numero + "</button></li>";
          }).join("") +
          "</ul>"
      );
      $$("[data-indicador]").forEach(function (indicador) { indicador.dataset.visitado = "1"; });
      actualizarIndicadores();
      aviso.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    mostrarAviso("");

    var datos = {
      razonSocial: formulario.razonSocial.value,
      numeroCliente: formulario.numeroCliente.value,
      sucursal: formulario.sucursal.value,
      transporte: formulario.transporte.value,
      contacto: formulario.contacto.value,
      cargo: formulario.cargo.value,
      telefono: formulario.telefono.value,
      email: formulario.email.value,
      clasificacion: clasificacionElegida().valor,
      detalle: formulario.detalle.value,
      ordenCompra: formulario.ordenCompra.value,
      factura: formulario.factura.value,
      pedido: formulario.pedido.value,
      remito: formulario.remito.value,
      consultaId: referencia || null,
      productos: leerProductos(),
    };

    var cuerpo = new FormData();
    cuerpo.set("datos", JSON.stringify(datos));
    cuerpo.set("sitio_web", formulario.sitio_web.value);
    archivos.forEach(function (archivo) { cuerpo.append("adjuntos", archivo); });

    var boton = document.getElementById("enviar");
    DP.ocupado(boton, true, "Enviando…");
    DP.enviar("/api/publico/reclamos", cuerpo)
      .then(function (respuesta) {
        borrarBorrador();
        document.getElementById("numero-reclamo").textContent = respuesta.numero;
        var exito = document.getElementById("enviado");
        exito.classList.remove("hidden");
        exito.classList.add("flex");
      })
      .catch(function (causa) {
        // El error del servidor no deja el boton trabado: se puede corregir y reenviar.
        DP.error(causa.message);
        DP.ocupado(boton, false);
      });
  });

  mostrarPaso(1);
})();
