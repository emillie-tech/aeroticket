
/* --------------- helpers --------------- */
function safeGet(id) { return document.getElementById(id); }
function fmtUSD(v){ return `$${Number(v||0).toFixed(2)}`; }
function setError(id, msg) {
  const el = safeGet(id);
  if (!el) return;
  el.textContent = msg || "";
  if (msg) el.classList.add("visible");
  else el.classList.remove("visible");
}

/* --------------- estado --------------- */
let aeropuertos = [];
const tarifaExtras = { economica:100, clasica:150, business:250 };
const temporadasAltas = [
  { inicio: "2025-12-15", fin: "2026-01-05" },
  { inicio: "2025-03-20", fin: "2025-03-30" },
  { inicio: "2025-07-01", fin: "2025-07-31" }
];


/* --------------- estado - Adiciones para multi-paso --------------- */

// NUEVA VARIABLE para guardar datos intermedios entre pasos
let currentReservationData = null; 

// Mapeo de IDs de pasos para la barra de progreso (Inicializado dentro de 'initialize' para asegurar que el DOM esté listo)
let progressSteps = {};

/* --------------- NAVEGACIÓN Y BARRA DE PROGRESO --------------- */

function goToStep(stepNumber) {
    const s1 = safeGet("step1Container");
    const s2 = safeGet("step2Container");
    const success = safeGet("successScreen");
    const main = safeGet("main");
    
    // --- NUEVOS ELEMENTOS A CONTROLAR EN EL RESUMEN (Summary Section) ---
    // Asegúrate de que tu resumen de compra tenga el ID "resumenCard"
    const resumenCard = safeGet("resumenCard"); 
    // Asegúrate de que el contenedor de los botones de ticket tenga el ID "ticketActionsMain"
    const ticketActionsMain = safeGet("ticketActionsMain"); 
    // -------------------------------------------------------------------

    // Ocultar todas las secciones principales (formularios y éxito)
    s1 && s1.classList.add("hidden");
    s2 && s2.classList.add("hidden");
    success && success.classList.add("hidden");
    
    // Lógica para mostrar/ocultar los elementos del resumen lateral y el contenido principal
    if (stepNumber === 1 || stepNumber === 2) {
        main && main.classList.remove("hidden");
        resumenCard && resumenCard.classList.remove("hidden");
        ticketActionsMain && ticketActionsMain.classList.add("hidden"); // OCULTAR los botones en pasos 1 y 2
    } else if (stepNumber === 3) {
        // En el paso 3 (Éxito), ocultamos el contenedor principal (main) y el resumen lateral,
        // ya que el ticket de éxito aparece en un modal (successScreen).
        main && main.classList.add("hidden");
        resumenCard && resumenCard.classList.add("hidden"); // OCULTAR la tarjeta de resumen lateral
        ticketActionsMain && ticketActionsMain.classList.add("hidden"); // OCULTAR los botones laterales
    }

    // Lógica para mostrar el contenido del paso actual
    if (stepNumber === 1) {
        s1 && s1.classList.remove("hidden");
        updateProgressBar(1);
    } else if (stepNumber === 2) {
        // Asegurarse de que tenemos datos del paso 1 antes de avanzar
        if (!currentReservationData) {
            console.error("Datos de reserva faltantes para el Paso 2.");
            goToStep(1); 
            return;
        }
        s2 && s2.classList.remove("hidden");
        updateProgressBar(2);

        // Actualizar el mini-resumen en el formulario de pago (Paso 2)
        const calc = currentReservationData.calc;
        safeGet("paymentTotalDisplay").textContent = fmtUSD(calc.total);
        safeGet("paymentRouteDisplay").textContent = `${calc.aO.city} (${calc.aO.iata}) → ${calc.aD.city} (${calc.aD.iata})`;
        
    } else if (stepNumber === 3) {
        success && success.classList.remove("hidden");
        updateProgressBar(3);
        // Los botones de ticket ahora solo aparecerán dentro del modal #successScreen.
    }
}

