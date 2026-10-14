"use strict";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () => crypto.randomUUID();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const date = (s) =>
  s
    ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString(
        "es-AR",
      )
    : "Sin fecha";
const systems = [
  "Motor babor",
  "Motor estribor",
  "Generador",
  "Desalinizadora",
  "Bomba agua sanitarias",
  "Bomba agua grises",
  "Bomba trituradora",
  "Electricidad 12 V",
  "Electricidad 110 V",
  "Inox",
  "Teca",
  "Cubierta",
  "Bandas",
  "Pulido",
  "Red",
  "Compartimiento motor estribor",
  "Compartimiento motor babor",
  "Compartimiento generador",
  "Sentinas & grifos",
  "Techos salón",
  "Lavado cojines",
  "Limpieza línea flotación",
  "Limpieza casco",
  "Dinghy motor fuera de borda",
  "Dinghy casco",
  "Limpieza & WD-40 cañas de pesca",
  "Lavado con lavandina escalera de popa",
  "Botiquín",
];
const categories = [
  "Filtros",
  "Aceites y fluidos",
  "Mangueras",
  "Bombas",
  "Repuestos",
  "Electricidad",
  "Herramientas",
  "Limpieza",
  "Botiquín",
  "Otros",
];
const cleaningTasks = systems.slice(9, 25);
const engineTasks = [
  "Filtro de diésel primario",
  "Filtro de diésel secundario",
  "Correa",
  "Filtro de aceite",
  "Filtro de agua de mar",
  "Nivel de aceite del motor",
  "Nivel de aceite de la caja",
  "Nivel de aceite del piloto automático",
  "Reporte de pérdidas de aceite",
  "Reporte de pérdida de diésel",
  "Comprobar bombas de achique de sentina",
  "Impeler",
];
const taskTemplates = [
  ...cleaningTasks.map((name) => ({ title: name, system: name })),
  ...["Motor babor", "Motor estribor"].flatMap((system) =>
    engineTasks.map((title) => ({ title, system })),
  ),
];
const R = BoatRules;
let state,
  revision,
  session,
  boats = [],
  boatId = "",
  role = "",
  view = "panel",
  editing = null,
  filter = { q: "", system: "", status: "", equipment: "" },
  users = [],
  activity = [],
  unseenActivity = [],
  activityTimer,
  panelTasksExpanded = false,
  panelLogsExpanded = false;
const writable = () => role !== "lector";
const privateAccess = () => Boolean(session?.admin || role === "encargado");
const systemOptions = (current = "") => {
  const legacy = new Set();
  for (const row of [
    ...(state?.products || []),
    ...(state?.tasks || []),
    ...(state?.logs || []),
    ...(state?.boat?.equipment || []),
  ])
    if (row.system && !systems.includes(row.system)) legacy.add(row.system);
  if (current && !systems.includes(current)) legacy.add(current);
  return [...systems, ...legacy];
};
const money = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: state?.boat.currency || "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);
const options = (items, selected = "", blank = "") =>
  (blank ? `<option value="">${esc(blank)}</option>` : "") +
  items
    .map((x) => {
      const v = typeof x === "object" ? x.id : x;
      const n = typeof x === "object" ? x.name : x;
      return `<option value="${esc(v)}" ${String(v) === String(selected) ? "selected" : ""}>${esc(n)}</option>`;
    })
    .join("");
