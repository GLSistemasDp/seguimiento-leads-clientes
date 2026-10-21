/*
 * Formulario publico de Alta de Clientes (4 pasos + documentacion + firma).
 * La navegacion nunca bloquea: si falta algo se avisa y se marca, y se puede
 * seguir y volver. Solo el envio final exige que este todo.
 */
(function () {
  "use strict";

  // Provincias con un punto de referencia para centrar el mapa y las sugerencias.
  var PROVINCIAS = [
    ["Buenos Aires", -34.65, -58.55], ["CABA", -34.6037, -58.3816], ["Catamarca", -28.4696, -65.7852],
    ["Chaco", -27.4514, -58.9867], ["Chubut", -43.3002, -65.1023], ["Córdoba", -31.4201, -64.1888],
    ["Corrientes", -27.4692, -58.8306], ["Entre Ríos", -31.7333, -60.5297], ["Formosa", -26.1775, -58.1781],
    ["Jujuy", -24.1858, -65.2995], ["La Pampa", -36.6167, -64.2833], ["La Rioja", -29.4131, -66.8558],
    ["Mendoza", -32.8895, -68.8458], ["Misiones", -27.3621, -55.9009], ["Neuquén", -38.9516, -68.0591],
    ["Río Negro", -40.8135, -62.9967], ["Salta", -24.7821, -65.4232], ["San Juan", -31.5375, -68.5364],
    ["San Luis", -33.3017, -66.3378], ["Santa Cruz", -51.623, -69.2168], ["Santa Fe", -32.9468, -60.6393],
    ["Santiago del Estero", -27.7951, -64.2615], ["Tierra del Fuego", -54.8019, -68.303], ["Tucumán", -26.8083, -65.2176],
  ];
  var CENTRO_INICIAL = [-34.714, -58.5157];
  var DIRECCIONES = [
    { clave: "legal", titulo: "Dirección legal", requerida: true },
    { clave: "sucursal", titulo: "Dirección de sucursal", requerida: false },
    { clave: "comercial", titulo: "Dirección comercial", requerida: false },
  ];
  // En el orden de la planilla (dos columnas). Todos obligatorios.
  var DOCUMENTOS = [
    { campo: "doc_cm05", titulo: "Formulario CM05 de IIBB" },
    { campo: "doc_cargas", titulo: "Última DDJJ cargas sociales" },
    { campo: "doc_legajo", titulo: "Legajo impositivo" },
    { campo: "doc_ganancias", titulo: "Última DDJJ Ganancias" },
    { campo: "doc_cuit", titulo: "Constancia de CUIT" },
    { campo: "doc_estatuto", titulo: "Contrato social / Estatuto" },
    { campo: "doc_iva", titulo: "Declaración jurada IVA" },
    { campo: "doc_balance", titulo: "Último balance" },
  ];
  var TOTAL_PASOS = 4;
  var NOMBRES_PASO = ["", "Datos del cliente", "Empresa", "Envío", "Referencias y documentos"];

  var formulario = document.getElementById("formulario");
  var aviso = document.getElementById("aviso-paso");
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
  function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // --- Paso 1 ---
  formulario.canal.addEventListener("change", function () {
    var otro = formulario.canal.value === "Otro";
    formulario.canalOtro.classList.toggle("hidden", !otro);
    if (otro) formulario.canalOtro.focus();
  });

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

  // El digito verificador no bloquea: solo se avisa.
  formulario.cuit.addEventListener("input", function () {
    var ayuda = document.getElementById("ayuda-cuit");
    var digitos = formulario.cuit.value.replace(/\D/g, "");
    if (digitos.length === 11 && !cuitValido(digitos)) {
      ayuda.textContent = "Revisá el CUIT: el último dígito no coincide (podés seguir igual).";
      ayuda.className = "mt-1 text-[11px] font-medium text-amber-700";
    } else {
      ayuda.textContent = "11 números, con o sin guiones";
      ayuda.className = "mt-1 text-[11px] text-slate-500";
    }
  });

  // --- Direcciones con provincia, autocompletado y mapa ---
  var plantillaDireccion = document.getElementById("plantilla-direccion");
  DIRECCIONES.forEach(function (definicion) {
    var nodo = plantillaDireccion.content.cloneNode(true);
    var bloque = $("[data-direccion]", nodo);
    bloque.dataset.direccion = definicion.clave;
    $("[data-titulo]", nodo).innerHTML = definicion.titulo + (definicion.requerida ? ' <span class="requerido">*</span>' : "");
    var provincia = $('[data-campo="provincia"]', nodo);
    provincia.innerHTML =
      '<option value="">Provincia…</option>' +
      PROVINCIAS.map(function (p) { return "<option>" + p[0] + "</option>"; }).join("");
    provincia.required = definicion.requerida;
    var entrada = $('[data-campo="direccion"]', nodo);
    entrada.required = definicion.requerida;
    entrada.setAttribute("aria-label", definicion.titulo);
    document.getElementById("direcciones").appendChild(nodo);
    prepararDireccion(bloque);
  });

  function centroDe(bloque) {
    var nombre = $('[data-campo="provincia"]', bloque).value;
    var provincia = PROVINCIAS.find(function (p) { return p[0] === nombre; });
    return provincia ? [provincia[1], provincia[2]] : CENTRO_INICIAL;
  }

  function prepararDireccion(bloque) {
    var clave = bloque.dataset.direccion;
    var entrada = $('[data-campo="direccion"]', bloque);
    var lista = $("[data-sugerencias]", bloque);
    var provincia = $('[data-campo="provincia"]', bloque);

    // Si el mapa no carga (sin internet, bloqueado), el formulario sigue igual.
    try {
      if (window.L) {
        var mapa = L.map($("[data-mapa]", bloque), { scrollWheelZoom: false }).setView(CENTRO_INICIAL, 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(mapa);
        mapas[clave] = { mapa: mapa, marcador: L.marker(CENTRO_INICIAL).addTo(mapa) };
      } else {
        $("[data-mapa]", bloque).classList.add("hidden");
      }
    } catch (error) {
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

    provincia.addEventListener("change", function () {
      delete bloque.dataset.lat;
      delete bloque.dataset.lng;
      var centro = centroDe(bloque);
      if (mapas[clave]) {
        mapas[clave].mapa.setView(centro, provincia.value === "CABA" ? 12 : 9);
        mapas[clave].marcador.setLatLng(centro);
      }
    });

    // Photon (OpenStreetMap): sugerencias de Argentina, priorizando la provincia elegida.
    function buscar(texto, limite) {
      var centro = centroDe(bloque);
      var consulta = provincia.value ? texto + ", " + provincia.value : texto;
      var url =
        "https://photon.komoot.io/api/?q=" + encodeURIComponent(consulta) +
        "&limit=" + limite + "&lat=" + centro[0] + "&lon=" + centro[1];
      return fetch(url)
        .then(function (r) { return r.ok ? r.json() : { features: [] }; })
        .then(function (datos) {
          return (datos.features || []).filter(function (f) { return f.properties.countrycode === "AR"; });
        })
        .catch(function () { return []; });
    }

    function describir(f) {
      var p = f.properties;
      var calle = p.street ? p.street + (p.housenumber ? " " + p.housenumber : "") : p.name;
      return [calle, p.city || p.district, p.state].filter(Boolean).join(", ");
    }

    function provinciaDe(f) {
      var estado = (f.properties.state || "").toLowerCase();
      if (/ciudad aut[oó]noma|capital federal/.test(estado)) return "CABA";
      var encontrada = PROVINCIAS.find(function (p) {
        return estado.normalize("NFD").replace(/[̀-ͯ]/g, "").indexOf(
          p[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        ) !== -1;
      });
      return encontrada ? encontrada[0] : "";
    }

    function elegir(f) {
      entrada.value = describir(f);
      lista.classList.add("hidden");
      var deLaSugerencia = provinciaDe(f);
      if (deLaSugerencia && !provincia.value) provincia.value = deLaSugerencia;
      ubicar(f.geometry.coordinates[1], f.geometry.coordinates[0], 15);
      limpiarMarca(entrada);
      limpiarMarca(provincia);
    }

    var espera;
    entrada.addEventListener("input", function () {
      delete bloque.dataset.lat;
      delete bloque.dataset.lng;
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
    entrada.addEventListener("blur", function () {
      setTimeout(function () { lista.classList.add("hidden"); }, 150);
      var texto = entrada.value.trim();
      if (!texto || bloque.dataset.lat) return;
      buscar(texto, 1).then(function (resultados) {
        if (resultados[0]) ubicar(resultados[0].geometry.coordinates[1], resultados[0].geometry.coordinates[0], 15);
      });
    });
  }

  function leerDireccion(clave) {
    var bloque = $('[data-direccion="' + clave + '"]');
    return {
      direccion: $('[data-campo="direccion"]', bloque).value,
      provincia: $('[data-campo="provincia"]', bloque).value,
      lat: bloque.dataset.lat || "",
      lng: bloque.dataset.lng || "",
    };
  }

  // --- Paso 2 ---
  formulario.industria.addEventListener("change", function () {
    var retail = formulario.industria.value === "Retail / Distribuidora";
    document.getElementById("bloque-puntos-venta").classList.toggle("hidden", !retail);
    formulario.puntosVenta.required = retail;
    formulario.industriaOtra.classList.toggle("hidden", formulario.industria.value !== "Otros");
  });

  // --- Paso 3 ---
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
      etiqueta.classList.remove("bg-[#fdf3c4]", "campo-invalido");
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
    document.getElementById("abrir-firma").classList.remove("campo-invalido");
    cerrarFirma();
    pintarTotal();
  });

  // --- Revision de cada paso (sin bloquear) ---
  function marcar(elemento) {
    elemento.classList.add("campo-invalido");
    elemento.setAttribute("aria-invalid", "true");
  }
  function limpiarMarca(elemento) {
    elemento.classList.remove("campo-invalido");
    elemento.removeAttribute("aria-invalid");
  }
  // Al corregir un campo se le saca la marca roja.
  formulario.addEventListener("input", function (evento) { limpiarMarca(evento.target); });
  formulario.addEventListener("change", function (evento) { limpiarMarca(evento.target); });

  function nombreDe(campo) {
    var etiqueta = campo.id ? $('label[for="' + campo.id + '"]') : null;
    var texto = campo.getAttribute("aria-label") || (etiqueta && etiqueta.textContent) || campo.placeholder || campo.name;
    return String(texto).replace("*", "").trim();
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

  /** Lo que falta en un paso. Si `marcarCampos`, ademas los pinta en rojo. */
  function faltantesDelPaso(numero, marcarCampos) {
    var seccion = $('[data-paso="' + numero + '"]');
    var faltantes = [];
    $$("input, select, textarea", seccion).forEach(function (campo) {
      if (campo.type === "file" || campo.closest(".hidden") || campo.checkValidity()) return;
      faltantes.push(nombreDe(campo));
      if (marcarCampos) marcar(campo);
    });

    if (numero === 1 && formulario.cuit.value.replace(/\D/g, "").length > 0 && formulario.cuit.value.replace(/\D/g, "").length !== 11) {
      faltantes.push("CUIT (tiene que tener 11 números)");
      if (marcarCampos) marcar(formulario.cuit);
    }
    if (numero === 3) {
      if (!formulario.retiraCliente.checked && !formulario.usaTransporte.checked) faltantes.push("Elegí retira cliente o envío por transporte");
      if (formulario.usaTransporte.checked) {
        var t = leerTransportista();
        if (!(t.fantasia || t.razonSocial)) faltantes.push("Nombre o razón social del transportista");
        if (!t.telefono) faltantes.push("Teléfono del transportista");
      }
    }
    if (numero === 4) {
      leerReferencias().forEach(function (r, indice) {
        var fila = $$("[data-referencia]")[indice];
        if (!r.empresa) {
          faltantes.push("Referencia " + (indice + 1) + ": empresa");
          if (marcarCampos) marcar($('[data-campo="empresa"]', fila));
        } else if (!r.email && !r.telefono) {
          faltantes.push("Referencia " + (indice + 1) + ": email o teléfono");
          if (marcarCampos) marcar($('[data-campo="email"]', fila));
        }
      });
      DOCUMENTOS.forEach(function (d) {
        if (archivos[d.campo]) return;
        faltantes.push(d.titulo);
        if (marcarCampos) marcar($('[data-documento="' + d.campo + '"]'));
      });
      if (bytesTotales() > DP.MAX_BYTES - 200 * 1024) faltantes.push("Los archivos superan los 4 MB: usá archivos más livianos");
      if (!firma) {
        faltantes.push("Firma");
        if (marcarCampos) marcar(document.getElementById("abrir-firma"));
      }
    }
    return faltantes;
  }

  function mostrarAviso(html) {
    aviso.innerHTML = html || "";
    aviso.classList.toggle("hidden", !html);
  }

  function actualizarIndicadores() {
    $$("[data-indicador]").forEach(function (indicador) {
      var numero = Number(indicador.dataset.indicador);
      indicador.classList.toggle("activo", numero <= paso);
      // Los pasos ya visitados que quedaron incompletos se marcan.
      var visitado = indicador.dataset.visitado === "1";
      indicador.classList.toggle("con-faltantes", visitado && numero !== paso && faltantesDelPaso(numero, false).length > 0);
    });
  }

  function mostrarPaso(numero) {
    $('[data-indicador="' + paso + '"]').dataset.visitado = "1";
    paso = Math.min(Math.max(numero, 1), TOTAL_PASOS);
    $$("[data-paso]").forEach(function (seccion) {
      seccion.classList.toggle("hidden", Number(seccion.dataset.paso) !== paso);
    });
    document.getElementById("numero-paso").textContent = paso;
    document.getElementById("anterior").classList.toggle("hidden", paso === 1);
    document.getElementById("siguiente").classList.toggle("hidden", paso === TOTAL_PASOS);
    document.getElementById("enviar").classList.toggle("hidden", paso !== TOTAL_PASOS);
    DP.error("");
    actualizarIndicadores();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (paso === 1) {
      setTimeout(function () {
        Object.keys(mapas).forEach(function (clave) { mapas[clave].mapa.invalidateSize(); });
      }, 150);
    }
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
  aviso.addEventListener("click", function (evento) {
    var ir = evento.target.closest("[data-ir]");
    if (!ir) return;
    var numero = Number(ir.dataset.ir);
    mostrarPaso(numero);
    faltantesDelPaso(numero, true);
  });

  // --- Envio: aca si tiene que estar todo ---
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
      canal: formulario.canal.value,
      canalOtro: formulario.canalOtro.value,
      nombreFantasia: formulario.nombreFantasia.value,
      razonSocial: formulario.razonSocial.value,
      cuit: formulario.cuit.value,
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
        // El error del servidor no deja el boton trabado: se puede corregir y reenviar.
        DP.error(causa.message);
        DP.ocupado(boton, false);
      });
  });

  mostrarPaso(1);
})();