/* --------------- cargar aeropuertos --------------- */
async function loadAirports() {
  try {
    const url = "https://aeroticket.proxy.beeceptor.com/airports";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Formato JSON inválido");
    aeropuertos = data;
    populateSelects();
    renderSummary();
    console.info("Aeropuertos cargados:", aeropuertos.length);
  } catch (err) {
    console.error("No se pudieron cargar los aeropuertos:", err);
    alert("No se pudieron cargar los aeropuertos. Revisa la consola y la ruta del archivo/endpoint.");
  }
}

/* --------------- poblar selects --------------- */
function populateSelects(){
  const origen = safeGet("origen");
  const destino = safeGet("destino");
  if (!origen || !destino) { console.error("Selects no encontrados"); return; }

  origen.innerHTML = '<option value="">Selecciona un aeropuerto...</option>';
  destino.innerHTML = '<option value="">Selecciona un aeropuerto...</option>';

  aeropuertos.forEach(a => {
    const text = `${a.city} (${a.iata}) — ${a.country_name}`;
    const o1 = document.createElement("option");
    o1.value = a.iata;
    o1.textContent = text;
    origen.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = a.iata;
    o2.textContent = text;
    destino.appendChild(o2);
  });
}

/* --------------- util aeropuerto --------------- */
function findAirport(iata) { return aeropuertos.find(x => x.iata === iata) || null; }

/* --------------- fechas/temporada --------------- */
function isFechaEnRango(fecha, rango) {
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const inicio = new Date(rango.inicio);
  const fin = new Date(rango.fin);
  return f >= inicio && f <= fin;
}
function esTemporadaAlta(fecha) {
  if (!fecha) return false;
  return temporadasAltas.some(r => isFechaEnRango(fecha, r));
}

/* --------------- cálculo reserva --------------- */
function calcularReserva({ origen, destino, fechaSalida, fechaRegreso, tarifaSeleccionada }) {
  const aO = findAirport(origen);
  const aD = findAirport(destino);
  if (!aO || !aD) return null;

  const precioOrigen = Number(aO.price || 0);
  const precioDestino = Number(aD.price || 0);

  // Precio por vuelo: calculamos precio ida (origen→destino) como precioOrigen,
  // y precio regreso (destino→origen) como precioDestino. Si no hay regreso, solo ida.
  const vuelosCount = fechaRegreso ? 2 : 1;
  const extraTarifaTotal = (tarifaExtras[tarifaSeleccionada] || 0) * vuelosCount;

  const subtotalBase = precioOrigen + precioDestino + extraTarifaTotal;

  const esNacional = (aO.country_name && aD.country_name) ? (aO.country_name === aD.country_name) : false;
  const impuestoRate = esNacional ? 0.13 : 0.20;
  const impuestos = subtotalBase * impuestoRate;

  const alta = esTemporadaAlta(fechaSalida) || (fechaRegreso ? esTemporadaAlta(fechaRegreso) : false);
  const recargo = alta ? subtotalBase * 0.10 : 0;

  const total = subtotalBase + impuestos + recargo;

  return { aO, aD, precioOrigen, precioDestino, vuelosCount, extraTarifaTotal, subtotalBase, impuestoRate, impuestos, recargo, total, esNacional, temporadaAlta: alta };
}