const field = (label, name, value = "", type = "text", extra = "") =>
  `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, items, value = "", blank = "") =>
  `<label>${esc(label)}<select name="${name}">${options(items, value, blank)}</select></label>`;
const area = (label, name, value = "", extra = "") =>
  `<label ${extra}>${esc(label)}<textarea name="${name}">${esc(value)}</textarea></label>`;
const empty = (text) => `<div class="empty">${text}</div>`;
const badge = (text, kind = "") =>
  `<span class="badge ${kind}">${esc(text)}</span>`;
const action = (name, text, id = "", style = "secondary") =>
  `<button class="${style}" data-action="${name}" data-id="${esc(id)}" type="button">${text}</button>`;
const eq = (id) => state.boat.equipment.find((e) => e.id === id);
const taskStatus = (t) =>
  t.done
    ? "Realizada"
    : R.due(t, today(), Number(eq(t.equipmentId)?.hours || 0));
const statusBadge = (t) => {
  let s = taskStatus(t);
  return badge(
    s === "Al día" ? "Pendiente" : s,
    s === "Vencido"
      ? "bad"
      : s === "Próximo"
        ? "warn"
        : s === "Realizada"
          ? "ok"
          : "",
  );
};
const stockBadge = (p) =>
  p.expiryDate && p.expiryDate <= today()
    ? badge("⛔ Vencido", "bad")
    : p.current === 0
    ? badge("Sin stock", "bad")
    : p.current <= p.min
      ? badge("Reponer", "warn")
    : p.expiryDate && p.expiryDate <= addDays(today(), 30)
      ? badge("Vence pronto", "warn")
      : badge("Disponible", "ok");
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
async function api(path, method = "GET", body) {
  let r;
  try {
    r = await fetch("/api/boat/" + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "No hay conexión con el servidor. No se guardaron cambios.",
    );
  }
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(
      "El servidor no está disponible. Intentá nuevamente en unos minutos.",
    );
  }
  if (!r.ok) {
    if (r.status === 401 && state) {
      state = null;
      startup();
    }
    throw new Error(data.error || "No se pudo completar la acción.");
  }
  return data;
}
async function uploadPhotos(next) {
  const upload = async (value) => {
    if (!value?.startsWith("data:image/")) return value;
    return (await api("photos", "POST", { boat: boatId, data: value })).url;
  };
  for (const p of next.products) if (p.photo) p.photo = await upload(p.photo);
  for (const t of next.tasks) if (t.photo) t.photo = await upload(t.photo);
  for (const l of next.logs)
    for (let i = 0; i < l.photos.length; i++) l.photos[i] = await upload(l.photos[i]);
}
async function portableBackup() {
  const copy = structuredClone(state);
  const load = async (value) => {
    if (!value?.startsWith("/api/boat/photos?")) return value;
    const response = await fetch(value);
    if (!response.ok) throw new Error("No se pudo descargar una foto. Volvé a intentar.");
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };
  for (const p of copy.products) if (p.photo) p.photo = await load(p.photo);
  for (const t of copy.tasks) if (t.photo) t.photo = await load(t.photo);
  for (const l of copy.logs)
    for (let i = 0; i < l.photos.length; i++) l.photos[i] = await load(l.photos[i]);
  return copy;
}
async function commit(next) {
  await uploadPhotos(next);
  const saved = await api("state?boat=" + encodeURIComponent(boatId), "PUT", {
    state: next,
    revision,
  });
  state = saved.state;
  revision = saved.revision;
  render();
}
async function loadBoat(id) {
  boatId = id;
  const r = await api("state?boat=" + encodeURIComponent(id));
  state = r.state;
  revision = r.revision;
  role = r.role;
  filter = { q: "", system: "", status: "", equipment: "" };
  panelTasksExpanded = false;
  panelLogsExpanded = false;
  await refreshActivity();
  render();
}
const activityStorageKey = () => `boat-activity-seen-${boatId}`;
async function refreshActivity(showToast = false) {
  if (!session?.admin || !boatId) {
    activity = [];
    unseenActivity = [];
    return;
  }
  const previous = unseenActivity.length;
  activity = await api("activity?boat=" + encodeURIComponent(boatId));
  const seen = Number(localStorage.getItem(activityStorageKey()) || 0);
  unseenActivity = activity.filter((item) => Number(item.id) > seen);
  if (state && unseenActivity.length !== previous) {
    render();
    if (showToast && unseenActivity.length > previous)
      toast("Hay nueva actividad registrada en el barco.");
  }
}
function activityNotice() {
  if (!session?.admin || !unseenActivity.length) return "";
  return `<div class="notice"><div class="card-heading"><strong>🔔 ${unseenActivity.length} ${unseenActivity.length === 1 ? "cambio nuevo" : "cambios nuevos"}</strong>${action("markActivityRead", "Marcar como visto", "", "text-btn")}</div>${unseenActivity.slice(0, 5).map((item) => `<div><strong>${esc(item.actor)}</strong> actualizó datos del barco · ${new Date(item.created_at).toLocaleString("es-AR")}</div>`).join("")}</div>`;
}
async function startup() {
  try {
    const info = await api("session");
    session = info.user;
    if (!session) return authScreen(info.setup);
    boats = await api("boats");
    if (view === "crew" && !session.admin) view = "panel";
    $("#navigation").hidden = false;
    $("#quickLog").hidden = false;
    $(".sidebar-foot").innerHTML =
      `<span class="dot"></span> Datos guardados en el servidor<small>${esc(session.name)} · ${action("logout", "Salir", "", "text-btn")}</small>`;
    if (!boats.length) {
      $("#content").innerHTML = empty(
        "Tu cuenta todavía no tiene un barco asignado. Pedile acceso al administrador.",
      );
      $("#quickLog").hidden = true;
      return;
    }
    await loadBoat(boats.some((b) => b.id === boatId) ? boatId : boats[0].id);
    clearInterval(activityTimer);
    if (session.admin)
      activityTimer = setInterval(
        () => refreshActivity(true).catch(() => {}),
        60000,
      );
  } catch (err) {
    $("#content").innerHTML =
      `<div class="notice">${esc(err.message)}</div>${localStorage.getItem("restaurant-stock-reservations-v1") ? `<div class="card"><h2>Datos gastronómicos anteriores encontrados</h2><p>Descargalos antes de pasar al servidor. Podés importarlos desde el módulo Gastronomía.</p>${action("exportLegacy", "Exportar gastronomía anterior", "", "primary")}</div>` : ""}<p>Revisá tu conexión y recargá la página para volver a intentar.</p>`;
  }
}
function authScreen(setup) {
  state = null;
  $("#boatLabel").textContent = "Control del barco";
  $("#notice").textContent = "";
  $(".sidebar-foot").textContent = "Inventario y mantenimiento, con acceso por cuenta.";
  $("#navigation").hidden = true;
  $("#quickLog").hidden = true;
  $("#viewTitle").textContent = setup
    ? "Bienvenido a bordo"
    : "Entrar al barco";
  $("#todayLabel").textContent = "Inventario · mantenimiento · tripulación";
  $("#content").innerHTML =
    `<div class="hero"><div><h2>La historia de tu barco, al día.</h2><p>Repuestos localizados, trabajos con fotos y una tripulación coordinada.</p></div><span class="wave">≈</span></div><section class="card" style="max-width:480px"><h2>${setup ? "Creá tu cuenta de administrador" : "Iniciá sesión"}</h2><p class="subhead">${setup ? "Este primer acceso queda a tu nombre. Después podés sumar al capitán y a la tripulación." : "Usá la cuenta que te asignó el administrador."}</p><form id="authForm">${setup ? field("Tu nombre", "name", "", "text", 'required autocomplete="name"') + field("Nombre del barco", "boat", "", "text", "required") : ""}${field("Usuario", "username", "", "text", 'required autocomplete="username"')}${field("Contraseña", "password", "", "password", `required minlength="10" autocomplete="${setup ? "new-password" : "current-password"}"`)}<p class="form-error" id="authError" role="alert"></p><button class="primary" type="submit">${setup ? "Crear cuenta y empezar" : "Entrar"}</button></form></section>`;
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector("button");
    button.disabled = true;
    try {
      await api(
        setup ? "setup" : "login",
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      await startup();
    } catch (err) {
      $("#authError").textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
}
function render() {
  if (!state) return;
  if (view === "cameras" && !privateAccess()) view = "panel";
  const titles = {
    panel: "Resumen del barco",
    manual: "Manual de instrucciones",
    stock: "Inventario técnico",
    tasks: "Tareas y rutinas",
    log: "Bitácora de mantenimiento",
    purchases: "Compras y movimientos",
    cameras: "Cámaras del barco",
    settings: "Barco y respaldo",
    crew: "Tripulación y accesos",
    food: "Stock gastronómico",
  };
  $("#viewTitle").textContent = titles[view];
  $("#todayLabel").textContent = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  $("#boatLabel").innerHTML =
    `<label style="margin:0;color:#b9d0db">Barco<select id="boatSelect" style="margin-top:6px">${options(boats, boatId)}</select></label>`;
  $("#boatSelect").onchange = (e) =>
    loadBoat(e.target.value).catch((err) => toast(err.message));
  $("#navigation")
    .querySelectorAll("[data-view]")
    .forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view);
      b.hidden =
        (b.dataset.view === "crew" && !session.admin) ||
        (b.hasAttribute("data-private") && !privateAccess());
    });
  $("#quickLog").hidden = !writable();
  $("#notice").innerHTML =
    (role === "lector"
      ? '<div class="notice">Acceso de lectura: podés consultar el barco y exportar un respaldo.</div>'
      : "") + activityNotice();
  (
    ({
      panel: renderPanel,
      manual: renderManual,
      stock: renderStock,
      tasks: renderTasks,
      log: renderLog,
      purchases: renderPurchases,
      cameras: renderCameras,
      settings: renderSettings,
      crew: renderCrew,
      food: renderFood,
    })[view] || renderPanel
  )();
}
function navigate(v) {
  view = v;
  filter = { q: "", system: "", status: "", equipment: "" };
  render();
}
function toolbar(
  buttonName,
  buttonLabel,
  searchPlaceholder = "Buscar",
  system = true,
) {
  return `<div class="toolbar"><input id="search" aria-label="${esc(searchPlaceholder)}" placeholder="${esc(searchPlaceholder)}" value="${esc(filter.q)}">${system ? `<select id="systemFilter" aria-label="Filtrar por sistema">${options(systemOptions(), filter.system, "Todos los sistemas")}</select>` : ""}${["tasks", "log"].includes(view) && state.boat.equipment.length ? `<select id="equipmentFilter" aria-label="Filtrar por equipo">${options(state.boat.equipment, filter.equipment, "Todos los equipos")}</select>` : ""}${writable() && buttonName ? action(buttonName, buttonLabel, "", "primary") : ""}</div>`;
}
function bindFilters(renderFn) {
  if ($("#equipmentFilter"))
    $("#equipmentFilter").onchange = (e) => {
      filter.equipment = e.target.value;
      renderFn();
    };
  if ($("#search"))
    $("#search").oninput = (e) => {
      filter.q = e.target.value;
      const pos = e.target.selectionStart;
      renderFn();
      $("#search").focus();
      $("#search").setSelectionRange(pos, pos);
    };
  if ($("#systemFilter"))
    $("#systemFilter").onchange = (e) => {
      filter.system = e.target.value;
      renderFn();
    };
}
function matches(o) {
  const q = filter.q.toLocaleLowerCase();
  return (
    (!q || JSON.stringify(o).toLocaleLowerCase().includes(q)) &&
    (!filter.system || o.system === filter.system) &&
    (!filter.equipment || o.equipmentId === filter.equipment)
  );
}
function taskCard(t) {
  return `<article class="card task-card ${taskStatus(t) === "Vencido" ? "overdue" : ""}">${t.photo ? `<img class="task-photo" src="${esc(t.photo)}" alt="Foto de ${esc(t.title)}">` : ""}<div><div class="record-meta">${statusBadge(t)} ${taskStatus(t) === "Vencido" ? badge("🚩 Atención", "bad") : ""} ${badge(t.system)}</div><h3>${esc(t.title)}</h3>${t.description ? `<p>${esc(t.description)}</p>` : ""}${t.observation ? `<p><strong>Observaciones:</strong> ${esc(t.observation)}</p>` : ""}<p>${esc(t.assignee || "Sin responsable")} · ${t.nextDate ? date(t.nextDate) : "Sin fecha límite"}${t.nextHours !== null && t.nextHours !== "" ? ` · ${t.nextHours} h de ${esc(eq(t.equipmentId)?.name || "equipo")}` : ""}</p>${t.intervalDays || t.intervalHours ? `<p>Se repite ${t.intervalDays ? `cada ${t.intervalDays} días` : ""}${t.intervalDays && t.intervalHours ? " o " : ""}${t.intervalHours ? `cada ${t.intervalHours} horas` : ""}</p>` : ""}</div><div class="actions">${!t.done && writable() ? action("completeTask", "Registrar trabajo", t.id, "primary") : ""}${writable() ? action("editTask", "Editar", t.id) : ""}</div></article>`;
}
function renderPanel() {
  const low = state.products.filter((p) => p.current <= p.min);
  const pending = state.tasks
    .filter((t) => !t.done)
    .sort((a, b) =>
      (a.nextDate || "9999").localeCompare(b.nextDate || "9999"),
    );
  const due = pending.filter((t) => taskStatus(t) === "Vencido");
  const logs = [...state.logs].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const shownTasks = panelTasksExpanded ? pending : pending.slice(0, 8);
  const shownLogs = panelLogsExpanded ? logs : logs.slice(0, 4);
  $("#content").innerHTML =
    `<div class="hero"><div><h2>El estado de tu barco, a la vista.</h2><p>${state.products.length ? `${pending.length} tareas pendientes · ${low.length} insumos para revisar.` : "Empezá cargando los equipos y los repuestos reales del barco."}</p></div><span class="wave">≈</span></div><div class="metrics"><article class="metric"><span>REPUESTOS E INSUMOS</span><strong>${state.products.length}</strong><small>En el inventario técnico</small></article><article class="metric"><span>PARA REPONER</span><strong>${low.length}</strong><small>En el mínimo o por debajo</small></article><article class="metric"><span>TAREAS PENDIENTES</span><strong>${pending.length}</strong><small>${due.length} vencidas por fecha u horas</small></article><article class="metric"><span>TRABAJOS REALIZADOS</span><strong>${state.logs.length}</strong><small>Historial del barco</small></article></div><section class="section-gap" id="pending-work"><div class="card-heading"><div><h2>Tareas pendientes</h2><p class="subhead">Lo que todavía hay que hacer. Al registrar el trabajo, queda guardado abajo como realizado.</p></div><div class="inline-actions">${writable() ? action("newTask", "＋ Nueva tarea", "", "secondary") + action("newLog", "＋ Registrar trabajo", "", "primary") + action("addTemplates", "Agregar tareas del barco", "", "secondary") : ""}</div></div><div class="task-list">${shownTasks.map(taskCard).join("") || empty("No hay tareas pendientes.")}</div>${pending.length > 8 ? action("togglePanelTasks", panelTasksExpanded ? "Mostrar menos" : `Mostrar las ${pending.length} tareas`, "", "text-btn") : ""}</section><section class="card section-gap"><div class="card-heading"><h2>Lista de reposición</h2>${action("goStock", "Ver inventario", "", "text-btn")}</div>${
      low.length
        ? low
            .slice(0, 5)
            .map(
              (p) =>
                `<div class="row-item"><div><h3>${esc(p.name)}</h3><p>${esc(p.location || "Ubicación sin definir")} · quedan ${p.current} ${esc(p.unit)}</p><p>Reponer ${R.round(Math.max(0, (p.target || p.min) - p.current))} ${esc(p.unit)} para llegar al objetivo</p></div>${stockBadge(p)}</div>`,
            )
            .join("")
        : empty(
            "No hay faltantes registrados.<br>Definí mínimos para recibir alertas de reposición.",
          )
    }</section><section class="section-gap" id="completed-work"><div class="card-heading"><div><h2>Trabajos realizados</h2><p class="subhead">Historial con fecha, responsable, observaciones, fotos y materiales utilizados.</p></div>${writable() ? action("newLog", "＋ Registrar trabajo", "", "primary") : ""}</div>${shownLogs.map(logCard).join("") || empty("Todavía no hay trabajos realizados.")}${logs.length > 4 ? action("togglePanelLogs", panelLogsExpanded ? "Mostrar menos" : `Mostrar los ${logs.length} trabajos`, "", "text-btn") : ""}</section>`;
}
function renderManual() {
  const manual = state.manual || {};
  $("#content").innerHTML =
    `<section class="hero"><div><h2>Manual de instrucciones</h2><p>La referencia principal para que cada persona sepa qué tarea le corresponde y cómo realizarla.</p></div><span class="wave">☰</span></section><section class="card"><div class="card-heading"><h2>Instrucciones del barco</h2>${privateAccess() ? action("editManual", "Editar manual", "", "primary") : ""}</div><div class="manual-content">${esc(manual.content || "El manual todavía no tiene contenido. Gustavo, como administrador actual, puede completarlo desde este botón.")}</div>${manual.updatedAt ? `<p class="muted">Actualizado ${date(manual.updatedAt)} por ${esc(manual.updatedBy || "responsable autorizado")}</p>` : ""}</section>`;
}
function renderStock() {
  const items = state.products.filter(matches);
  $("#content").innerHTML =
    toolbar(
      "newProduct",
      "＋ Agregar insumo",
      "Buscar repuesto, medida o ubicación",
    ) +
    `<p class="subhead">Stock técnico y botiquín. Cada artículo puede llevar stock mínimo y fecha de vencimiento.</p><div class="table-wrap"><table><thead><tr><th>Repuesto / artículo</th><th>Sistema y ubicación</th><th>Stock</th><th>Mínimo / objetivo</th><th>Vencimiento</th><th></th></tr></thead><tbody>${items.map((p) => `<tr><td><div class="product-cell">${p.photo ? `<img class="photo" src="${esc(p.photo)}" alt="${esc(p.name)}">` : '<span class="photo-placeholder">▦</span>'}<div><strong>${esc(p.name)}</strong><small>${esc(p.specs || p.code || p.category)}</small></div></div></td><td>${esc(p.system)}<small>${esc(p.location || "Sin ubicación")} ${p.equipment ? `· ${esc(p.equipment)}` : ""}</small></td><td><strong>${p.current} ${esc(p.unit)}</strong><small>${stockBadge(p)}</small></td><td>${p.min} / ${p.target ?? p.min} ${esc(p.unit)}</td><td>${p.expiryDate ? date(p.expiryDate) : "—"}</td><td class="actions">${action("showProduct", "Ver", p.id)} ${writable() ? action("editProduct", "Editar", p.id) : ""}</td></tr>`).join("") || `<tr><td colspan="6">${empty("Todavía no hay insumos cargados. Agregá el primer repuesto o artículo de botiquín.")}</td></tr>`}</tbody></table></div><p class="search-summary">${items.length} artículos · Valor registrado: ${money(items.reduce((a, p) => a + p.current * p.cost, 0))}</p>${writable() ? `<section class="hint"><strong>Botiquín:</strong> cargá cada artículo real con cantidad, mínimo y vencimiento. El sistema marcará en rojo lo vencido. ${action("newFirstAid", "Agregar artículo de botiquín", "", "text-btn")}</section>` : ""}`;
  bindFilters(renderStock);
}
function renderTasks() {
  const items = state.tasks
    .filter(matches)
    .filter((t) => (filter.status === "done" ? t.done : !t.done));
  $("#content").innerHTML =
    toolbar("newTask", "＋ Nueva tarea", "Buscar tarea o responsable") +
    `<div class="inline-actions" style="margin-bottom:18px">${action("pendingTasks", "Pendientes", "", "secondary")}${action("doneTasks", "Realizadas", "", "secondary")}${writable() ? action("addTemplates", "Agregar tareas del barco", "", "secondary") : ""}</div><p class="subhead">Cada tarea puede tener fecha, foto, observaciones y frecuencia propia. Cuando vence sin realizarse queda señalada con bandera roja.</p><div class="task-list">${
      items
        .sort((a, b) =>
          (a.nextDate || "9999").localeCompare(b.nextDate || "9999"),
        )
        .map(
          taskCard,
        )
        .join("") ||
      empty(
        filter.status === "done"
          ? "No hay tareas cerradas. Las ejecuciones de rutinas también quedan en la bitácora."
          : "No hay tareas pendientes para estos filtros.",
      )
    }</div>`;
  bindFilters(renderTasks);
}
function logCard(l) {
  return `<article class="card record"><div class="card-heading"><h2>${esc(l.title)}</h2>${badge(l.type)}</div><div class="record-meta"><span>${date(l.date)}</span><span>· ${esc(l.responsible)}</span><span>· ${esc(l.system)}</span>${l.equipmentName ? `<span>· ${esc(l.equipmentName)} ${l.hours !== "" ? `${l.hours} h` : ""}</span>` : ""}</div><p>${esc(l.notes)}</p>${l.lines.length ? `<p><strong>Material utilizado:</strong> ${l.lines.map((x) => `${x.quantity} ${esc(x.unit)} de ${esc(x.name)}`).join(" · ")}</p>` : ""}${l.observation ? `<div class="hint"><strong>Observación / seguimiento</strong><br>${esc(l.observation)}</div>` : ""}<div class="attachments">${(l.photos || []).map((p, i) => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="Foto ${i + 1} del trabajo ${esc(l.title)}"></a>`).join("")}</div><p class="muted">Cargado por ${esc(l.recordedBy || l.responsible)}${l.recordedAt ? ` · ${date(l.recordedAt)}` : ""}</p></article>`;
}
function renderLog() {
  const items = state.logs
    .filter(matches)
    .sort((a, b) => b.date.localeCompare(a.date));
  $("#content").innerHTML =
    toolbar(
      "newLog",
      "＋ Registrar trabajo",
      "Buscar trabajo, material o responsable",
    ) +
    (items.map(logCard).join("") ||
      empty(
        "No hay trabajos registrados. La historia del barco aparecerá acá.",
      ));
  bindFilters(renderLog);
}
function renderPurchases() {
  const movements = [...state.movements].reverse().filter(matches);
  $("#content").innerHTML =
    `<div class="toolbar">${writable() ? action("newPurchase", "＋ Registrar compra", "", "primary") + " " + action("newMovement", "Entrada, salida o recuento") : ""}${action("exportShopping", "Exportar lista de reposición")}</div><div class="hint">Las compras suman stock. Los trabajos descuentan sus materiales automáticamente. Usá un recuento para corregir una diferencia física, indicando el motivo.</div><h2>Compras recientes</h2><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor / comprobante</th><th>Detalle</th><th>Total</th></tr></thead><tbody>${
      [...state.purchases]
        .reverse()
        .map(
          (p) =>
            `<tr><td>${date(p.date)}</td><td>${esc(p.supplier)}<small>${esc(p.reference)}</small></td><td>${p.lines.map((l) => `${l.quantity} ${esc(l.unit)} · ${esc(l.name)}`).join("<br>")}</td><td>${money(p.total)}</td></tr>`,
        )
        .join("") ||
      `<tr><td colspan="4">${empty("No hay compras registradas.")}</td></tr>`
    }</tbody></table></div><h2 class="section-gap">Movimientos de stock</h2>${toolbar("", "", "Buscar producto o motivo", false)}<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Insumo</th><th>Movimiento</th><th>Motivo / responsable</th><th>Saldo</th></tr></thead><tbody>${movements.map((m) => `<tr><td>${date(m.date)}</td><td>${esc(m.name)}</td><td>${m.delta >= 0 ? "+" : ""}${m.delta} ${esc(m.unit)}</td><td>${esc(m.reason)}<small>${esc(m.responsible)}</small></td><td>${m.balance} ${esc(m.unit)}</td></tr>`).join("") || `<tr><td colspan="5">${empty("Todavía no hay movimientos.")}</td></tr>`}</tbody></table></div>`;
  bindFilters(renderPurchases);
}
function renderCameras() {
  if (!privateAccess()) return navigate("panel");
  $("#content").innerHTML =
    `<div class="toolbar">${writable() ? action("newCamera", "＋ Agregar cámara", "", "primary") : ""}</div><div class="notice"><strong>Integración pendiente de verificar.</strong> Guardá el modelo y los enlaces del proveedor. La vista en vivo y las grabaciones se abren en su sistema; esta aplicación todavía no recibe ni graba video. Para integrarlas se necesita confirmar el modelo, el acceso y la compatibilidad del proveedor.</div><div class="columns">${state.cameras.map((c) => `<article class="card"><div class="card-heading"><h2>${esc(c.name)}</h2>${badge("Sin verificar", "warn")}</div><p>${esc(c.location)} · ${esc(c.model || "Modelo pendiente")}</p><p class="subhead">${esc(c.notes)}</p><div class="inline-actions">${safeUrl(c.live) ? `<a class="primary" href="${esc(c.live)}" target="_blank" rel="noopener noreferrer">Abrir vista en vivo ↗</a>` : ""}${safeUrl(c.recordings) ? `<a class="secondary" href="${esc(c.recordings)}" target="_blank" rel="noopener noreferrer">Ver grabaciones ↗</a>` : ""}${writable() ? action("editCamera", "Configurar", c.id) : ""}</div></article>`).join("") || empty("No hay cámaras configuradas en este barco.")}</div><section class="card section-gap"><h2>Cámaras nuevas: selección inicial</h2><p><strong>Reolink RLC-810WA + grabador RLN12W.</strong> Cámara de 12 V CC, Wi-Fi 6 y 4K. El grabador también se alimenta a 12 V y centraliza video en vivo y grabaciones de varias cámaras.</p><p class="subhead">La cámara admite 20 cuentas, con un máximo de 12 transmisiones simultáneas (2 principales y 10 secundarias). El fabricante publica cifras diferentes de 12 y 16 canales para el grabador; confirmá la versión exacta antes de comprar.</p><div class="inline-actions"><a class="secondary" href="https://reolink.com/product/rlc-810wa/" target="_blank" rel="noopener">Ficha oficial de cámara ↗</a><a class="secondary" href="https://reolink.com/product/rln12w/" target="_blank" rel="noopener">Ficha oficial del grabador ↗</a></div><p class="subhead">Alternativa: RLC-510WA, 5 MP y alimentación de 12 V. Esta selección no acredita resistencia a salitre ni integración ya probada en el barco. Verificá instalación eléctrica y cobertura Wi-Fi a bordo.</p><h2 class="section-gap">Lo solicitado en la grabación</h2><p>Acceso por barco para personas autorizadas, monitoreo desde teléfono, tablet o TV y consulta de grabaciones anteriores.</p><p class="subhead">También se mencionan conexión inalámbrica, alimentación de 12 V y una cámara portátil para asistencia durante trabajos. La compatibilidad con esas opciones queda pendiente del modelo de hardware; no se da por resuelta.</p></section>`;
}
function safePhoto(value) {
  return (
    typeof value === "string" &&
    (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) || /^\/api\/boat\/photos\?boat=[a-f0-9-]{32,36}&id=[a-f0-9-]{36}$/.test(value))
  );
}
function safeUrl(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : "";
  } catch {
    return "";
  }
}
function renderSettings() {
  $("#content").innerHTML =
    `<div class="columns"><section class="card"><div class="card-heading"><h2>Ficha del barco</h2>${writable() ? action("editBoat", "Editar") : ""}</div><h3>${esc(state.boat.name)}</h3><p>${esc(state.boat.model || "Modelo sin cargar")}</p><p class="subhead">Moneda: ${esc(state.boat.currency)} · Acceso: ${esc(role)}</p>${session.admin ? action("newBoat", "＋ Agregar otro barco") : ""}</section><section class="card"><h2>Respaldo de este barco</h2><p class="subhead">Incluye inventario, fotos, tareas, historial y cámaras. Las cuentas de acceso se guardan por separado en el servidor.</p><div class="inline-actions">${action("export", "Descargar respaldo", "", "primary")}${writable() ? action("import", "Restaurar respaldo") : ""}</div><input hidden id="importFile" type="file" accept="application/json,.json"></section></div><section class="card section-gap"><div class="card-heading"><h2>Equipos y horas de uso</h2>${writable() ? action("newEquipment", "＋ Agregar equipo") : ""}</div><p class="subhead">Registrá cada motor por separado, además del generador y otros equipos. Cada uno mantiene sus propias horas y tareas.</p>${state.boat.equipment.map((e) => `<div class="row-item"><div><h3>${esc(e.name)}</h3><p>${esc(e.system)} · ${esc(e.model || "Modelo sin cargar")}</p></div><strong>${e.hours} h</strong>${writable() ? action("editEquipment", "Actualizar", e.id) : ""}</div>`).join("") || empty("No hay equipos cargados.")}</section>`;
  if ($("#importFile")) $("#importFile").onchange = restore;
}
async function renderCrew() {
  $("#content").innerHTML = '<div class="card">Cargando accesos…</div>';
  try {
    users = await api("users");
    if (view !== "crew") return;
    $("#content").innerHTML =
      `<div class="toolbar">${action("newUser", "＋ Crear acceso", "", "primary")}${action("changeAccess", "Cambiar acceso a un barco")}</div><p class="subhead">Actualmente Gustavo es el único administrador y responsable de modificar la aplicación. Los accesos para capitán, marinero, lector o encargado se crearán más adelante, cuando corresponda; la tripulación no tendrá acceso a cámaras.</p><div class="table-wrap"><table><thead><tr><th>Persona</th><th>Usuario</th><th>Accesos</th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${u.admin ? "Administrador · todos los barcos" : u.boats.map((b) => `${esc(boats.find((x) => x.id === b.boat_id)?.name || "Barco")} · ${esc(b.role)}`).join("<br>") || "Sin acceso"}</td></tr>`).join("")}</tbody></table></div>`;
  } catch (err) {
    $("#content").innerHTML = empty(esc(err.message));
  }
}
function renderFood() {
  $("#content").innerHTML =
    `<section class="hero"><div><h2>Gastronomía, por separado.</h2><p>El módulo original conserva productos, compras, recetas, pedidos y reservas. Sus movimientos no afectan los repuestos del barco.</p></div><span class="wave">▦</span></section><section class="card"><h2>Módulo gastronómico original</h2><p>Sus datos siguen guardados en el navegador donde se cargaron. Todavía no se sincronizan con las cuentas y los barcos de este módulo técnico.</p><p class="subhead">Si antes lo abrías como archivo local, abrí el archivo original para exportar tus datos: el navegador separa la información según la dirección de la página. No se borró ni reemplazó esa información.</p><a class="primary" href="gastronomia/index.html" target="_blank" rel="noopener">Abrir gastronomía ↗</a></section>`;
}
function openEditor(type, obj = {}) {
  if (!writable() && !["detail", "logDetail"].includes(type)) return;
  editing = { type, id: obj.id || "", obj };
  $("#formError").textContent = "";
  $("#saveButton").hidden = false;
  $("#saveButton").disabled = false;
  let title = "",
    html = "";
  if (type === "product") {
    title = obj.id ? "Editar insumo" : "Agregar repuesto o insumo";
    html = `<div class="form-grid">${field("Nombre", "name", obj.name, "text", 'required maxlength="140"')}${select("Categoría", "category", categories, obj.category || (obj.system === "Botiquín" ? "Botiquín" : "Repuestos"))}${select("Sistema", "system", systemOptions(obj.system), obj.system || "Motor babor")}${field("Equipo / modelo compatible", "equipment", obj.equipment)}${field("Código o referencia", "code", obj.code)}${field("Ubicación a bordo", "location", obj.location, "text", 'required placeholder="Ej.: pañol de proa · caja 2"')}${field("Especificaciones y medidas", "specs", obj.specs, "text", 'placeholder="Diámetro interior, material, modelo…"')}${select("Unidad", "unit", ["un", "m", "L", "kg", "juego"], obj.unit || "un")}${field(obj.id ? "Stock actual (se ajusta en movimientos)" : "Cantidad contada a bordo", "current", obj.current ?? "", "number", `required min="0" step="0.0001" ${obj.id ? "readonly" : ""}`)}${field("Stock mínimo", "min", obj.min ?? 0, "number", 'required min="0" step="0.0001"')}${field("Objetivo de reposición", "target", obj.target ?? 0, "number", 'required min="0" step="0.0001"')}${field("Fecha de vencimiento", "expiryDate", obj.expiryDate || "", "date")}${field("Costo unitario (" + state.boat.currency + ")", "cost", obj.cost ?? 0, "number", 'required min="0" step="0.01"')}${field("Proveedor / contacto", "supplier", obj.supplier)}<label>Foto del repuesto o artículo<input name="photo" type="file" accept="image/*"><small>Opcional. Sirve para identificarlo; no se deducen cantidades de la imagen.</small></label></div>`;
  }
  if (type === "task") {
    title = obj.id ? "Editar tarea" : "Nueva tarea o rutina";
    html = `<div class="form-grid">${field("Tarea", "title", obj.title, "text", "required")}${select("Sistema", "system", systemOptions(obj.system), obj.system || "Motor babor")}${field("Responsable asignado", "assignee", obj.assignee)}${select("Equipo", "equipmentId", state.boat.equipment, obj.equipmentId, "Sin equipo específico")}${field("Próxima fecha", "nextDate", obj.nextDate || "", "date")}${field("Próximo mantenimiento a las horas", "nextHours", obj.nextHours ?? "", "number", 'min="0" step="0.1"')}${field("Frecuencia: cada cuántos días", "intervalDays", obj.intervalDays || "", "number", 'min="1" step="1" placeholder="Ej.: 7"')}${field("Frecuencia: cada cuántas horas", "intervalHours", obj.intervalHours || "", "number", 'min="1" step="0.1" placeholder="Vacío: sin repetición por horas"')}${area("Instrucciones / controles", "description", obj.description, 'class="full"')}${area("Observaciones", "observation", obj.observation, 'class="full"')}<label class="full">Foto de referencia<input name="taskPhoto" type="file" accept="image/*"><small>Opcional. La foto queda en la tarea; al realizarla se pueden adjuntar hasta 3 fotos nuevas.</small></label></div><p class="hint">Si configurás una frecuencia, la tarea se reprograma al completarla. Si llega la fecha o las horas sin realizarse, aparece con bandera roja.</p>`;
  }
  if (type === "log") {
    const t = obj.taskId ? state.tasks.find((t) => t.id === obj.taskId) : null;
    title = t ? "Completar tarea" : "Registrar trabajo a bordo";
    editing.taskId = t?.id || "";
    html = `<div class="form-grid">${field("Trabajo realizado", "title", t?.title || "", "text", "required")}${select("Tipo de trabajo", "type", ["Mantenimiento", "Limpieza", "Reparación", "Verificación de funcionamiento"])}${field("Fecha del trabajo", "date", today(), "date", `required max="${today()}"`)}${field("Realizado por", "responsible", session.name, "text", "required")}${select("Sistema", "system", systemOptions(t?.system), t?.system || "Motor babor")}${select("Equipo", "equipmentId", state.boat.equipment, t?.equipmentId, "Sin equipo específico")}${field("Horas del equipo al realizar el trabajo", "hours", t?.equipmentId ? (eq(t.equipmentId)?.hours ?? "") : "", "number", 'min="0" step="0.1"')}${area("Detalle de lo realizado", "notes", "", 'class="full"')}<label class="full">Fotos del trabajo / material utilizado<input name="photos" type="file" accept="image/*" multiple><small>Hasta 3 fotos. El material y su cantidad se confirman abajo.</small></label></div><h3>Material utilizado</h3><p class="subhead">Se descontará del stock al guardar. Podés registrar trabajos sin consumo.</p><div id="materialLines"></div>${action("addMaterial", "＋ Agregar material")}<div class="section-gap">${area("Observaciones o problemas detectados", "observation")}<label class="check"><input name="followup" type="checkbox">Crear una tarea pendiente con esta observación</label></div>`;
  }
  if (type === "purchase") {
    title = "Registrar compra";
    html = `<div class="form-grid">${field("Proveedor", "supplier", "", "text", "required")}${field("Factura / ticket / referencia", "reference")}${field("Fecha", "date", today(), "date", `required max="${today()}"`)}</div><h3>Insumos recibidos</h3><p class="subhead">Elegí insumos del inventario. Si es un repuesto nuevo, creá primero su ficha.</p><div id="purchaseLines"></div>${action("addPurchaseLine", "＋ Agregar insumo")}`;
  }
  if (type === "movement") {
    title = "Entrada, salida o recuento";
    html = `${select("Insumo", "productId", state.products)}${select(
      "Operación",
      "kind",
      [
        { id: "entrada", name: "Entrada de stock" },
        { id: "salida", name: "Salida de stock" },
        { id: "recuento", name: "Recuento físico (cantidad final)" },
      ],
    )}${field("Cantidad", "quantity", "", "number", 'required min="0" step="0.0001"')}${field("Motivo / referencia", "reason", "", "text", "required")}<p class="hint">En un recuento ingresá lo que hay físicamente. Se registrará la diferencia, conservando el historial anterior.</p>`;
  }
  if (type === "equipment") {
    title = obj.id ? "Actualizar equipo" : "Agregar equipo";
    html = `<div class="form-grid">${field("Nombre del equipo", "name", obj.name, "text", 'required placeholder="Ej.: motor de babor"')}${select("Sistema", "system", systemOptions(obj.system), obj.system || "Motor babor")}${field("Marca y modelo", "model", obj.model)}${field("Horas actuales", "hours", obj.hours ?? 0, "number", 'required min="0" step="0.1"')}</div><p class="hint">Motor babor y motor estribor se registran por separado. Las horas no pueden disminuir.</p>`;
  }
  if (type === "boat") {
    title = "Ficha del barco";
    html = `${field("Nombre del barco", "name", state.boat.name, "text", "required")}${field("Modelo / matrícula", "model", state.boat.model)}${select("Moneda de los costos", "currency", ["USD", "ARS", "EUR"], state.boat.currency)}<p class="hint">La moneda no convierte importes. No se puede cambiar después de registrar costos o compras.</p>`;
  }
  if (type === "newBoat") {
    title = "Agregar barco";
    html = field("Nombre del barco", "name", "", "text", "required");
  }
  if (type === "camera") {
    title = obj.id ? "Configurar cámara" : "Agregar cámara";
    html = `<div class="form-grid">${field("Nombre", "name", obj.name, "text", "required")}${field("Ubicación", "location", obj.location)}${field("Marca y modelo", "model", obj.model)}${field("Enlace del proveedor: vista en vivo", "live", obj.live, "url")}${field("Enlace del proveedor: grabaciones", "recordings", obj.recordings, "url")}${area("Características / observaciones", "notes", obj.notes, 'class="full"')}</div><p class="hint">No incluyas contraseñas ni tokens en los enlaces. Guardar estos datos no conecta ni verifica el video.</p>`;
  }
  if (type === "manual") {
    if (!privateAccess()) return;
    title = "Editar manual de instrucciones";
    html = `${area("Instrucciones para la tripulación", "content", state.manual?.content || "", 'class="full" rows="18"')}<p class="hint">Solo el administrador y las personas con permiso de Encargado pueden modificar este manual. Toda la tripulación puede consultarlo.</p>`;
  }
  if (type === "user") {
    title = "Crear acceso de tripulación";
    html = `${field("Nombre", "name", "", "text", "required")}${field("Usuario", "username", "", "text", 'required autocomplete="off"')}${field("Contraseña inicial", "password", "", "password", 'required minlength="10" autocomplete="new-password"')}${select("Barco", "boat", boats, boatId)}${select(
      "Permiso",
      "role",
      [
        { id: "capitan", name: "Capitán · puede registrar operaciones" },
        { id: "marinero", name: "Marinero · puede registrar operaciones" },
        { id: "lector", name: "Lector · solo consulta" },
        { id: "encargado", name: "Encargado · manual y cámaras" },
      ],
    )}<p class="hint">Entregá el usuario y la contraseña por un canal privado. No se envía ningún mensaje automáticamente.</p>`;
  }
  if (type === "access") {
    title = "Cambiar acceso a un barco";
    html = `${select(
      "Persona",
      "user",
      users.filter((u) => !u.admin),
    )}${select("Barco", "boat", boats, boatId)}${select("Permiso", "role", [
      { id: "capitan", name: "Capitán" },
      { id: "marinero", name: "Marinero" },
      { id: "lector", name: "Solo lectura" },
      { id: "encargado", name: "Encargado · manual y cámaras" },
      { id: "sin_acceso", name: "Quitar acceso a este barco" },
    ])}`;
  }
  if (type === "detail") {
    title = obj.name;
    $("#saveButton").hidden = true;
    html = `${obj.photo ? `<div class="attachments"><img src="${esc(obj.photo)}" alt="${esc(obj.name)}"></div>` : ""}<div class="detail-grid section-gap"><p><small>Ubicación</small><br>${esc(obj.location)}</p><p><small>Sistema / equipo</small><br>${esc(obj.system)} · ${esc(obj.equipment)}</p><p><small>Medidas y especificaciones</small><br>${esc(obj.specs || "Sin especificar")}</p><p><small>Código / referencia</small><br>${esc(obj.code || "Sin especificar")}</p><p><small>Stock disponible</small><br>${obj.current} ${esc(obj.unit)} · ${stockBadge(obj)}</p><p><small>Fecha de vencimiento</small><br>${obj.expiryDate ? date(obj.expiryDate) : "Sin vencimiento cargado"}</p><p><small>Proveedor</small><br>${esc(obj.supplier || "Sin proveedor")}</p><p><small>Costo unitario</small><br>${money(obj.cost)}</p></div>`;
  }
  if (type === "logDetail") {
    title = "Detalle del trabajo";
    $("#saveButton").hidden = true;
    html = logCard(obj);
  }
  $("#editorTitle").textContent = title;
  $("#editorFields").innerHTML = html;
  $("#editor").showModal();
  if (type === "purchase") addLine("purchase");
}
function addLine(kind) {
  const purchase = kind === "purchase";
  const container = $(purchase ? "#purchaseLines" : "#materialLines");
  if (!state.products.length) {
    toast("Primero agregá un insumo al inventario.");
    return;
  }
  const row = document.createElement("div");
  row.className = "consumption-line";
  row.innerHTML = `<select class="line-product" aria-label="${purchase ? "Insumo comprado" : "Material utilizado"}">${options(state.products.map((p) => ({ id: p.id, name: `${p.name} · ${p.current} ${p.unit}` })))}</select><input class="line-quantity" aria-label="Cantidad de ${purchase ? "compra" : "material"}" type="number" required min="0.0001" step="0.0001" placeholder="Cant.">${purchase ? '<input class="line-cost" aria-label="Costo unitario de compra" type="number" required min="0" step="0.01" placeholder="Costo">' : ""}<button type="button" class="icon-btn" data-action="removeLine" aria-label="Quitar material">×</button>`;
  if (purchase) {
    row.style.gridTemplateColumns = "minmax(100px,1fr) 70px 80px auto";
    row.querySelector(".line-cost").value = state.products[0].cost;
    row.querySelector(".line-product").onchange = (e) =>
      (row.querySelector(".line-cost").value = state.products.find(
        (p) => p.id === e.target.value,
      ).cost);
  }
  container.append(row);
}
function getLines(container, purchase = false) {
  return [...$(container).children].map((row) => {
    const product = state.products.find(
      (p) => p.id === row.querySelector(".line-product").value,
    );
    if (!product) throw new Error("Elegí un insumo válido.");
    const quantity = R.number(
      row.querySelector(".line-quantity").value,
      "Cantidad",
      true,
    );
    return {
      productId: product.id,
      name: product.name,
      unit: product.unit,
      quantity,
      ...(purchase
        ? { cost: R.number(row.querySelector(".line-cost").value, "Costo") }
        : {}),
    };
  });
}
async function photo(file) {
  if (!file) return "";
  if (!file.type.startsWith("image/"))
    throw new Error("Seleccioná una imagen válida.");
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Cada foto debe pesar menos de 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    throw new Error("No se pudo leer la foto. Probá con JPG o PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
function movement(
  next,
  p,
  delta,
  reason,
  when = today(),
  responsible = session.name,
) {
  next.movements.push({
    id: uid(),
    productId: p.id,
    name: p.name,
    unit: p.unit,
    delta: R.round(delta),
    balance: p.current,
    reason,
    date: when,
    responsible,
  });
}
$("#editorForm").onsubmit = async (event) => {
  event.preventDefault();
  if (!editing || !writable()) return;
  const button = $("#saveButton");
  if (button.disabled) return;
  button.disabled = true;
  $("#formError").textContent = "";
  try {
    const form = event.target;
    const d = Object.fromEntries(new FormData(form));
    for (const key in d) if (typeof d[key] === "string") d[key] = d[key].trim();
    const next = structuredClone(state);
    const { type, id, obj } = editing;
    if (type === "product") {
      const p = {
        id: id || uid(),
        name: d.name,
        category: d.category,
        system: d.system,
        equipment: d.equipment,
        code: d.code,
        location: d.location,
        specs: d.specs,
        unit: d.unit,
        current: R.number(d.current, "Stock actual"),
        min: R.number(d.min, "Stock mínimo"),
        target: R.number(d.target, "Objetivo"),
        cost: R.number(d.cost, "Costo"),
        supplier: d.supplier,
        expiryDate: d.expiryDate || "",
        photo: obj.photo || "",
      };
      if (!p.name || !p.location)
        throw new Error("Completá nombre y ubicación.");
      if (p.target < p.min)
        throw new Error(
          "El objetivo de reposición no puede ser menor que el mínimo.",
        );
      if (
        id &&
        obj.unit !== p.unit &&
        (obj.current !== 0 || state.movements.some((m) => m.productId === id))
      )
        throw new Error(
          "Esta unidad ya tiene stock o movimientos. Creá otra ficha para una unidad distinta.",
        );
      const file = form.elements.photo.files[0];
      if (file) p.photo = await photo(file);
      const i = next.products.findIndex((x) => x.id === id);
      if (i >= 0) {
        p.current = obj.current;
        next.products[i] = p;
      } else {
        next.products.push(p);
        movement(next, p, p.current, "Inventario inicial");
      }
    } else if (type === "task") {
      let nextHours =
        d.nextHours === "" ? "" : R.number(d.nextHours, "Próximas horas");
      const intervalDays =
        d.intervalDays === ""
          ? 0
          : R.number(d.intervalDays, "Intervalo de días", true);
      const intervalHours =
        d.intervalHours === ""
          ? 0
          : R.number(d.intervalHours, "Intervalo de horas", true);
      if (!d.title) throw new Error("Escribí la tarea.");
      if ((nextHours !== "" || intervalHours) && !d.equipmentId)
        throw new Error("Seleccioná el equipo para programar por horas.");
      if (intervalDays && !Number.isInteger(intervalDays))
        throw new Error("El intervalo de días debe ser entero.");
      if (nextHours === "" && intervalHours)
        nextHours = R.round(Number(eq(d.equipmentId).hours) + intervalHours);
      let nextDate = d.nextDate;
      if (!nextDate && intervalDays) nextDate = addDays(today(), intervalDays);
      const task = {
        id: id || uid(),
        title: d.title,
        system: d.system,
        assignee: d.assignee,
        equipmentId: d.equipmentId,
        nextDate,
        nextHours,
        intervalDays,
        intervalHours,
        description: d.description,
        observation: d.observation,
        photo: obj.photo || "",
        done: obj.done || false,
      };
      const taskFile = form.elements.taskPhoto.files[0];
      if (taskFile) task.photo = await photo(taskFile);
      const i = next.tasks.findIndex((x) => x.id === id);
      if (i >= 0) next.tasks[i] = task;
      else next.tasks.push(task);
    } else if (type === "log") {
      if (!d.title || !d.responsible)
        throw new Error("Completá el trabajo y su responsable.");
      if (!d.date || d.date > today())
        throw new Error("La fecha del trabajo no puede ser futura.");
      const task = next.tasks.find((t) => t.id === editing.taskId);
      if (editing.taskId && (!task || task.done))
        throw new Error("Esta tarea ya no está pendiente.");
      const lines = getLines("#materialLines");
      next.products = R.consume(next.products, lines);
      const equipment = next.boat.equipment.find((e) => e.id === d.equipmentId);
      const hours = d.hours === "" ? "" : R.number(d.hours, "Horas del equipo");
      if (hours !== "" && !equipment)
        throw new Error("Seleccioná el equipo al que pertenecen esas horas.");
      if (
        task?.intervalHours &&
        (hours === "" || task.equipmentId !== d.equipmentId)
      )
        throw new Error(
          "Indicá las horas del equipo asignado para reprogramar esta rutina.",
        );
      if (equipment && hours !== "")
        equipment.hours = Math.max(equipment.hours, hours);
      const files = [...form.elements.photos.files];
      if (files.length > 3)
        throw new Error("Podés adjuntar hasta 3 fotos por trabajo.");
      const photos = await Promise.all(files.map(photo));
      const log = {
        id: uid(),
        taskId: editing.taskId || "",
        title: d.title,
        type: d.type,
        date: d.date,
        responsible: d.responsible,
        system: d.system,
        equipmentId: d.equipmentId,
        equipmentName: equipment?.name || "",
        hours,
        notes: d.notes,
        observation: d.observation,
        lines,
        photos,
      };
      if (d.followup && !d.observation)
        throw new Error(
          "Describí la observación antes de crear el seguimiento.",
        );
      next.logs.push(log);
      const grouped = new Map();
      for (const l of lines)
        grouped.set(
          l.productId,
          R.round((grouped.get(l.productId) || 0) + l.quantity),
        );
      for (const [pid, qty] of grouped)
        movement(
          next,
          next.products.find((p) => p.id === pid),
          -qty,
          "Trabajo: " + d.title,
          d.date,
          d.responsible,
        );
      if (task) {
        task.lastCompleted = d.date;
        if (task.intervalDays || task.intervalHours) {
          task.nextDate = task.intervalDays
            ? addDays(d.date, task.intervalDays)
            : "";
          task.nextHours = task.intervalHours
            ? R.round(hours + task.intervalHours)
            : "";
        } else task.done = true;
      }
      if (d.followup)
        next.tasks.push({
          id: uid(),
          title: d.observation.slice(0, 140),
          description: d.observation,
          system: d.system,
          equipmentId: d.equipmentId,
          assignee: d.responsible,
          nextDate: "",
          nextHours: "",
          intervalDays: 0,
          intervalHours: 0,
          observation: "",
          photo: "",
          done: false,
        });
    } else if (type === "purchase") {
      const lines = getLines("#purchaseLines", true);
      if (!lines.length) throw new Error("Agregá al menos un insumo.");
      if (!d.supplier || !d.date || d.date > today())
        throw new Error("Completá proveedor y una fecha no futura.");
      const total = R.round(
        lines.reduce((sum, l) => sum + l.quantity * l.cost, 0),
      );
      const purchase = {
        id: uid(),
        date: d.date,
        supplier: d.supplier,
        reference: d.reference,
        lines,
        total,
      };
      for (const line of lines) {
        const p = next.products.find((p) => p.id === line.productId);
        p.current = R.round(p.current + line.quantity);
        p.cost = line.cost;
        p.supplier = d.supplier;
        movement(
          next,
          p,
          line.quantity,
          "Compra: " + (d.reference || d.supplier),
          d.date,
        );
      }
      next.purchases.push(purchase);
    } else if (type === "movement") {
      const p = next.products.find((p) => p.id === d.productId);
      if (!p) throw new Error("Seleccioná un insumo.");
      const quantity = R.number(d.quantity, "Cantidad", d.kind !== "recuento");
      const delta =
        d.kind === "recuento"
          ? quantity - p.current
          : d.kind === "salida"
            ? -quantity
            : quantity;
      if (p.current + delta < 0)
        throw new Error("La salida supera el stock disponible.");
      if (!d.reason) throw new Error("Ingresá el motivo del movimiento.");
      p.current = R.round(p.current + delta);
      movement(
        next,
        p,
        delta,
        (d.kind === "recuento" ? "Recuento: " : "") + d.reason,
      );
    } else if (type === "equipment") {
      const hours = R.number(d.hours, "Horas");
      if (id && hours < obj.hours)
        throw new Error("Las horas no pueden disminuir.");
      if (!d.name) throw new Error("Completá el nombre del equipo.");
      const item = {
        id: id || uid(),
        name: d.name,
        system: d.system,
        model: d.model,
        hours,
      };
      const i = next.boat.equipment.findIndex((e) => e.id === id);
      if (i >= 0) next.boat.equipment[i] = item;
      else next.boat.equipment.push(item);
    } else if (type === "boat") {
      if (!d.name) throw new Error("Completá el nombre del barco.");
      if (
        d.currency !== state.boat.currency &&
        (state.purchases.length || state.products.some((p) => p.cost > 0))
      )
        throw new Error(
          "Ya hay importes registrados. Conservá la moneda original.",
        );
      Object.assign(next.boat, {
        name: d.name,
        model: d.model,
        currency: d.currency,
      });
    } else if (type === "camera") {
      if (!privateAccess()) throw new Error("No tenés acceso a cámaras.");
      for (const key of ["live", "recordings"])
        if (d[key] && !safeUrl(d[key]))
          throw new Error(
            "Usá un enlace HTTP/HTTPS sin usuario ni contraseña.",
          );
      if (!d.name) throw new Error("Completá el nombre de la cámara.");
      const c = {
        id: id || uid(),
        name: d.name,
        location: d.location,
        model: d.model,
        live: d.live,
        recordings: d.recordings,
        notes: d.notes,
      };
      const i = next.cameras.findIndex((c) => c.id === id);
      if (i >= 0) next.cameras[i] = c;
      else next.cameras.push(c);
    } else if (type === "manual") {
      if (!privateAccess())
        throw new Error("Solo una persona autorizada puede editar el manual.");
      next.manual = {
        content: d.content,
        updatedAt: new Date().toISOString(),
        updatedBy: session.name,
      };
    } else if (type === "newBoat") {
      const boat = await api("boats", "POST", d);
      boats = await api("boats");
      await loadBoat(boat.id);
      $("#editor").close();
      toast("Barco creado.");
      return;
    } else if (type === "user" || type === "access") {
      await api(type === "user" ? "users" : "access", "POST", d);
      $("#editor").close();
      renderCrew();
      toast("Acceso guardado.");
      return;
    } else return;
    await commit(next);
    if (type === "boat") {
      boats = await api("boats");
      render();
    }
    $("#editor").close();
    toast(
      type === "log"
        ? "Trabajo registrado. Stock e historial actualizados."
        : "Guardado correctamente.",
    );
  } catch (err) {
    $("#formError").textContent = err.message;
  } finally {
    button.disabled = false;
  }
};
function addDays(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function download(data, name, type = "application/json") {
  const blob = new Blob(
    [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function validateBackup(s) {
  if (
    s?.schema !== 1 ||
    !s.boat?.name ||
    !["USD", "ARS", "EUR"].includes(s.boat.currency) ||
    !Array.isArray(s.boat.equipment)
  )
    throw new Error("No es un respaldo válido de A bordo.");
  for (const k of [
    "products",
    "tasks",
    "logs",
    "movements",
    "purchases",
    "cameras",
  ]) {
    if (
      !Array.isArray(s[k]) ||
      s[k].some((x) => typeof x !== "object" || !x.id) ||
      new Set(s[k].map((x) => x.id)).size !== s[k].length
    )
      throw new Error("El respaldo tiene datos inválidos en " + k + ".");
  }
  for (const p of s.products) {
    for (const f of ["current", "min", "cost"]) R.number(p[f], f);
    if (p.photo && !safePhoto(p.photo))
      throw new Error("Foto inválida en el respaldo.");
    if (!p.name || !p.unit) throw new Error("Hay un insumo incompleto.");
  }
  for (const l of s.logs)
    if (
      !Array.isArray(l.lines) ||
      !Array.isArray(l.photos) ||
      l.photos.some((p) => !safePhoto(p)) ||
      !l.date
    )
      throw new Error("El historial del respaldo está incompleto.");
  for (const t of s.tasks)
    if (!t.title || (t.photo && !safePhoto(t.photo)))
      throw new Error("Hay una tarea incompleta o con una foto inválida.");
  for (const p of s.purchases)
    if (!Array.isArray(p.lines))
      throw new Error("Las compras del respaldo están incompletas.");
  return s;
}
async function restore(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 24 * 1024 * 1024)
      throw new Error("El respaldo supera el máximo de 24 MB.");
    const imported = validateBackup(JSON.parse(await file.text()));
    if (
      !confirm(
        `Restaurar el respaldo de ${imported.boat.name} sobre ${state.boat.name}? Se reemplazarán los datos de este barco. Primero se descargará una copia de los actuales.`,
      )
    )
      return;
    download(state, `antes-de-restaurar-${today()}.json`);
    await commit(imported);
    boats = await api("boats");
    render();
    toast("Respaldo restaurado.");
  } catch (err) {
    toast(err.message);
  } finally {
    event.target.value = "";
  }
}
function suggestions() {
  editing = { type: "suggestions" };
  $("#editorTitle").textContent = "Fichas sugeridas por el audio";
  $("#saveButton").hidden = true;
  $("#formError").textContent = "";
  $("#editorFields").innerHTML =
    '<p class="subhead">Elegí una ficha y completá su modelo, ubicación y cantidades reales. No se asignan medidas ni existencias por defecto.</p><div class="task-list">' +
    [
      "Aceite de motor",
      "Filtro de gasoil",
      "Prefiltro de gasoil",
      "Aceite de caja",
      "Manguera",
      "Flotante de bomba de sentina",
      "Bomba de sentina",
      "Bomba de ducha",
      "Bomba de inodoro",
      "Bomba de circuito de agua",
      "Impeller",
    ]
      .map((n) => action("useSuggestion", esc(n), n))
      .join("") +
    "</div>";
  $("#editor").showModal();
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  try {
    switch (button.dataset.action) {
      case "newProduct":
        openEditor("product");
        break;
      case "newFirstAid":
        openEditor("product", { system: "Botiquín", category: "Botiquín" });
        break;
      case "editProduct":
        openEditor(
          "product",
          state.products.find((p) => p.id === id),
        );
        break;
      case "showProduct":
        openEditor(
          "detail",
          state.products.find((p) => p.id === id),
        );
        break;
      case "newTask":
        openEditor("task");
        break;
      case "addTemplates": {
        const next = structuredClone(state);
        const existing = new Set(
          next.tasks.map((t) => `${t.system}\n${t.title}`.toLocaleLowerCase()),
        );
        let added = 0;
        for (const template of taskTemplates) {
          const key = `${template.system}\n${template.title}`.toLocaleLowerCase();
          if (existing.has(key)) continue;
          next.tasks.push({
            id: uid(),
            ...template,
            assignee: "",
            equipmentId:
              next.boat.equipment.find((e) => e.system === template.system)?.id || "",
            nextDate: "",
            nextHours: "",
            intervalDays: 0,
            intervalHours: 0,
            description: "",
            observation: "",
            photo: "",
            done: false,
          });
          existing.add(key);
          added++;
        }
        if (!added) return toast("Las tareas específicas ya están cargadas.");
        await commit(next);
        toast(`${added} tareas agregadas. Definí la frecuencia y próxima fecha de cada una.`);
        break;
      }
      case "editTask":
        openEditor(
          "task",
          state.tasks.find((t) => t.id === id),
        );
        break;
      case "completeTask":
        openEditor("log", { taskId: id });
        break;
      case "newLog":
        openEditor("log");
        break;
      case "showLog":
        openEditor(
          "logDetail",
          state.logs.find((l) => l.id === id),
        );
        break;
      case "newPurchase":
        openEditor("purchase");
        break;
      case "newMovement":
        openEditor("movement");
        break;
      case "addMaterial":
        addLine("material");
        break;
      case "addPurchaseLine":
        addLine("purchase");
        break;
      case "removeLine":
        button.closest(".consumption-line").remove();
        break;
      case "goTasks":
        navigate("tasks");
        break;
      case "goStock":
        navigate("stock");
        break;
      case "goLog":
        navigate("log");
        break;
      case "togglePanelTasks":
        panelTasksExpanded = !panelTasksExpanded;
        renderPanel();
        break;
      case "togglePanelLogs":
        panelLogsExpanded = !panelLogsExpanded;
        renderPanel();
        break;
      case "markActivityRead": {
        const newestActivityId = Math.max(0, ...activity.map((item) => Number(item.id) || 0));
        localStorage.setItem(activityStorageKey(), String(newestActivityId));
        unseenActivity = [];
        render();
        break;
      }
      case "pendingTasks":
        filter.status = "";
        renderTasks();
        break;
      case "doneTasks":
        filter.status = "done";
        renderTasks();
        break;
      case "newEquipment":
        openEditor("equipment");
        break;
      case "editEquipment":
        openEditor("equipment", eq(id));
        break;
      case "editBoat":
        openEditor("boat");
        break;
      case "newBoat":
        openEditor("newBoat");
        break;
      case "newCamera":
        openEditor("camera");
        break;
      case "editCamera":
        openEditor(
          "camera",
          state.cameras.find((c) => c.id === id),
        );
        break;
      case "editManual":
        openEditor("manual");
        break;
      case "newUser":
        openEditor("user");
        break;
      case "changeAccess":
        openEditor("access");
        break;
      case "suggestions":
        suggestions();
        break;
      case "useSuggestion":
        $("#editor").close();
        openEditor("product", { name: id });
        break;
      case "exportLegacy":
        download(
          localStorage.getItem("restaurant-stock-reservations-v1"),
          "gastronomia-anterior.json",
        );
        break;
      case "export":
        download(await portableBackup(), `barco-${today()}.json`);
        break;
      case "import":
        $("#importFile").click();
        break;
      case "exportShopping": {
        const cell = (s) =>
          '"' +
          String(s ?? "")
            .replace(/^[=+@-]/, "'")
            .replaceAll('"', '""') +
          '"';
        const rows = [
          [
            "Insumo",
            "Sistema",
            "Especificaciones",
            "Stock",
            "Unidad",
            "Mínimo",
            "Objetivo",
            "A reponer",
            "Proveedor",
          ],
          ...state.products
            .filter((p) => p.current <= p.min)
            .map((p) => [
              p.name,
              p.system,
              p.specs,
              p.current,
              p.unit,
              p.min,
              p.target,
              R.round(Math.max(0, (p.target || p.min) - p.current)),
              p.supplier,
            ]),
        ];
        download(
          "\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\r\n"),
          `reposicion-${today()}.csv`,
          "text/csv;charset=utf-8",
        );
        break;
      }
      case "logout":
        clearInterval(activityTimer);
        activityTimer = undefined;
        await api("logout", "POST", {});
        state = null;
        await startup();
        break;
    }
  } catch (err) {
    toast(err.message);
  }
});
$("#navigation").addEventListener("click", (e) => {
  const button = e.target.closest("[data-view]");
  if (button && state) navigate(button.dataset.view);
});
$("#quickLog").onclick = () => openEditor("log");
$("#closeDialog").onclick = $("#cancelDialog").onclick = () =>
  $("#editor").close();
startup();
