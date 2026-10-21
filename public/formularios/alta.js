/* Formulario publico de Alta de Clientes (4 pasos + documentacion + firma). */
(function () {
  "use strict";

  var PAISES = [
    { nombre: "Argentina", codigo: "AR", centro: [-34.714, -58.5157] },
    { nombre: "Uruguay", codigo: "UY", centro: [-34.9055, -56.186] },
    { nombre: "Brasil", codigo: "BR", centro: [-23.5739, -46.6269] },
    { nombre: "Chile", codigo: "CL", centro: [-33.4817, -70.6423] },
    { nombre: "Paraguay", codigo: "PY", centro: [-25.289, -57.5795] },
    { nombre: "Bolivia", codigo: "BO", centro: [-16.5126, -68.1178] },
    { nombre: "Perú", codigo: "PE", centro: [-12.0427, -77.0414] },
    { nombre: "México", codigo: "MX", centro: [19.3586, -99.1121] },
    { nombre: "Estados Unidos", codigo: "US", centro: [38.9034, -77.0373] },
    { nombre: "Colombia", codigo: "CO", centro: [4.6938, -74.0809] },
    { nombre: "Ecuador", codigo: "EC", centro: [-0.2306, -78.5138] },
    { nombre: "Venezuela", codigo: "VE", centro: [10.4651, -66.9066] },
    { nombre: "Panamá", codigo: "PA", centro: [9.3576, -79.9025] },
    { nombre: "Costa Rica", codigo: "CR", centro: [9.9346, -84.0876] },
    { nombre: "Guatemala", codigo: "GT", centro: [14.6253, -90.5177] },
    { nombre: "Honduras", codigo: "HN", centro: [14.0552, -87.2133] },
    { nombre: "El Salvador", codigo: "SV", centro: [13.6917, -89.2102] },
  ];
  var TIPOS_ID = ["CUIT", "CNPJ", "CPF", "RUT", "RUC", "NIT", "RFC", "EIN", "BN", "RTN", "NITE", "Cédula Jurídica", "RIF", "RNC", "TRN", "BIR", "NIF", "TIN"];
  var DIRECCIONES = [
    { clave: "legal", titulo: "Dirección legal", requerida: true },
    { clave: "sucursal", titulo: "Dirección de sucursal", requerida: false },
    { clave: "comercial", titulo: "Dirección comercial", requerida: false },
  ];
  // En el orden de la planilla (dos columnas). soloCuit: obligatorio solo con CUIT.
  var DOCUMENTOS = [
    { campo: "doc_cm05", titulo: "Formulario CM05 de IIBB", soloCuit: true },
    { campo: "doc_cargas", titulo: "Última DDJJ cargas sociales", soloCuit: true },
    { campo: "doc_legajo", titulo: "Legajo impositivo", soloCuit: true },
    { campo: "doc_ganancias", titulo: "Última DDJJ Ganancias", soloCuit: true },
    { campo: "doc_cuit", titulo: "Constancia de CUIT", soloCuit: false },
    { campo: "doc_estatuto", titulo: "Contrato social / Estatuto", soloCuit: false },
    { campo: "doc_iva", titulo: "Declaración jurada IVA", soloCuit: true },
    { campo: "doc_balance", titulo: "Último balance", soloCuit: false },
  ];
  var TOTAL_PASOS = 4;

  var formulario = document.getElementById("formulario");
  var paso = 1;
  var archivos = {};
  var firma = "";
  var mapas = {};

  function $(selector, raiz) {
    return (raiz || document).querySelector(selector);
  }
  function $$(selector, raiz) {
    return Array.prototype.slice.call((raiz || document).querySelectorAll(selector));
  }
  function esCuit() {
    return formulario.tipoIdFiscal.value === "CUIT";
  }

  // --- Paso 1: canal, ID fiscal y direcciones ---
  formulario.canal.addEventListener("change", function () {
    var otro = formulario.canal.value === "Otro";
    formulario.canalOtro.classList.toggle("hidden", !otro);
    if (otro) formulario.canalOtro.focus();
  });

  formulario.tipoIdFiscal.innerHTML =
    '<option value="">Elegí…</option>' + TIPOS_ID.map(function (tipo) { return "<option>" + tipo + "</option>"; }).join("");
  formulario.tipoIdFiscal.value = "CUIT";
  formulario.tipoIdFiscal.addEventListener("change", actualizarSegunId);

  var plantillaDireccion = document.getElementById("plantilla-direccion");
  DIRECCIONES.forEach(function (definicion) {
    var nodo = plantillaDireccion.content.cloneNode(true);
    var bloque = $("[data-direccion]", nodo);
    bloque.dataset.direccion = definicion.clave;
    $("[data-titulo]", nodo).innerHTML = definicion.titulo + (definicion.requerida ? ' <span class="requerido">*</span>' : "");
    var pais = $('[data-campo="pais"]', nodo);
    pais.innerHTML = PAISES.map(function (p) { return "<option>" + p.nombre + "</option>"; }).join("");
    var entrada = $('[data-campo="direccion"]', nodo);
    entrada.required = definicion.requerida;
    entrada.setAttribute("aria-label", definicion.titulo);
    document.getElementById("direcciones").appendChild(nodo);
    prepararDireccion(bloque);
  });

  function paisDe(bloque) {
    var nombre = $('[data-campo="pais"]', bloque).value;
    return PAISES.find(function (p) { return p.nombre === nombre; }) || PAISES[0];
  }

  function prepararDireccion(bloque) {
    var clave = bloque.dataset.direccion;
    var entrada = $('[data-campo="direccion"]', bloque);
    var lista = $("[data-sugerencias]", bloque);
    var pais = $('[data-campo="pais"]', bloque);

    if (window.L) {
      var mapa = L.map($("[data-mapa]", bloque), { scrollWheelZoom: false }).setView(PAISES[0].centro, 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(mapa);
      mapas[clave] = { mapa: mapa, marcador: L.marker(PAISES[0].centro).addTo(mapa) };
    } else {
      $("[data-mapa]", bloque).classList.add("hidden");
    }

    function ubicar(lat, lng, zoom) {
      bloque.dataset.lat = lat;
      bloque.dataset.lng = lng;
      if (mapas[clave]) {
        mapas[clave].mapa.setView([lat, lng], zoom);
        mapas[clave].marcador.setLatLng([lat, lng]);
      }
    }

    pais.addEventListener("change", function () {
      var elegido = paisDe(bloque);
      delete bloque.dataset.lat;
      delete bloque.dataset.lng;
      if (mapas[clave]) {
        mapas[clave].mapa.setView(elegido.centro, 5);
        mapas[clave].marcador.setLatLng(elegido.centro);
      }
    });

    // Autocompletado con Photon (OpenStreetMap). Se prioriza el pais elegido.
    function buscar(texto, limite) {
      var elegido = paisDe(bloque);
      var url =
        "https://photon.komoot.io/api/?q=" + encodeURIComponent(texto) +
        "&limit=" + limite + "&lat=" + elegido.centro[0] + "&lon=" + elegido.centro[1];
      return fetch(url)
        .then(function (r) { return r.ok ? r.json() : { features: [] }; })
        .then(function (datos) {
          return (datos.features || []).filter(function (f) {
            return !f.properties.countrycode || f.properties.countrycode === elegido.codigo;
          });
        })
        .catch(function () { return []; });
    }

    function describir(f) {
      var p = f.properties;
      var calle = p.street ? p.street + (p.housenumber ? " " + p.housenumber : "") : p.name;
      return [calle, p.city || p.district, p.state, p.country].filter(Boolean).join(", ");
    }

    function elegir(f) {
      entrada.value = describir(f);
      bloque.dataset.provincia = f.properties.state || "";
      lista.classList.add("hidden");
      ubicar(f.geometry.coordinates[1], f.geometry.coordinates[0], 15);
    }

    var espera;
    entrada.addEventListener("input", function () {
      delete bloque.dataset.lat;
      delete bloque.dataset.lng;
      bloque.dataset.provincia = "";
      clearTimeout(espera);
      var texto = entrada.value.trim();
      if (texto.length < 4) return lista.classList.add("hidden");
      espera = setTimeout(function () {
        buscar(texto, 5).then(function (resultados) {
          lista.innerHTML = "";
          resultados.forEach(function (f) {
            var item = document.createElement("li");
            item.className = "cursor-pointer px-3 py-1.5 hover:bg-slate-100";
            item.textContent = describir(f);
            item.addEventListener("mousedown", function (evento) {
              evento.preventDefault();
              elegir(f);
            });
            lista.appendChild(item);
          });
          lista.classList.toggle("hidden", resultados.length === 0);
        });
      }, 400);
    });
    // Si escribio la direccion sin elegir de la lista, se ubica sola al salir.
    entrada.addEventListener("blur", function () {
      setTimeout(function () { lista.classList.add("hidden"); }, 150);
      var texto = entrada.value.trim();
      if (!texto || bloque.dataset.lat) return;
      buscar(texto, 1).then(function (resultados) {
        if (resultados[0]) {
          bloque.dataset.provincia = resultados[0].properties.state || "";
          ubicar(resultados[0].geometry.coordinates[1], resultados[0].geometry.coordinates[0], 15);
        }
      });
    });
  }

  function leerDireccion(clave) {
    var bloque = $('[data-direccion="' + clave + '"]');
    return {
      pais: $('[data-campo="pais"]', bloque).value,
      direccion: $('[data-campo="direccion"]', bloque).value,
      provincia: bloque.dataset.provincia || "",
      lat: bloque.dataset.lat || "",
      lng: bloque.dataset.lng || "",
    };
  }

  // --- Paso 2: industria ---
  formulario.industria.addEventListener("change", function () {
    var retail = formulario.industria.value === "Retail / Distribuidora";
    document.getElementById("bloque-puntos-venta").classList.toggle("hidden", !retail);
    formulario.puntosVenta.required = retail;
    var otra = formulario.industria.value === "Otros";
    formulario.industriaOtra.classList.toggle("hidden", !otra);
  });

  // --- Paso 3: transporte ---
  formulario.usaTransporte.addEventListener("change", function () {
    document.getElementById("bloque-transportista").classList.toggle("hidden", !formulario.usaTransporte.checked);
  });

  // --- Paso 4: referencias, documentos y firma ---
  var plantillaReferencia = document.getElementById("plantilla-referencia");
  for (var i = 0; i < 3; i += 1) document.getElementById("referencias").appendChild(plantillaReferencia.content.cloneNode(true));

  var plantillaDocumento = document.getElementById("plantilla-documento");
  DOCUMENTOS.forEach(function (documento) {
    var nodo = plantillaDocumento.content.cloneNode(true);
    var etiqueta = $("[data-documento]", nodo);
    etiqueta.dataset.documento = documento.campo;
    var estado = $("[data-estado]", nodo);
    estado.textContent = "Haga clic para adjuntar " + documento.titulo;
    var entrada = $("input", nodo);
    entrada.setAttribute("aria-label", documento.titulo);
    entrada.addEventListener("change", function () {
      var archivo = entrada.files[0];
      entrada.value = "";
      if (!archivo) return;
      if (!DP.tipoValido(archivo)) return DP.error(documento.titulo + ": solo PDF o imágenes (JPG, PNG, WEBP).");
      DP.error("");
      archivos[documento.campo] = archivo;
      estado.textContent = "✓ " + documento.titulo + " · " + archivo.name;
      etiqueta.classList.remove("bg-[#fdf3c4]");
      etiqueta.classList.add("bg-emerald-50", "text-emerald-800");
      pintarTotal();
    });
    document.getElementById("documentos").appendChild(nodo);
  });

  function bytesTotales() {
    return Object.keys(archivos).reduce(function (suma, clave) { return suma + archivos[clave].size; }, 0) + firma.length * 0.75;
  }
  function pintarTotal() {
    var total = bytesTotales();
    var caja = document.getElementById("total-adjuntos");
    caja.textContent = total ? "Llevás " + DP.tamano(total) + " de 4 MB." : "";
    caja.className = total > DP.MAX_BYTES ? "font-semibold text-red-700" : "font-medium text-slate-800";
  }

  function actualizarSegunId() {
    var cuit = esCuit();
    document.getElementById("ayuda-id").textContent = cuit ? "11 dígitos, con o sin guiones" : "Respetá el formato de tu ID";
    DOCUMENTOS.forEach(function (documento) {
      var etiqueta = $('[data-documento="' + documento.campo + '"]');
      $("[data-asterisco]", etiqueta).classList.toggle("hidden", documento.soloCuit && !cuit);
      if (documento.campo === "doc_cuit" && !archivos.doc_cuit) {
        $("[data-estado]", etiqueta).textContent = "Haga clic para adjuntar Constancia de " + (cuit ? "CUIT" : "ID fiscal");
      }
    });
  }
  actualizarSegunId();

  // Firma en un modal con lienzo.
  var modalFirma = document.getElementById("modal-firma");
  var lienzo = document.getElementById("lienzo-firma");
  var contexto = lienzo.getContext("2d");
  var dibujando = false;
  var trazos = false;

  function prepararLienzo() {
    var escala = window.devicePixelRatio || 1;
    var caja = lienzo.getBoundingClientRect();
    lienzo.width = caja.width * escala;
    lienzo.height = caja.height * escala;
    contexto.setTransform(escala, 0, 0, escala, 0, 0);
    contexto.lineWidth = 2.2;
    contexto.lineCap = "round";
    contexto.lineJoin = "round";
    contexto.strokeStyle = "#193e76";
    trazos = false;
  }
  function punto(evento) {
    var caja = lienzo.getBoundingClientRect();
    return { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
  }
  lienzo.addEventListener("pointerdown", function (evento) {
    dibujando = true;
    lienzo.setPointerCapture(evento.pointerId);
    var p = punto(evento);
    contexto.beginPath();
    contexto.moveTo(p.x, p.y);
  });
  lienzo.addEventListener("pointermove", function (evento) {
    if (!dibujando) return;
    var p = punto(evento);
    contexto.lineTo(p.x, p.y);
    contexto.stroke();
    trazos = true;
  });
  ["pointerup", "pointercancel"].forEach(function (tipo) {
    lienzo.addEventListener(tipo, function () { dibujando = false; });
  });
  function cerrarFirma() {
    modalFirma.classList.add("hidden");
    modalFirma.classList.remove("flex");
  }
  document.getElementById("abrir-firma").addEventListener("click", function () {
    modalFirma.classList.remove("hidden");
    modalFirma.classList.add("flex");
    prepararLienzo();
  });
  document.getElementById("borrar-firma").addEventListener("click", prepararLienzo);
  document.getElementById("cancelar-firma").addEventListener("click", cerrarFirma);
  document.getElementById("guardar-firma").addEventListener("click", function () {
    if (!trazos) return;
    firma = lienzo.toDataURL("image/png");
    var vista = document.getElementById("vista-firma");
    vista.src = firma;
    vista.classList.remove("hidden");
    document.getElementById("estado-firma").textContent = "Firmado ✓";
    cerrarFirma();
    pintarTotal();
  });

  // --- Validacion ---
  function cuitValido(valor) {
    var d = valor.replace(/\D/g, "");
    if (d.length !== 11) return false;
    var pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    var suma = 0;
    for (var j = 0; j < 10; j += 1) suma += pesos[j] * Number(d[j]);
    var resto = 11 - (suma % 11);
    var verificador = resto === 11 ? 0 : resto;
    return verificador !== 10 && verificador === Number(d[10]);
  }

  function camposValidos(seccion) {
    var campos = $$("input, select, textarea", seccion).filter(function (campo) {
      return !campo.closest(".hidden") && campo.type !== "file";
    });
    for (var k = 0; k < campos.length; k += 1) {
      if (!campos[k].checkValidity()) {
        campos[k].reportValidity();
        return false;
      }
    }
    return true;
  }

  function leerReferencias() {
    return $$("[data-referencia]").map(function (fila) {
      var datos = {};
      $$("[data-campo]", fila).forEach(function (campo) { datos[campo.dataset.campo] = campo.value.trim(); });
      return datos;
    });
  }

  function leerTransportista() {
    var datos = {};
    $$("#transportista [data-campo]").forEach(function (campo) { datos[campo.dataset.campo] = campo.value.trim(); });
    return datos;
  }

  function problemaDelPaso(numero) {
    var seccion = $('[data-paso="' + numero + '"]');
    if (!camposValidos(seccion)) return "Revisá los campos marcados.";
    if (numero === 1) {
      if (esCuit() && !cuitValido(formulario.idFiscal.value)) return "El CUIT no es válido. Revisá los 11 dígitos.";
    }
    if (numero === 3) {
      if (!formulario.retiraCliente.checked && !formulario.usaTransporte.checked) return "Indicá si retirás vos o si usás transporte.";
      if (formulario.usaTransporte.checked) {
        var t = leerTransportista();
        if (!(t.fantasia || t.razonSocial) || !t.telefono) return "Completá el nombre y el teléfono del transportista.";
      }
    }
    if (numero === 4) {
      var referencias = leerReferencias();
      if (referencias.some(function (r) { return !r.empresa; })) return "Completá las tres referencias comerciales.";
      if (referencias.some(function (r) { return !r.email && !r.telefono; })) return "Cada referencia necesita un email o un teléfono.";
      var faltante = DOCUMENTOS.find(function (d) { return !archivos[d.campo] && (esCuit() || !d.soloCuit); });
      if (faltante) return "Falta adjuntar: " + faltante.titulo + ".";
      if (bytesTotales() > DP.MAX_BYTES - 200 * 1024) return "Los archivos superan los 4 MB en total. Probá con archivos más livianos.";
      if (!firma) return "Falta la firma: hacé clic en \"Haga clic aquí para firmar\".";
    }
    return "";
  }

  // --- Pasos ---
  function mostrarPaso(numero) {
    paso = numero;
    $$("[data-paso]").forEach(function (seccion) {
      seccion.classList.toggle("hidden", Number(seccion.dataset.paso) !== paso);
    });
    $$("[data-indicador]").forEach(function (indicador) {
      indicador.classList.toggle("activo", Number(indicador.dataset.indicador) <= paso);
    });
    document.getElementById("numero-paso").textContent = paso;
    document.getElementById("anterior").classList.toggle("hidden", paso === 1);
    document.getElementById("siguiente").classList.toggle("hidden", paso === TOTAL_PASOS);
    document.getElementById("enviar").classList.toggle("hidden", paso !== TOTAL_PASOS);
    DP.error("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (paso === 1) {
      setTimeout(function () {
        Object.keys(mapas).forEach(function (clave) { mapas[clave].mapa.invalidateSize(); });
      }, 150);
    }
  }

  document.getElementById("anterior").addEventListener("click", function () { mostrarPaso(paso - 1); });
  document.getElementById("siguiente").addEventListener("click", function () {
    var problema = problemaDelPaso(paso);
    if (problema) return DP.error(problema);
    mostrarPaso(paso + 1);
  });

  // --- Envio ---
  formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();
    for (var n = 1; n <= TOTAL_PASOS; n += 1) {
      var problema = problemaDelPaso(n);
      if (problema) {
        if (n !== paso) mostrarPaso(n);
        return DP.error(problema);
      }
    }

    var datos = {
      canal: formulario.canal.value,
      canalOtro: formulario.canalOtro.value,
      nombreFantasia: formulario.nombreFantasia.value,
      razonSocial: formulario.razonSocial.value,
      tipoIdFiscal: formulario.tipoIdFiscal.value,
      idFiscal: formulario.idFiscal.value,
      telefono: formulario.telefono.value,
      responsable: formulario.responsable.value,
      email: formulario.email.value,
      direcciones: { legal: leerDireccion("legal"), sucursal: leerDireccion("sucursal"), comercial: leerDireccion("comercial") },
      industria: formulario.industria.value,
      industriaOtra: formulario.industriaOtra.value,
      puntosVenta: formulario.puntosVenta.value,
      antiguedad: formulario.antiguedad.value,
      empleados: formulario.empleados.value,
      tipoCompra: formulario.tipoCompra.value,
      retiraCliente: formulario.retiraCliente.checked,
      usaTransporte: formulario.usaTransporte.checked,
      transportista: leerTransportista(),
      referencias: leerReferencias(),
      aceptaTerminos: formulario.aceptaTerminos.checked,
    };

    var cuerpo = new FormData();
    cuerpo.set("datos", JSON.stringify(datos));
    cuerpo.set("sitio_web", formulario.sitio_web.value);
    cuerpo.set("firma", firma);
    Object.keys(archivos).forEach(function (campo) { cuerpo.set(campo, archivos[campo]); });

    var boton = document.getElementById("enviar");
    DP.ocupado(boton, true, "Enviando…");
    DP.enviar("/api/publico/altas", cuerpo)
      .then(function () {
        var exito = document.getElementById("enviado");
        exito.classList.remove("hidden");
        exito.classList.add("flex");
      })
      .catch(function (causa) {
        DP.error(causa.message);
        DP.ocupado(boton, false);
      });
  });

  mostrarPaso(1);
})();