/* --------------- render summary (MODIFICADA para agregar operador) --------------- */
function renderSummary() {
  const origen = safeGet("origen").value;
  const destino = safeGet("destino").value;
  const fechaSalidaVal = safeGet("fechaSalida").value;
  const fechaRegresoVal = safeGet("fechaRegreso").value;
  const tarifa = document.querySelector('input[name="tarifa"]:checked') ? document.querySelector('input[name="tarifa"]:checked').value : "economica";

  const titulo = safeGet("rutaTitulo");
  const resFechaSalida = safeGet("resFechaSalida");
  const resFechaRegreso = safeGet("resFechaRegreso");
  const resOperador = safeGet("resOperador"); // <-- NUEVO ELEMENTO ID
  const resPrecioOrigen = safeGet("resPrecioOrigen");
  const resPrecioDestino = safeGet("resPrecioDestino");
  const resTarifa = safeGet("resTarifa");
  const resSubtotal = safeGet("resSubtotal");
  const resImpuestos = safeGet("resImpuestos");
  const resRecargo = safeGet("resRecargo");
  const resTotal = safeGet("resTotal");
  const statusFlight = safeGet("statusFlight");

  // precios inline bajo selects
  const precioOriNode = safeGet("precioOrigen");
  const precioDesNode = safeGet("precioDestino");
  const aO = findAirport(origen);
  const aD = findAirport(destino);
  precioOriNode && (precioOriNode.textContent = aO ? `Precio ida: ${fmtUSD(aO.price)}` : "Precio ida: —");
  precioDesNode && (precioDesNode.textContent = aD ? `Precio regreso: ${fmtUSD(aD.price)}` : "Precio regreso: —");

  if (!origen || !destino) {
    if (titulo) titulo.textContent = "Selecciona origen y destino";
    if (resFechaSalida) resFechaSalida.textContent = fechaSalidaVal ? new Date(fechaSalidaVal).toLocaleDateString() : "—";
    if (resFechaRegreso) resFechaRegreso.textContent = fechaRegresoVal ? new Date(fechaRegresoVal).toLocaleDateString() : "—";
    if (resOperador) resOperador.textContent = ""; // Limpiar si no hay ruta seleccionada
    if (resPrecioOrigen) resPrecioOrigen.textContent = fmtUSD(0);
    if (resPrecioDestino) resPrecioDestino.textContent = fmtUSD(0);
    if (resTarifa) resTarifa.textContent = "—";
    if (resSubtotal) resSubtotal.textContent = fmtUSD(0);
    if (resImpuestos) resImpuestos.textContent = fmtUSD(0);
    if (resRecargo) resRecargo.textContent = fmtUSD(0);
    if (resTotal) resTotal.textContent = fmtUSD(0);
    if (statusFlight) statusFlight.textContent = "Aquí verás el resumen del precio antes de confirmar.";
    return;
  }

  const fd = fechaSalidaVal ? new Date(fechaSalidaVal) : null;
  const fr = fechaRegresoVal ? new Date(fechaRegresoVal) : null;

  const calc = calcularReserva({ origen, destino, fechaSalida: fd, fechaRegreso: fr, tarifaSeleccionada: tarifa });
  if (!calc) return;

  if (titulo) titulo.textContent = `${calc.aO.city} (${calc.aO.iata}) → ${calc.aD.city} (${calc.aD.iata})`;
  if (resFechaSalida) resFechaSalida.textContent = fd ? fd.toLocaleDateString() : "—";
  if (resFechaRegreso) resFechaRegreso.textContent = fr ? fr.toLocaleDateString() : "—";
  
  if (resOperador) resOperador.textContent = "Vuelos operados por AVIANCA"; // <--- AÑADIDO

  if (resPrecioOrigen) resPrecioOrigen.textContent = fmtUSD(calc.precioOrigen);
  if (resPrecioDestino) resPrecioDestino.textContent = fmtUSD(calc.precioDestino);

  if (resTarifa) {
    const tarifaLabel = tarifa.charAt(0).toUpperCase() + tarifa.slice(1);
    resTarifa.textContent = `${tarifaLabel} (+${fmtUSD(tarifaExtras[tarifa])} / vuelo × ${calc.vuelosCount})`;
  }

  if (resSubtotal) resSubtotal.textContent = fmtUSD(calc.subtotalBase);
  if (resImpuestos) resImpuestos.textContent = `${fmtUSD(calc.impuestos)} (${(calc.impuestoRate*100).toFixed(0)}%)`;
  if (resRecargo) resRecargo.textContent = `${fmtUSD(calc.recargo)}${calc.temporadaAlta ? " (Temporada alta)" : ""}`;
  if (resTotal) resTotal.textContent = fmtUSD(calc.total);

  if (statusFlight) statusFlight.textContent = calc.esNacional ? "Vuelo nacional (impuesto 13%)." : "Vuelo internacional (impuesto 20%).";
}

