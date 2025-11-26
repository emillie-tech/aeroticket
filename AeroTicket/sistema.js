
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

/* --------------- cargar aeropuertos --------------- */
async function loadAirports() {
  try {
    const url = "https://aeroticket.free.beeceptor.com/airports";
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

/* --------------- render summary --------------- */
function renderSummary() {
  const origen = safeGet("origen").value;
  const destino = safeGet("destino").value;
  const fechaSalidaVal = safeGet("fechaSalida").value;
  const fechaRegresoVal = safeGet("fechaRegreso").value;
  const tarifa = document.querySelector('input[name="tarifa"]:checked') ? document.querySelector('input[name="tarifa"]:checked').value : "economica";

  const titulo = safeGet("rutaTitulo");
  const resFechaSalida = safeGet("resFechaSalida");
  const resFechaRegreso = safeGet("resFechaRegreso");
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


function validarNombreCompleto(nombre) {
  if (!nombre) return "El nombre es requerido.";
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return "Ingresa tu nombre completo (nombre y apellidos).";
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

/* --------------- submit --------------- */
safeGet("reservaForm") && safeGet("reservaForm").addEventListener("submit", function(ev){
  ev.preventDefault();

  // leer campos
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

  // VALIDACIONES JS (inline)
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

  // calcular reserva (misma lógica)
  const calc = calcularReserva({ origen: datos.origen, destino: datos.destino, fechaSalida: datos.fechaSalida, fechaRegreso: datos.fechaRegreso, tarifaSeleccionada: datos.tarifa });
  if (!calc) { alert("Error calculando la reserva. Revisa origen/destino."); return; }

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
    }
  };

  // guardar historial local
  try {
    const hist = JSON.parse(localStorage.getItem("reservas") || "[]");
    hist.push(reservaObj);
    localStorage.setItem("reservas", JSON.stringify(hist));
  } catch (err) {
    console.warn("No se pudo guardar en localStorage", err);
  }

  showSuccess(reservaObj);
});

/* --------------- success --------------- */
function showSuccess(res) {
  const overlay = safeGet("successScreen");
  if (!overlay) { alert("Reserva creada: " + res.code); return; }
  overlay.classList.remove("hidden");

  safeGet("confText").textContent = `Tu código de reserva es ${res.code}. En breve recibirás un correo con tu ticket.`;

  safeGet("bpRoute").textContent = `${res.route.origen.city} (${res.route.origen.iata}) → ${res.route.destino.city} (${res.route.destino.iata})`;
  safeGet("bpDates").textContent = `Salida: ${res.dates.salida ? new Date(res.dates.salida).toLocaleString() : "—"} · Regreso: ${res.dates.regreso ? new Date(res.dates.regreso).toLocaleString() : "—"}`;
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

  const newBtn = safeGet("newBtn");
  if (newBtn) newBtn.onclick = () => window.location.reload();
}

/* --------------- init --------------- */
loadAirports();
renderSummary();

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
