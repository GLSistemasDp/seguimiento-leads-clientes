/* Formulario publico de Alta de Clientes. */
(function () {
  "use strict";

  var PROVINCIAS = [
    "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa",
    "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
    "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
  ];
  var DIRECCIONES = [
    { clave: "legal", titulo: "Dirección legal" },
    { clave: "comercial", titulo: "Dirección comercial" },
    { clave: "correspondencia", titulo: "Dirección de envío de correspondencia" },
    { clave: "entrega", titulo: "Dirección de entrega de la mercadería" },
    { clave: "sucursal", titulo: "Sucursal" },
  ];
  var DOCUMENTOS = [
    { campo: "doc_cm05", titulo: "Formulario CM05" },
    { campo: "doc_legajo", titulo: "Legajo impositivo" },
    { campo: "doc_cuit", titulo: "Constancia de CUIT" },
    { campo: "doc_iva", titulo: "Declaración jurada de IVA" },
    { campo: "doc_cargas", titulo: "Última DDJJ de cargas sociales" },
    { campo: "doc_ganancias", titulo: "Última DDJJ de Ganancias" },
    { campo: "doc_estatuto", titulo: "Contrato social / Estatuto" },
    { campo: "doc_balance", titulo: "Último balance" },
  ];
  var REFERENCIAS = 5;

  var formulario = document.getElementById("formulario");
  var boton = document.getElementById("enviar");
  var archivos = {};

  document.getElementById("fecha").textContent = DP.hoy();

  // --- "Otros" en antiguedad y frecuencia ---
  [["antiguedad", "antiguedadOtro"], ["frecuencia", "frecuenciaOtro"]].forEach(function (par) {
    var otro = formulario[par[1]];
    Array.prototype.forEach.call(formulario.querySelectorAll('input[name="' + par[0] + '"]'), function (radio) {
      radio.addEventListener("change", function () {
        var activo = formulario[par[0]].value === "otros";
        otro.classList.toggle("hidden", !activo);
        otro.required = activo;
        if (activo) otro.focus();
      });
    });
  });

  // --- Direcciones ---
  var contenedorDirecciones = document.getElementById("direcciones");
  var plantillaDireccion = document.getElementById("plantilla-direccion");

  function camposDe(bloque) {
    return Array.prototype.slice.call(bloque.querySelectorAll("[data-campo]"));
  }

  DIRECCIONES.forEach(function (direccion, indice) {
    var nodo = plantillaDireccion.content.cloneNode(true);
    var bloque = nodo.querySelector("[data-direccion]");
    bloque.dataset.direccion = direccion.clave;
    bloque.setAttribute("aria-label", direccion.titulo);
    nodo.querySelector("[data-titulo]").innerHTML = direccion.titulo + ' <span class="text-red-600">*</span>';
    var provincia = nodo.querySelector('[data-campo="provincia"]');
    provincia.innerHTML =
      '<option value="">Elegir…</option>' +
      PROVINCIAS.map(function (nombre) {
        return "<option>" + nombre + "</option>";
      }).join("");
    if (indice > 0) {
      var igual = nodo.querySelector("[data-igual]");
      igual.classList.remove("hidden");
      igual.classList.add("flex");
      igual.querySelector("input").addEventListener("change", function (evento) {
        var copiar = evento.target.checked;
        var legal = contenedorDirecciones.querySelector('[data-direccion="legal"]');
        camposDe(bloque).forEach(function (campo) {
          if (copiar) campo.value = legal.querySelector('[data-campo="' + campo.dataset.campo + '"]').value;
          campo.disabled = copiar;
        });
      });
    }
    contenedorDirecciones.appendChild(nodo);
  });

  // Si cambia la direccion legal, se actualizan las marcadas como "igual".
  contenedorDirecciones.querySelector('[data-direccion="legal"]').addEventListener("input", function (evento) {
    var nombre = evento.target.dataset.campo;
    if (!nombre) return;
    Array.prototype.forEach.call(contenedorDirecciones.querySelectorAll("[data-direccion]"), function (bloque) {
      var igual = bloque.querySelector("[data-igual] input");
      if (igual && igual.checked) bloque.querySelector('[data-campo="' + nombre + '"]').value = evento.target.value;
    });
  });

  function leerDireccion(bloque) {
    var datos = {};
    camposDe(bloque).forEach(function (campo) {
      datos[campo.dataset.campo] = campo.value;
    });
    return datos;
  }

  // --- Transportes ---
  var contenedorTransportes = document.getElementById("transportes");
  var plantillaTransporte = document.getElementById("plantilla-transporte");
  [["usual", "Transporte usual"], ["alternativo", "Transporte alternativo"]].forEach(function (par) {
    var nodo = plantillaTransporte.content.cloneNode(true);
    nodo.querySelector("[data-transporte]").dataset.transporte = par[0];
    nodo.querySelector("[data-titulo]").textContent = par[1];
    contenedorTransportes.appendChild(nodo);
  });

  function leerTransporte(clave) {
    var datos = {};
    camposDe(contenedorTransportes.querySelector('[data-transporte="' + clave + '"]')).forEach(function (campo) {
      datos[campo.dataset.campo] = campo.value;
    });
    return datos;
  }

  // --- Referencias comerciales ---
  var contenedorReferencias = document.getElementById("referencias");
  var plantillaReferencia = document.getElementById("plantilla-referencia");
  for (var i = 0; i < REFERENCIAS; i += 1) contenedorReferencias.appendChild(plantillaReferencia.content.cloneNode(true));

  // --- Documentos ---
  var contenedorDocumentos = document.getElementById("documentos");
  var plantillaDocumento = document.getElementById("plantilla-documento");
  var totalAdjuntos = document.getElementById("total-adjuntos");

  function bytesTotales() {
    return Object.keys(archivos).reduce(function (suma, clave) {
      return suma + archivos[clave].size;
    }, 0);
  }

  function pintarTotal() {
    var total = bytesTotales() + (firmada ? 30 * 1024 : 0);
    totalAdjuntos.textContent = total ? "Llevás " + DP.tamano(total) + " de 4 MB." : "";
    totalAdjuntos.className = total > DP.MAX_BYTES ? "font-semibold text-red-700" : "font-medium text-slate-800";
  }

  DOCUMENTOS.forEach(function (documento) {
    var nodo = plantillaDocumento.content.cloneNode(true);
    var etiqueta = nodo.querySelector("[data-documento]");
    var estado = nodo.querySelector("[data-estado]");
    nodo.querySelector("[data-titulo]").textContent = documento.titulo;
    var entrada = nodo.querySelector("input");
    entrada.addEventListener("change", function () {
      var archivo = entrada.files[0];
      entrada.value = "";
      if (!archivo) return;
      if (!DP.tipoValido(archivo)) {
        DP.error(documento.titulo + ": solo se aceptan PDF o imágenes (JPG, PNG, WEBP).");
        return;
      }
      DP.error("");
      archivos[documento.campo] = archivo;
      estado.textContent = "✓ " + archivo.name + " · " + DP.tamano(archivo.size);
      estado.className = "block truncate text-xs font-medium text-emerald-700";
      etiqueta.classList.remove("border-amber-200");
      etiqueta.classList.add("border-emerald-300");
      pintarTotal();
    });
    contenedorDocumentos.appendChild(nodo);
  });

  // --- Firma ---
  var lienzo = document.getElementById("firma");
  var contexto = lienzo.getContext("2d");
  var firmando = false;
  var firmada = false;

  function ajustarLienzo() {
    var escala = window.devicePixelRatio || 1;
    var caja = lienzo.getBoundingClientRect();
    lienzo.width = caja.width * escala;
    lienzo.height = caja.height * escala;
    contexto.setTransform(escala, 0, 0, escala, 0, 0);
    contexto.lineWidth = 2.2;
    contexto.lineCap = "round";
    contexto.lineJoin = "round";
    contexto.strokeStyle = "#1b2b5e";
    firmada = false;
  }

  function punto(evento) {
    var caja = lienzo.getBoundingClientRect();
    return { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
  }

  lienzo.addEventListener("pointerdown", function (evento) {
    firmando = true;
    lienzo.setPointerCapture(evento.pointerId);
    var p = punto(evento);
    contexto.beginPath();
    contexto.moveTo(p.x, p.y);
  });
  lienzo.addEventListener("pointermove", function (evento) {
    if (!firmando) return;
    var p = punto(evento);
    contexto.lineTo(p.x, p.y);
    contexto.stroke();
    firmada = true;
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (tipo) {
    lienzo.addEventListener(tipo, function () {
      if (firmando) pintarTotal();
      firmando = false;
    });
  });
  document.getElementById("limpiar-firma").addEventListener("click", function () {
    contexto.clearRect(0, 0, lienzo.width, lienzo.height);
    firmada = false;
    pintarTotal();
  });
  ajustarLienzo();
  window.addEventListener("resize", function () {
    // Cambiar el tamano borra el dibujo: se avisa solo si ya habia firma.
    if (!firmada) ajustarLienzo();
  });

  // --- Validaciones propias ---
  function cuitValido(valor) {
    var digitos = valor.replace(/\D/g, "");
    if (digitos.length !== 11) return false;
    var pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    var suma = 0;
    for (var j = 0; j < 10; j += 1) suma += pesos[j] * Number(digitos[j]);
    var resto = 11 - (suma % 11);
    var verificador = resto === 11 ? 0 : resto;
    return verificador !== 10 && verificador === Number(digitos[10]);
  }

  function marcadas(nombre) {
    return Array.prototype.filter
      .call(formulario.querySelectorAll('input[name="' + nombre + '"]'), function (campo) {
        return campo.checked;
      })
      .map(function (campo) {
        return campo.value;
      });
  }

  function validar() {
    if (marcadas("rubro").length === 0 && !formulario.rubroOtro.value.trim()) return "Elegí al menos un rubro.";
    if (!formulario.checkValidity()) {
      formulario.reportValidity();
      return "Revisá los campos marcados.";
    }
    if (!cuitValido(formulario.cuit.value)) return "El CUIT no es válido. Revisá los 11 dígitos.";
    if (formulario.envio.value === "transporte") {
      var usual = leerTransporte("usual");
      if (!(usual.razonSocial || usual.fantasia) || !usual.direccion || !(usual.telDireccion || usual.telDestino)) {
        return "Completá el transporte usual: nombre o razón social, dirección en Bs. As. y teléfono.";
      }
    }
    var referencias = leerReferencias();
    if (referencias.length === 0) return "Indicá al menos una referencia comercial.";
    var faltante = DOCUMENTOS.find(function (documento) {
      return !archivos[documento.campo];
    });
    if (faltante) return "Falta adjuntar: " + faltante.titulo + ".";
    if (bytesTotales() > DP.MAX_BYTES - 200 * 1024) return "Los archivos superan los 4 MB en total. Probá con archivos más livianos.";
    if (!firmada) return "Falta la firma.";
    return "";
  }

  function leerReferencias() {
    return Array.prototype.map
      .call(contenedorReferencias.querySelectorAll("[data-referencia]"), function (fila) {
        var datos = {};
        camposDe(fila).forEach(function (campo) {
          datos[campo.dataset.campo] = campo.value.trim();
        });
        return datos;
      })
      .filter(function (ref) {
        return ref.empresa;
      });
  }

  // --- Envio ---
  formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();
    DP.error("");
    var problema = validar();
    if (problema) {
      DP.error(problema);
      return;
    }

    var direcciones = {};
    Array.prototype.forEach.call(contenedorDirecciones.querySelectorAll("[data-direccion]"), function (bloque) {
      direcciones[bloque.dataset.direccion] = leerDireccion(bloque);
    });

    var datos = {
      rubro: marcadas("rubro"),
      rubroOtro: formulario.rubroOtro.value,
      antiguedad: formulario.antiguedad.value,
      antiguedadOtro: formulario.antiguedadOtro.value,
      puntosVenta: formulario.puntosVenta.value,
      empleados: formulario.empleados.value,
      frecuencia: formulario.frecuencia.value,
      frecuenciaOtro: formulario.frecuenciaOtro.value,
      nombreFantasia: formulario.nombreFantasia.value,
      razonSocial: formulario.razonSocial.value,
      cuit: formulario.cuit.value,
      fechaConstitucion: formulario.fechaConstitucion.value,
      direcciones: direcciones,
      telefono: formulario.telefono.value,
      email: formulario.email.value,
      envio: formulario.envio.value,
      transporteUsual: leerTransporte("usual"),
      transporteAlternativo: leerTransporte("alternativo"),
      referencias: leerReferencias(),
    };

    var cuerpo = new FormData();
    cuerpo.set("datos", JSON.stringify(datos));
    cuerpo.set("sitio_web", formulario.sitio_web.value);
    cuerpo.set("firma", lienzo.toDataURL("image/png"));
    DOCUMENTOS.forEach(function (documento) {
      cuerpo.set(documento.campo, archivos[documento.campo]);
    });

    DP.ocupado(boton, true, "Enviando…");
    DP.enviar("/api/publico/altas", cuerpo)
      .then(function () {
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