// VALIDACIÓN DE NOMBRE (MODIFICADA para mensaje más claro)
function validarNombreCompleto(nombre) {
  if (!nombre) return "El nombre del titular es requerido.";
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return "Ingresa el nombre completo del titular (nombre y apellido).";
  for (const p of partes) {
    if (p.length < 2) return "Cada palabra del nombre debe tener al menos 2 letras.";
  }
  return "";
}

function validarEmail(email) {
  if (!email) return "El correo es requerido.";
  const re = /^\S+@\S+\.\S+$/;
  return re.test(email) ? "" : "Ingresa un correo válido.";
}

function validarIdentificacion(id) {
  if (!id) return "La identificación es requerida.";
  // aceptar formatos: 7-10 dígitos, opcional - y 1 dígito: 01234567-8 o 012345678
  const re = /^\d{7,10}(-\d)?$/;
  return re.test(id) ? "" : "Ingresa un número de identificación válido. Ej: 01234567-8";
}

/* --------------- mostrar errores inline --------------- */
function validarCamposForm(datos) {
  // limpiar errores previos
  setError("nombre-error", "");
  setError("correo-error", "");
  setError("id-error", "");

  let ok = true;

  const nMsg = validarNombreCompleto(datos.nombre);
  if (nMsg) { setError("nombre-error", nMsg); ok = false; }

  const eMsg = validarEmail(datos.correo);
  if (eMsg) { setError("correo-error", eMsg); ok = false; }

  const idMsg = validarIdentificacion(datos.identificacion);
  if (idMsg) { setError("id-error", idMsg); ok = false; }

  return ok;
}

/* --------------- eventos: cambios --------------- */
document.addEventListener("change", (e) => {
  const t = e.target;
  if (!t) return;

  // evitar origen == destino
  if (t.id === "origen" || t.id === "destino") {
    const o = safeGet("origen").value;
    const d = safeGet("destino").value;
    if (o && d && o === d) {
      alert("El origen y destino no pueden ser iguales.");
      safeGet("destino").value = "";
    }
    renderSummary();
    return;
  }

  if (["origen","destino","fechaSalida","fechaRegreso"].includes(t.id) || t.name === "tarifa") {
    renderSummary();
  }
});

/* --------------- submits --------------- */

/* ---------------PASO 1: datos --------------- */
safeGet("reservaForm") && safeGet("reservaForm").addEventListener("submit", function(ev){
    ev.preventDefault();

    // Leer campos (mantenemos tu lógica existente)
    const nombre = (safeGet("nombre") && safeGet("nombre").value || "").trim();
    const correo = (safeGet("correo") && safeGet("correo").value || "").trim();
    const identificacion = (safeGet("identificacion") && safeGet("identificacion").value || "").trim();
    const origen = safeGet("origen").value;
    const destino = safeGet("destino").value;
    const fechaSalidaVal = safeGet("fechaSalida").value;
    const fechaRegresoVal = safeGet("fechaRegreso").value;
    const tarifa = document.querySelector('input[name="tarifa"]:checked') ? document.querySelector('input[name="tarifa"]:checked').value : "economica";

    const datos = {
        nombre, correo, identificacion,
        origen, destino,
        fechaSalida: fechaSalidaVal ? new Date(fechaSalidaVal) : null,
        fechaRegreso: fechaRegresoVal ? new Date(fechaRegresoVal) : null,
        tarifa
    };
    
    // Validaciones (mantenemos tu lógica existente)
    if (!validarCamposForm(datos)) {
        // foco al primer error visible
        const firstErr = document.querySelector(".error-msg.visible");
        if (firstErr) {
            const elId = firstErr.id.replace("-error", "");
            const targetEl = safeGet(elId) || safeGet("identificacion");
            targetEl && targetEl.focus();
        }
        return; 
    }

    // Calcular reserva
    const calc = calcularReserva({ origen: datos.origen, destino: datos.destino, fechaSalida: datos.fechaSalida, fechaRegreso: datos.fechaRegreso, tarifaSeleccionada: datos.tarifa });
    if (!calc) { 
        alert("Error calculando la reserva. Revisa origen/destino."); 
        return; 
    }

    // Almacenar datos y AVANZAR AL PASO 2
    currentReservationData = { datos, calc };
    goToStep(2);
});

