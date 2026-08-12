const dbName = "receta-medica-mobile-v1";
const dbVersion = 1;
const form = document.querySelector("#recipeForm");
const statusNode = document.querySelector("#status");
const voiceBtn = document.querySelector("#voiceBtn");
const voicePanel = document.querySelector("#voicePanel");
const voiceStatus = document.querySelector("#voiceStatus");
const recipeSearch = document.querySelector("#recipeSearch");
const recipeResults = document.querySelector("#recipeResults");
const medicineSearch = document.querySelector("#medicineSearch");
const medicineHours = document.querySelector("#medicineHours");
const medicineDays = document.querySelector("#medicineDays");
const indicationSelect = document.querySelector("#indicationSelect");
const otherIndicationSelect = document.querySelector("#otherIndicationSelect");
const medicineForm = document.querySelector("#medicineForm");
const indicationForm = document.querySelector("#indicationForm");
const doctorForm = document.querySelector("#doctorForm");
const medicineList = document.querySelector("#medicineList");
const indicationList = document.querySelector("#indicationList");
const fields = ["fecha", "paciente", "edad", "talla", "peso", "pulso", "temperatura", "ta", "diagnostico", "medicamentos", "indicaciones", "otrasIndicaciones"];
const requiredFront = ["fecha", "paciente", "edad", "pulso", "temperatura", "ta", "diagnostico", "medicamentos", "indicaciones"];
const requiredBack = ["otrasIndicaciones"];
const textareas = new Set(["diagnostico", "medicamentos", "indicaciones", "otrasIndicaciones"]);
let dbPromise = null;
let medicines = [];
let indications = [];
let voiceRecognition = null;
let voiceActive = false;
let voiceField = "";
let nativeVoiceListening = false;
let nativeVoiceLastText = "";
let currentRecipeId = "";
let currentPatientId = "";

const defaultDoctor = {
  title: "Consultorio Médico Montevideo",
  name: "Dr. Rodolfo Maricón López",
  cedula: "959875",
  school: "I.P.N",
  ssa: "24306",
  specialties: "PEDIATRÍA • CIRUGÍA • PARTOS • GINECOLOGÍA • URGENCIAS",
  address: "CALLE APATZINGÁN No. 2656 COL. FELIPE DE JESÚS, MÉXICO, D.F.",
  phone: "",
};