/* --------------- PASO 2: pago --------------- */
safeGet("paymentForm") && safeGet("paymentForm").addEventListener("submit", function(ev){
    ev.preventDefault();

    // Limpiar errores previos de pago
    setError("cardNumber-error", "");
    setError("cardHolder-error", "");
    setError("expiryDate-error", "");
    setError("cvv-error", "");
    setError("billingZip-error", "");
    setError("terms-error", "");
    
    let paymentOk = true;

    // Lectura de campos del pago
    const cardNumber = safeGet("cardNumber").value.replace(/\s/g, ''); 
    // Usamos la validación de nombre corregida para el titular de la tarjeta
    const cardHolder = safeGet("cardHolder").value.trim(); 
    const expiryDate = safeGet("expiryDate").value.trim();
    const cvv = safeGet("cvv").value.trim();
    const billingZip = safeGet("billingZip").value.trim();
    const acceptTerms = safeGet("acceptTerms").checked;
    
    // Validaciones del pago
    const holderMsg = validarNombreCompleto(cardHolder);
    if (holderMsg) {
      setError("cardHolder-error", holderMsg);
      paymentOk = false;
    }
    
    if (cardNumber.length < 13 || cardNumber.length > 19 || !/^\d+$/.test(cardNumber)) {
        setError("cardNumber-error", "Número de tarjeta inválido (13-19 dígitos).");
        paymentOk = false;
    }

    if (!/^\d{2}\/\d{2}$/.test(expiryDate) || expiryDate.slice(0, 2) > 12) {
        setError("expiryDate-error", "Formato inválido (MM/AA).");
        paymentOk = false;
    }

    if (cvv.length < 3 || cvv.length > 4 || !/^\d+$/.test(cvv)) {
        setError("cvv-error", "CVV inválido (3 o 4 dígitos).");
        paymentOk = false;
    }
    
    // Note: Mantengo la validación de zip de 5 dígitos
    if (billingZip.length < 3 || !/^\d+$/.test(billingZip)) {
        setError("billingZip-error", "Código Postal inválido.");
        paymentOk = false;
    }

    if (!acceptTerms) {
        setError("terms-error", "Debes aceptar los términos y condiciones.");
        paymentOk = false;
    }
    
    if (!paymentOk) {
        return;
    }

    // Generar ticket y crear objeto final
    if (!currentReservationData) {
        alert("Error: Datos de reserva perdidos. Regresando al paso 1.");
        goToStep(1);
        return;
    }

    const { datos, calc } = currentReservationData;
    
    // Crear el objeto final de reserva usando los datos guardados
    const code = "RSV-" + Math.random().toString(36).slice(2,8).toUpperCase();
    const reservaObj = {
      code,
      createdAt: new Date().toISOString(),
      passenger: { nombre: datos.nombre, correo: datos.correo, identificacion: datos.identificacion },
      route: { origen: calc.aO, destino: calc.aD },
      dates: { salida: datos.fechaSalida, regreso: datos.fechaRegreso },
      tarifa: datos.tarifa,
      breakdown: {
        precioOrigen: calc.precioOrigen,
        precioDestino: calc.precioDestino,
        extraTarifaTotal: calc.extraTarifaTotal,
        subtotalBase: calc.subtotalBase,
        impuestos: calc.impuestos,
        recargo: calc.recargo,
        total: calc.total,
        esNacional: calc.esNacional,
        temporadaAlta: calc.temporadaAlta
      },
      payment: {
        last4: cardNumber.slice(-4),
        holder: cardHolder
      }
    };
    
    // Guardar historial local 
    try {
        const hist = JSON.parse(localStorage.getItem("reservas") || "[]");
        hist.push(reservaObj);
        localStorage.setItem("reservas", JSON.stringify(hist));
    } catch (err) {
        console.warn("No se pudo guardar en localStorage", err);
    }
    
    // Mostrar éxito
    showSuccess(reservaObj); 
    goToStep(3); 
});

/* --------------- Listener para Volver (PASO 2 -> PASO 1)--------------- */
safeGet("backToStep1") && safeGet("backToStep1").addEventListener("click", () => {
    goToStep(1);
});

/* --------------- success (MODIFICADA: Corrección de Cierre de Pop-up) --------------- */
function showSuccess(res) {
    const overlay = safeGet("successScreen");
    // const container = safeGet("step3Container"); // No es necesario, lo podemos quitar.
    
    if (!overlay) { alert("Reserva creada: " + res.code); return; }

    // 1. Mostrar el pop-up
    overlay.classList.remove("hidden"); // Solo mostramos el overlay
    
    // Relleno de datos del ticket (Tu código existente)
    safeGet("confText").textContent = `Tu código de reserva es ${res.code}. En breve recibirás un correo con tu ticket.`;

    // Datos de la ruta
    const routeText = `${res.route.origen.city} (${res.route.origen.iata}) → ${res.route.destino.city} (${res.route.destino.iata})`;
    safeGet("bpRoute").textContent = routeText;
    
    // Fechas y operador AVIANCA (MODIFICADO)
    const datesText = `Salida: ${res.dates.salida ? new Date(res.dates.salida).toLocaleDateString() : "—"} · Regreso: ${res.dates.regreso ? new Date(res.dates.regreso).toLocaleDateString() : "—"}`;
    safeGet("bpDates").innerHTML = `${datesText}<br><span>Vuelos operados por AVIANCA</span>`; 
    
    safeGet("bpTarifa").textContent = res.tarifa.charAt(0).toUpperCase() + res.tarifa.slice(1);
    safeGet("bpClase").textContent = res.breakdown.esNacional ? "Nacional" : "Internacional";
    safeGet("bpCode").textContent = res.code;
    safeGet("bpPrice").textContent = fmtUSD(res.breakdown.total);

    // QR
    const qnode = safeGet("qrcode");
    if (qnode) {
      qnode.innerHTML = "";
      try {
        new QRCode(qnode, { text: JSON.stringify({ code: res.code, name: res.passenger.nombre, route: `${res.route.origen.iata}-${res.route.destino.iata}`, total: res.breakdown.total }), width: 120, height: 120 });
      } catch (err) { console.warn("QR error", err); }
    }

    // print
    const printBtn = safeGet("printBtn");
    if (printBtn) printBtn.onclick = () => {
      const bpHTML = safeGet("boardingPass").outerHTML;
      const w = window.open("", "_blank");
      w.document.write(`<html><head><title>Ticket ${res.code}</title><style>body{font-family:Arial;padding:20px}</style></head><body>${bpHTML}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 300);
    };

    // 2. LÓGICA DE CIERRE: SOLO OCULTAR EL POP-UP
    
    // a) Botón "X" (successCloseBtn)
    const successCloseBtn = safeGet("successCloseBtn");
    if (successCloseBtn) {
        // Al dar clic, solo oculta el overlay
        successCloseBtn.onclick = () => overlay.classList.add("hidden"); 
    }
    
    // b) Cierre al dar click fuera del ticket (overlay)
    if (overlay) {
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                // Al dar clic en el fondo, solo oculta el overlay
                overlay.classList.add("hidden"); 
            }
        };
    }
    
    // c) Botón "Hacer otra reserva" (newBtn): Este SÍ debe resetear
    const newBtn = safeGet("newBtn");
    if (newBtn) newBtn.onclick = () => goToStep(1); 
}

/* --------------- LÓGICA DE INTERFAZ Y NAVEGACIÓN (NUEVO) --------------- */

// Variable para guardar la URL a la que se intentaba navegar
let pendingNavigationUrl = null;

function showLeaveModal(url) {
    pendingNavigationUrl = url;
    safeGet("leaveModal").classList.remove("hidden");
}

// Lógica de formato automático para tarjeta y fecha
document.addEventListener("input", (e) => {
    const t = e.target;

    // 1. Número de Tarjeta: Añadir espacios cada 4 dígitos (0000 0000 0000 0000)
    if (t.id === "cardNumber") {
        const value = t.value.replace(/\D/g, '').substring(0, 16); // Elimina no-dígitos y limita a 16
        t.value = value.match(/.{1,4}/g)?.join(' ') || '';
    }

    // 2. Fecha de Expiración: Añadir la pleca / después de MM (MM/AA)
    if (t.id === "expiryDate") {
        let value = t.value.replace(/\D/g, '').substring(0, 4);
        if (value.length > 2) {
            value = value.substring(0, 2) + '/' + value.substring(2);
        }
        t.value = value;
    }
});

// Eventos del modal de advertencia
safeGet("modalCloseBtn") && safeGet("modalCloseBtn").addEventListener("click", () => {
    safeGet("leaveModal").classList.add("hidden");
    pendingNavigationUrl = null;
});

safeGet("modalCancelBtn") && safeGet("modalCancelBtn").addEventListener("click", () => {
    safeGet("leaveModal").classList.add("hidden");
    pendingNavigationUrl = null;
});

safeGet("modalAcceptBtn") && safeGet("modalAcceptBtn").addEventListener("click", () => {
    safeGet("leaveModal").classList.add("hidden");
    if (pendingNavigationUrl) {
        // Redirige al destino que fue guardado
        window.location.href = pendingNavigationUrl;
    }
});

// Interceptar clics en la barra de navegación (para el modal de advertencia)
document.querySelectorAll(".nav-menu a").forEach(link => {
    link.addEventListener("click", function(e) {
        // Obtenemos campos que indican que el usuario ya empezó a llenar algo
        const origen = safeGet("origen")?.value;
        const nombre = safeGet("nombre")?.value;
        const currentStep = safeGet("step1Container")?.classList.contains("hidden") ? 2 : 1; 

        // Si ya hay datos en los campos (o estamos en el paso 2) y el destino NO es "Reservar" (index.html), mostramos advertencia.
        const isNotBookingPage = !e.target.href.includes("index.html");

        // Usamos una verificación: si el currentStep es > 1 O ya se llenó origen O ya se llenó nombre
        if ((currentStep > 1 || origen || nombre) && isNotBookingPage) {
            e.preventDefault(); // Detiene la navegación inmediata
            showLeaveModal(e.target.href);
        }
    });
});

/* --------------- init --------------- */

function initialize() {
    // 1. Inicializar las referencias de los pasos de progreso de forma segura AQUÍ
    progressSteps = {
        1: safeGet("progressStep1"),
        2: safeGet("progressStep2"),
        3: safeGet("progressStep3"),
    };

    // 2. Cargar datos y renderizar el resumen (loadAirports llama a renderSummary y populateSelects)
    loadAirports();
    
    // 3. Lógica del menú responsive
    /* -------------------------
       TOGGLE NAV (Responsive)
    -------------------------- */
    const navToggle = document.getElementById("navToggle");
    const navMenu = document.getElementById("navMenu");

    if (navToggle && navMenu) {
      navToggle.addEventListener("click", () => {
        navMenu.classList.toggle("open");
      });
    }
    
// ... dentro de initialize()
    // 4. Aseguramos que el sistema inicie en el primer paso visible
    goToStep(1); // <-- ¡Esta línea es la magia!
}

// Asegura que la inicialización ocurra solo después de que el DOM esté listo
document.addEventListener('DOMContentLoaded', initialize);