const defaultIndications = [
  { titulo: "Gastritis / colitis", categoria: "Digestivo", texto: "Evitar grasas, irritantes, refrescos, alcohol y café." },
  { titulo: "Triglicéridos / colesterol", categoria: "Metabólico", texto: "Evitar grasas, frituras, embutidos, comida rápida, refrescos y alcohol." },
  { titulo: "Hidratación", categoria: "General", texto: "Tomar abundantes líquidos y evitar bebidas azucaradas." },
  { titulo: "Reposo", categoria: "General", texto: "Reposo relativo y evitar esfuerzos físicos." },
  { titulo: "Dieta blanda", categoria: "Digestivo", texto: "Dieta blanda, evitar lácteos, grasas e irritantes." },
  { titulo: "Completar tratamiento", categoria: "General", texto: "No suspender tratamiento aunque mejore antes de terminarlo." },
  { titulo: "Signos de alarma", categoria: "Alarma", texto: "Acudir a urgencias si presenta fiebre persistente, dificultad para respirar, dolor intenso o empeoramiento." },
  { titulo: "Revaloración", categoria: "Seguimiento", texto: "Control en consulta si no hay mejoría en 48 a 72 horas." },
];

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      ["patients", "recipes", "medicines", "indications", "settings"].forEach((store) => {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function storeTx(storeName, mode = "readonly") {
  const db = await openDb();
  return db.transaction(storeName, mode).objectStore(storeName);
}

async function getAll(storeName) {
  const store = await storeTx(storeName);
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function put(storeName, value) {
  const store = await storeTx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

async function remove(storeName, id) {
  const store = await storeTx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function id() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(message) {
  statusNode.textContent = message;
}

function normalizeText(value) {
  return String(value || "").trim().toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function wordsMatch(text, query) {
  const source = normalizeText(text);
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  return words.every((word) => source.includes(word));
}

function capitalize(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toLocaleUpperCase("es-MX") + text.slice(1) : "";
}

function stripNumber(value) {
  return String(value || "").replace(/^\s*\d+\.-\s*/, "").trim();
}

function numberedValue(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(stripNumber)
    .filter(Boolean)
    .map((line, index) => `${index + 1}.- ${capitalize(line)}`)
    .join("\n");
}

function appendNumbered(name, value) {
  const input = form.elements[name];
  if (!input || input.disabled || !String(value || "").trim()) return;
  const lines = String(input.value || "").split(/\r?\n/).map(stripNumber).filter(Boolean);
  lines.push(value.trim());
  input.value = lines.map((line, index) => `${index + 1}.- ${capitalize(line)}`).join("\n");
  updatePreview();
}

function formData() {
  return Object.fromEntries(fields.map((field) => [field, form.elements[field]?.value.trim() || ""]));
}

function setFormData(data = {}) {
  fields.forEach((field) => {
    if (form.elements[field]) form.elements[field].value = data[field] || "";
  });
  updatePreview();
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  const names = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${Number(day)} de ${names[Number(month)]} de ${year}`;
}

function renderNumbered(node, value) {
  node.textContent = "";
  String(value || "").split(/\r?\n/).map(stripNumber).filter(Boolean).forEach((line, index) => {
    const row = document.createElement("p");
    row.textContent = `${index + 1}.- ${line}`;
    node.append(row);
  });
}

function updatePreview() {
  const data = formData();
  document.querySelectorAll("[data-preview]").forEach((node) => {
    const field = node.dataset.preview;
    if (field === "fecha") {
      node.textContent = formatDate(data.fecha);
    } else if (textareas.has(field)) {
      renderNumbered(node, data[field]);
    } else {
      node.textContent = data[field] || "";
    }
  });
}

function formatWithUnit(value, unit, decimals = null) {
  const text = String(value || "").trim();
  if (text === "-") return "-";
  const match = normalizeSpanishNumberText(text).replace(",", ".").match(/\d+(\.\d+)?/);
  if (!match) return "";
  const number = Number(match[0]);
  if (!Number.isFinite(number)) return text;
  return `${decimals === null ? String(number).replace(/\.0$/, "") : number.toFixed(decimals)} ${unit}`;
}

function formatHeight(value) {
  const text = String(value || "").trim();
  if (text === "-") return "-";
  const normalized = normalizeSpanishNumberText(text);
  const decimal = normalized.match(/\b([12])\s*(?:punto|metro(?:s)?|con)?\s*(\d{1,2})\b/i);
  const clean = decimal ? `${decimal[1]}.${decimal[2].padStart(2, "0").slice(0, 2)}` : normalized.replace(",", ".").match(/\d+(\.\d+)?/)?.[0] || "";
  if (!clean) return "";
  const number = Number(clean);
  if (!Number.isFinite(number)) return text;
  if (number >= 3) return `${(number / 100).toFixed(2)} m`;
  return `${number.toFixed(2)} m`;
}

function formatBloodPressure(value) {
  const text = String(value || "").trim();
  if (text === "-") return "-";
  const normalized = normalizeSpanishNumberText(text).replace(/\b(sobre|con|entre|diagonal)\b/gi, "/").replace(/\s*\/\s*/g, "/");
  const match = normalized.match(/(\d{2,3})\D+(\d{2,3})/);
  return match ? `${match[1]}/${match[2]}` : normalized;
}

function normalizeSpanishNumberText(value) {
  const nums = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, dieciséis: 16, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100 };
  return String(value || "").toLocaleLowerCase("es-MX").replace(/\b[a-záéíóúüñ]+\b/gi, (word) => {
    const key = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return Number.isFinite(nums[word]) ? String(nums[word]) : Number.isFinite(nums[key]) ? String(nums[key]) : word;
  });
}

function formatMeasurements() {
  const map = {
    edad: (value) => formatWithUnit(value, "años"),
    talla: formatHeight,
    peso: (value) => formatWithUnit(value, "kg"),
    pulso: (value) => formatWithUnit(value, "lpm"),
    temperatura: (value) => formatWithUnit(value, "°C", 1),
    ta: formatBloodPressure,
  };
  Object.entries(map).forEach(([field, fn]) => {
    const input = form.elements[field];
    if (input && input.value.trim()) input.value = fn(input.value);
  });
  updatePreview();
}

async function seedDefaults() {
  const currentDoctor = (await getAll("settings")).find((item) => item.id === "doctor");
  if (!currentDoctor) await put("settings", { id: "doctor", ...defaultDoctor });
  if (!(await getAll("indications")).length) {
    await Promise.all(defaultIndications.map((item) => put("indications", { id: id(), ...item })));
  }
}

async function loadCatalogs() {
  medicines = (await getAll("medicines")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es-MX"));
  indications = (await getAll("indications")).sort((a, b) => a.titulo.localeCompare(b.titulo, "es-MX"));
  renderMedicineOptions();
  renderIndicationOptions();
  renderCatalogLists();
}

function renderMedicineOptions() {
  medicineHours.innerHTML = ["", 1, 2, 3, 4, 6, 8, 10, 12, 18, 24].map((hour) => `<option value="${hour}">${hour ? `${hour} horas` : "N/A"}</option>`).join("");
  medicineDays.innerHTML = ["", 1, 2, 3, 5, 7, 10, 14, 15, 21, 30].map((day) => `<option value="${day}">${day ? `${day} días` : "N/A"}</option>`).join("");
}

function renderIndicationOptions() {
  const html = `<option value="">Selecciona indicación</option>${indications.map((item) => `<option value="${escapeHtml(item.texto)}">${escapeHtml(item.categoria ? `${item.titulo} (${item.categoria})` : item.titulo)}</option>`).join("")}`;
  indicationSelect.innerHTML = html;
  otherIndicationSelect.innerHTML = html;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderCatalogLists() {
  medicineList.innerHTML = medicines.map((item) => `<button class="list-item" data-edit-medicine="${item.id}"><strong>${escapeHtml(item.nombre)}</strong><span>${escapeHtml([item.presentacion, item.uso].filter(Boolean).join(" · "))}</span></button>`).join("");
  indicationList.innerHTML = indications.map((item) => `<button class="list-item" data-edit-indication="${item.id}"><strong>${escapeHtml(item.titulo)}</strong><span>${escapeHtml(item.texto)}</span></button>`).join("");
}

async function saveRecipe() {
  formatMeasurements();
  const data = formData();
  const missing = requiredFront.filter((field) => !data[field]).concat(requiredBack.filter((field) => !data[field]));
  if (missing.length) {
    setStatus(`Faltan datos: ${missing.join(", ")}.`);
    form.elements[missing[0]]?.focus();
    return;
  }

  const now = new Date().toISOString();
  const patientName = data.paciente.trim();
  const patients = await getAll("patients");
  let patient = patients.find((item) => normalizeText(item.name) === normalizeText(patientName));
  if (!patient) patient = { id: id(), code: `P-${patients.length + 1}`, createdAt: now };
  patient = { ...patient, name: patientName, edad: data.edad, talla: data.talla, peso: data.peso, updatedAt: now };
  await put("patients", patient);
  currentPatientId = patient.id;

  const recipes = await getAll("recipes");
  const recipe = {
    id: currentRecipeId || id(),
    code: currentRecipeId ? recipes.find((item) => item.id === currentRecipeId)?.code || `R-${recipes.length + 1}` : `R-${recipes.length + 1}`,
    patientId: patient.id,
    data,
    createdAt: currentRecipeId ? recipes.find((item) => item.id === currentRecipeId)?.createdAt || now : now,
    updatedAt: now,
  };
  await put("recipes", recipe);
  currentRecipeId = recipe.id;
  setStatus(`Receta guardada: ${recipe.code}.`);
  renderRecipeSearch();
}

function newRecipe() {
  currentRecipeId = "";
  currentPatientId = "";
  setFormData({ fecha: new Date().toISOString().slice(0, 10) });
  recipeSearch.value = "";
  recipeResults.hidden = true;
  setStatus("Nueva receta lista.");
}

async function renderRecipeSearch() {
  const query = recipeSearch.value.trim();
  const [recipes, patients] = await Promise.all([getAll("recipes"), getAll("patients")]);
  const rows = recipes
    .map((recipe) => ({ recipe, patient: patients.find((patient) => patient.id === recipe.patientId), data: recipe.data || {} }))
    .filter(({ recipe, patient, data }) => {
      if (!query) return true;
      return wordsMatch([patient?.name, patient?.code, recipe.code, data.diagnostico, data.medicamentos, data.fecha].join(" "), query);
    })
    .sort((a, b) => new Date(b.recipe.updatedAt || b.recipe.createdAt) - new Date(a.recipe.updatedAt || a.recipe.createdAt))
    .slice(0, 10);
  recipeResults.innerHTML = rows.map(({ recipe, patient, data }) => `<button class="search-result" data-load-recipe="${recipe.id}"><strong>${escapeHtml(patient?.name || data.paciente || "Sin paciente")} · ${escapeHtml(recipe.code)}</strong><span>${escapeHtml(formatDate(data.fecha))} · ${escapeHtml(stripNumber(data.diagnostico) || "Sin diagnóstico")}</span></button>`).join("");
  recipeResults.hidden = !rows.length || !query;
}

async function loadRecipe(recipeId) {
  const recipe = (await getAll("recipes")).find((item) => item.id === recipeId);
  if (!recipe) return;
  currentRecipeId = recipe.id;
  currentPatientId = recipe.patientId || "";
  setFormData(recipe.data || {});
  recipeResults.hidden = true;
  setStatus(`Receta cargada: ${recipe.code}.`);
  showView("recipeView");
}

function setVoiceState(recording, message = "") {
  voiceActive = recording;
  voicePanel.hidden = !recording;
  voiceBtn.textContent = recording ? "Detener voz" : "Activar voz";
  voiceBtn.classList.toggle("active", recording);
  if (message) voiceStatus.textContent = message;
}

function commandField(text) {
  const normalized = normalizeText(text);
  if (/^(?:indicaciones?\s+(?:al\s+)?reverso|reverso|atras|otras\s+indicaciones)/.test(normalized)) return "otrasIndicaciones";
  if (/^diagnostico|^diagnóstico|^dx|^motivo/.test(normalized)) return "diagnostico";
  if (/^medicamentos?|^medicina|^tratamiento|^rx/.test(normalized)) return "medicamentos";
  if (/^indicaciones?/.test(normalized)) return "indicaciones";
  if (/^paciente|^nombre/.test(normalized)) return "paciente";
  if (/^edad/.test(normalized)) return "edad";
  if (/^talla/.test(normalized)) return "talla";
  if (/^peso/.test(normalized)) return "peso";
  if (/^pulso/.test(normalized)) return "pulso";
  if (/^temperatura|^temp/.test(normalized)) return "temperatura";
  if (/^(?:tension|presion|ta|t\/a|arterial)/.test(normalized)) return "ta";
  return "";
}

function removeCommand(text, field) {
  const patterns = {
    otrasIndicaciones: /^(?:indicaciones?\s+(?:al\s+)?reverso|reverso|atras|otras\s+indicaciones)(?:\s+(?:para|de|por))?\s*/i,
    diagnostico: /^(?:diagnostico|diagnóstico|dx|motivo)\s*/i,
    medicamentos: /^(?:medicamentos?|medicina|tratamiento|rx)\s*/i,
    indicaciones: /^indicaciones?(?:\s+(?:para|de|por))?\s*/i,
    paciente: /^(?:paciente|nombre(?:\s+del\s+paciente)?)\s*/i,
    edad: /^edad\s*/i,
    talla: /^talla\s*/i,
    peso: /^peso\s*/i,
    pulso: /^pulso\s*/i,
    temperatura: /^(?:temperatura|temp)\s*/i,
    ta: /^(?:tension\s+arterial|presion\s+arterial|tension|presion|ta|t\/a|arterial)\s*/i,
  };
  return String(text || "").replace(patterns[field] || /^/, "").trim();
}

function findIndication(query) {
  const normalized = normalizeText(query);
  return indications.find((item) => wordsMatch(`${item.titulo} ${item.categoria} ${item.texto}`, normalized));
}

async function applyVoice(text) {
  const phrase = String(text || "").trim();
  if (!phrase) return;

  const search = phrase.match(/^(?:buscar|busca|búscame|buscame)\s+(?:receta|recetas)(?:\s+(?:de|del|para|paciente))?\s+(.+)$/i);
  if (search) {
    recipeSearch.value = search[1].trim();
    await renderRecipeSearch();
    setStatus(recipeResults.hidden ? `No encontré recetas para "${recipeSearch.value}".` : `Recetas encontradas para "${recipeSearch.value}".`);
    return;
  }

  if (/^(?:imprimir|imprime)\s+(?:reverso|atras|atrás)/i.test(phrase)) {
    printSide("back");
    return;
  }
  if (/^(?:imprimir|imprime)\s+receta/i.test(phrase)) {
    printSide("front");
    return;
  }
  if (/^(?:siguiente|nuevo|nueva|otro|otra|agregar)$/i.test(phrase) && textareas.has(voiceField)) {
    setStatus(`Listo para siguiente en ${voiceField}.`);
    return;
  }

  const field = commandField(phrase) || voiceField;
  if (!field) return;
  voiceField = field;
  let value = removeCommand(phrase, field).replace(/^\s*(es|de|del|la|el|son|tiene|con)\s+/i, "").trim();
  if (!value) return;

  if ((field === "indicaciones" || field === "otrasIndicaciones") && /^(?:para|de|por)\s+/i.test(value)) {
    const indication = findIndication(value.replace(/^(?:para|de|por)\s+/i, ""));
    value = indication?.texto || value.replace(/^(?:para|de|por)\s+/i, "");
  }

  if (field === "medicamentos") value = value.replace(/\bmiligramos?\b/gi, "mg").replace(/\bgramos?\b/gi, "g");
  if (field === "edad") value = formatWithUnit(value, "años");
  if (field === "talla") value = formatHeight(value);
  if (field === "peso") value = formatWithUnit(value, "kg");
  if (field === "pulso") value = formatWithUnit(value, "lpm");
  if (field === "temperatura") value = formatWithUnit(value, "°C", 1);
  if (field === "ta") value = formatBloodPressure(value);

  if (textareas.has(field)) appendNumbered(field, value);
  else form.elements[field].value = value;
  updatePreview();
  setStatus(`Voz: ${field}.`);
}

function nativeSpeechPlugin() {
  return window.Capacitor?.Plugins?.SpeechRecognition || null;
}

function isNativeAndroidVoiceAvailable() {
  return Boolean(window.Capacitor?.isNativePlatform?.() && nativeSpeechPlugin());
}

async function ensureNativeVoicePermission(plugin) {
  const current = await plugin.checkPermissions().catch(() => ({ speechRecognition: "prompt" }));
  if (current.speechRecognition === "granted") return true;
  const requested = await plugin.requestPermissions().catch(() => ({ speechRecognition: "denied" }));
  return requested.speechRecognition === "granted";
}

async function startNativeVoice() {
  const plugin = nativeSpeechPlugin();
  if (!plugin) return false;

  const available = await plugin.available().catch(() => ({ available: false }));
  if (!available.available) {
    setStatus("El reconocimiento de voz no está disponible en este Android.");
    return true;
  }

  if (!(await ensureNativeVoicePermission(plugin))) {
    setStatus("Activa el permiso de micrófono para usar dictado.");
    return true;
  }

  await plugin.removeAllListeners().catch(() => {});
  await plugin.addListener("partialResults", (data) => {
    const text = (data.matches || []).find(Boolean) || "";
    if (!text) return;
    nativeVoiceLastText = text;
    voiceStatus.textContent = `Escuchando: ${text}`;
  });
  await plugin.addListener("listeningState", (data) => {
    nativeVoiceListening = data.status === "started";
    if (data.status !== "stopped") return;
    const text = nativeVoiceLastText.trim();
    nativeVoiceLastText = "";
    if (text) applyVoice(text);
    if (voiceActive) window.setTimeout(startNativeVoice, 350);
  });

  try {
    nativeVoiceListening = true;
    await plugin.start({
      language: "es-MX",
      maxResults: 3,
      partialResults: true,
      popup: false,
    });
  } catch {
    nativeVoiceListening = false;
    if (voiceActive) window.setTimeout(startNativeVoice, 650);
  }
  return true;
}

function startWebVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus("Este navegador no permite dictado en vivo.");
    return false;
  }
  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = "es-MX";
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;
  voiceRecognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0]?.transcript || "";
      if (event.results[index].isFinal) applyVoice(text);
      else interim = `${interim} ${text}`.trim();
    }
    if (interim) voiceStatus.textContent = `Escuchando: ${interim}`;
  };
  voiceRecognition.onend = () => {
    voiceRecognition = null;
    if (voiceActive) window.setTimeout(startVoice, 250);
  };
  voiceRecognition.onerror = () => {
    voiceStatus.textContent = "Sigue dictando. Si se detiene, vuelve a activar voz.";
  };
  voiceRecognition.start();
  return true;
}

async function startVoice() {
  setVoiceState(true, "Di paciente, edad, talla, peso, diagnóstico, medicamentos o indicaciones.");
  if (isNativeAndroidVoiceAvailable()) {
    await startNativeVoice();
    return;
  }
  startWebVoice();
}

async function stopVoice() {
  voiceActive = false;
  if (voiceRecognition) {
    voiceRecognition.stop();
    voiceRecognition = null;
  }
  const plugin = nativeSpeechPlugin();
  if (plugin) {
    await plugin.stop().catch(() => {});
    await plugin.removeAllListeners().catch(() => {});
  }
  nativeVoiceListening = false;
  nativeVoiceLastText = "";
  setVoiceState(false);
  setStatus("Voz detenida.");
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active-view", view.id === viewId));
  document.querySelectorAll(".bottom-nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
}

function printSide(side) {
  showView("previewView");
  document.body.classList.toggle("print-front", side === "front");
  document.body.classList.toggle("print-back", side === "back");
  window.setTimeout(() => window.print(), 100);
}

async function loadDoctor() {
  const doctor = (await getAll("settings")).find((item) => item.id === "doctor") || defaultDoctor;
  Object.entries(defaultDoctor).forEach(([key]) => {
    if (doctorForm.elements[key]) doctorForm.elements[key].value = doctor[key] || "";
  });
  document.querySelector("#doctorTitlePreview").textContent = doctor.title || "";
  document.querySelector("#doctorNamePreview").textContent = doctor.name || "";
  document.querySelector("#doctorMetaPreview").textContent = doctor.specialties || "";
  document.querySelector("#doctorFooterPreview").textContent = [doctor.address, doctor.phone].filter(Boolean).join(" · ");
}

async function exportBackup() {
  const backup = {
    exportedAt: new Date().toISOString(),
    patients: await getAll("patients"),
    recipes: await getAll("recipes"),
    medicines: await getAll("medicines"),
    indications: await getAll("indications"),
    settings: await getAll("settings"),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `recetas-mobile-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  if (!file) return;
  const backup = JSON.parse(await file.text());
  for (const store of ["patients", "recipes", "medicines", "indications", "settings"]) {
    if (Array.isArray(backup[store])) {
      for (const item of backup[store]) await put(store, item);
    }
  }
  await loadCatalogs();
  await loadDoctor();
  setStatus("Respaldo importado.");
}

async function clearAllData() {
  if (!confirm("Esto borrará recetas, pacientes y catálogos guardados en este celular. ¿Continuar?")) return;
  for (const store of ["patients", "recipes", "medicines", "indications", "settings"]) {
    for (const item of await getAll(store)) await remove(store, item.id);
  }
  await seedDefaults();
  await loadCatalogs();
  await loadDoctor();
  newRecipe();
  setStatus("Datos locales borrados.");
}

function bindEvents() {
  form.addEventListener("input", updatePreview);
  ["edad", "talla", "peso", "pulso", "temperatura", "ta"].forEach((field) => form.elements[field].addEventListener("blur", formatMeasurements));
  document.querySelectorAll("[data-clear-textarea]").forEach((button) => button.addEventListener("click", () => {
    form.elements[button.dataset.clearTextarea].value = "";
    updatePreview();
  }));
  document.querySelectorAll("[data-na-for]").forEach((check) => check.addEventListener("change", () => {
    const input = form.elements[check.dataset.naFor];
    input.disabled = check.checked;
    if (check.checked) input.value = "";
    updatePreview();
  }));
  document.querySelector(".bottom-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) showView(button.dataset.view);
  });
  document.querySelector("#saveRecipeBtn").addEventListener("click", saveRecipe);
  document.querySelector("#newRecipeBtn").addEventListener("click", newRecipe);
  voiceBtn.addEventListener("click", () => (voiceActive ? stopVoice() : startVoice()));
  recipeSearch.addEventListener("input", renderRecipeSearch);
  recipeSearch.addEventListener("focus", renderRecipeSearch);
  recipeResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-load-recipe]");
    if (button) loadRecipe(button.dataset.loadRecipe);
  });
  document.querySelector("#insertMedicineBtn").addEventListener("click", () => {
    const base = medicineSearch.value.trim();
    if (!base) return;
    const hours = medicineHours.value ? ` cada ${medicineHours.value} horas` : "";
    const days = medicineDays.value ? ` por ${medicineDays.value} días` : "";
    appendNumbered("medicamentos", `${base}${hours}${days}`);
    medicineSearch.value = "";
  });
  document.querySelector("#insertIndicationBtn").addEventListener("click", () => appendNumbered("indicaciones", indicationSelect.value));
  document.querySelector("#insertOtherIndicationBtn").addEventListener("click", () => appendNumbered("otrasIndicaciones", otherIndicationSelect.value));
  medicineForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(medicineForm));
    if (!data.nombre.trim()) return;
    await put("medicines", { id: data.id || id(), nombre: data.nombre.trim(), presentacion: data.presentacion.trim(), uso: data.uso.trim() });
    medicineForm.reset();
    await loadCatalogs();
  });
  indicationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(indicationForm));
    if (!data.titulo.trim() || !data.texto.trim()) return;
    await put("indications", { id: data.id || id(), titulo: data.titulo.trim(), categoria: data.categoria.trim(), texto: data.texto.trim() });
    indicationForm.reset();
    await loadCatalogs();
  });
  medicineList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-medicine]");
    const item = medicines.find((medicine) => medicine.id === button?.dataset.editMedicine);
    if (!item) return;
    medicineForm.elements.id.value = item.id;
    medicineForm.elements.nombre.value = item.nombre;
    medicineForm.elements.presentacion.value = item.presentacion || "";
    medicineForm.elements.uso.value = item.uso || "";
  });
  indicationList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-indication]");
    const item = indications.find((indication) => indication.id === button?.dataset.editIndication);
    if (!item) return;
    indicationForm.elements.id.value = item.id;
    indicationForm.elements.titulo.value = item.titulo;
    indicationForm.elements.categoria.value = item.categoria || "";
    indicationForm.elements.texto.value = item.texto || "";
  });
  doctorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await put("settings", { id: "doctor", ...Object.fromEntries(new FormData(doctorForm)) });
    await loadDoctor();
    setStatus("Datos del doctor guardados.");
  });
  document.querySelector("#printFrontBtn").addEventListener("click", () => printSide("front"));
  document.querySelector("#printBackBtn").addEventListener("click", () => printSide("back"));
  document.querySelector("#exportBtn").addEventListener("click", exportBackup);
  document.querySelector("#importFile").addEventListener("change", (event) => importBackup(event.target.files[0]));
  document.querySelector("#clearAllBtn").addEventListener("click", clearAllData);
  window.addEventListener("afterprint", () => document.body.classList.remove("print-front", "print-back"));
}

async function boot() {
  bindEvents();
  await seedDefaults();
  await loadCatalogs();
  await loadDoctor();
  newRecipe();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
