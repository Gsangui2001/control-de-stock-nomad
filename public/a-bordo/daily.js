"use strict";
// The daily view uses the same authenticated API, inventory and task history.
let dayPage = "home", daySelected = "", daySaving = false, dayResult = null;
const dayManager = () => Boolean(session?.admin || role === "encargado");
const dayButton = (page, label, id = "", style = "day-secondary") =>
  `<button type="button" class="${style}" data-day="${page}" data-id="${esc(id)}">${label}</button>`;
const dayBack = () => dayButton("home", "← Mi día", "", "day-back");
const dayIcon = (name) => {
  const paths = {
    tasks: '<path d="m4 6 2 2 3-4m-5 9 2 2 3-4m3-5h8m-8 8h8M4 20h16"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8m-4-4h8"/>',
    problem: '<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3ZM12 7v5m0 3h.01"/>',
    stock: '<path d="m3 7 9-5 9 5v10l-9 5-9-5Zm0 0 9 5 9-5m-9 5v10M7 5l10 5"/>',
    book: '<path d="M12 5v16M3 3c4-1 6 0 9 2 3-2 5-3 9-2v16c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  };
  return `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.plus}</svg>`;
};
function dayTasks() {
  const identity = [session.name, session.username, session.id, role].filter(Boolean).map(s => String(s).trim().toLocaleLowerCase());
  return state.tasks.filter(t => !t.done && (dayManager() || !t.assignee || identity.includes(t.assignee.trim().toLocaleLowerCase())))
    .sort((a, b) => Number(taskStatus(b) === "Vencido") - Number(taskStatus(a) === "Vencido") || (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));
}
function dayTaskRow(t) {
  return `<article class="day-task ${taskStatus(t) === "Vencido" ? "late" : ""}"><button type="button" data-day="task" data-id="${esc(t.id)}"><span>${statusBadge(t)}<strong>${esc(t.title)}</strong><small>${esc(t.system)}${t.nextDate ? ` · ${date(t.nextDate)}` : t.nextHours !== "" && t.nextHours != null ? ` · A las ${t.nextHours} h` : " · Sin fecha definida"}</small></span><span aria-hidden="true">›</span></button></article>`;
}
function dayHome() {
  const tasks = dayTasks(), overdue = tasks.filter(t => taskStatus(t) === "Vencido").length;
  const records = state.logs.filter(l => l.recordedById ? l.recordedById === session.id : (l.recordedBy || l.responsible) === session.name).slice().reverse().slice(0, 8);
  const tile = (page, icon, title, subtitle, primary = false) => `<button type="button" data-day="${page}" class="day-tile ${primary ? "primary-tile" : ""}">${dayIcon(icon)}<span>${title}<small>${subtitle}</small></span></button>`;
  return `<p class="day-eyebrow">MI DÍA A BORDO</p><h1>Hola, ${esc(session.name.split(" ")[0])}.</h1><p class="day-muted">${tasks.length ? `${tasks.length} tareas pendientes. Vamos de a una.` : "No tenés tareas pendientes."}</p><div class="day-grid">${tile("tasks", "tasks", "Mis tareas", `${tasks.length} pendientes${overdue ? ` · ${overdue} vencidas` : ""}`, true)}${writable() ? tile("work", "plus", "Registrar trabajo", "Algo que ya hice") + tile("problem", "problem", "Avisar un problema", "Foto y comentario") : ""}${tile("stock", "stock", "Insumos", "Qué hay y dónde")}</div><h2 class="day-section">Primero lo pendiente</h2>${tasks.slice(0, 2).map(dayTaskRow).join("") || '<div class="day-note">No hay tareas pendientes para tu cuenta.</div>'}${tasks.length > 2 ? dayButton("tasks", `Ver las ${tasks.length} tareas`, "", "day-text") : ""}<div class="day-section">${dayButton("manual", dayIcon("book") + " Manual de instrucciones")}</div><details class="day-disclosure day-section"><summary>Mis últimos registros${records.length ? ` · ${records.length}` : ""}</summary>${records.map(l => `<button type="button" class="day-history" data-action="showLog" data-id="${esc(l.id)}"><strong>${esc(l.title)}</strong><small>${l.reportKind ? "Aviso" : "Trabajo realizado"} · ${date(l.date)}</small></button>`).join("") || '<p class="day-muted">Tus trabajos y avisos aparecerán acá.</p>'}</details>`;
}
function dayPhotoFields() {
  return `<label class="day-photo-input">Agregar fotos<input name="photos" type="file" accept="image/*" multiple><small>Hasta 3 fotos. Podés usar la cámara o elegir de la galería.</small></label><div id="dayPhotoPreview" class="attachments" aria-live="polite"></div>`;
}
function dayWorkForm(kind) {
  const task = ["task", "blocked"].includes(kind) ? state.tasks.find(t => t.id === daySelected) : null;
  const product = kind === "missing" ? state.products.find(p => p.id === daySelected) : null;
  const report = ["problem", "blocked", "missing"].includes(kind);
  if ((["task", "blocked"].includes(kind) && !task) || (kind === "missing" && !product)) return dayBack() + empty("Este registro ya no está disponible.");
  const title = kind === "blocked" ? "No pude hacerla" : kind === "missing" ? "Pedir reposición" : report ? "¿Qué pasó?" : task ? task.title : "¿Qué trabajo hiciste?";
  return `${dayBack()}<p class="day-eyebrow">${report ? "AVISO DEL BARCO" : task ? "MI TAREA" : "NUEVO REGISTRO"}</p><h1>${esc(title)}</h1>${task ? `<p class="day-muted">${esc(task.system)}${task.intervalDays ? ` · Cada ${task.intervalDays} días` : ""}${task.intervalHours ? ` · Cada ${task.intervalHours} horas` : ""}</p>${kind === "blocked" ? `<p>${esc(task.title)}</p>` : `${task.description ? `<div class="day-note">${esc(task.description)}</div>` : ""}${task.observation ? `<p>${esc(task.observation)}</p>` : ""}${task.photo ? `<img class="day-reference" src="${esc(task.photo)}" alt="Referencia de la tarea">` : ""}`}` : ""}${product ? `<div class="day-note"><strong>${esc(product.name)}</strong><br>Disponible: ${product.current} ${esc(product.unit)} · ${esc(product.location)}</div>` : ""}<form id="dayForm" data-kind="${kind}">
    ${!task && !report ? field("Trabajo realizado", "title", "", "text", 'required maxlength="140" placeholder="Ej.: Lavado del dinghy"') + select("Tipo de trabajo", "type", ["Mantenimiento", "Limpieza", "Reparación", "Verificación de funcionamiento"]) : ""}
    ${!task && !product ? `<label>¿Dónde?<select name="system" required>${options(systemOptions(), "", "Elegí el lugar o equipo")}</select></label>` : ""}
    <label>${kind === "blocked" ? "¿Qué te impidió hacerlo?" : report ? "Contanos qué hace falta o qué encontraste" : "Observaciones (opcional)"}<textarea name="notes" maxlength="5000" ${report ? "required" : ""} placeholder="${report ? "Escribí brevemente qué pasó." : "¿Algo para avisar o recordar?"}">${product ? `Hace falta reponer ${esc(product.name)}.` : ""}</textarea></label>
    ${dayPhotoFields()}
    ${report ? '<label class="check"><input type="checkbox" name="urgent">Necesita atención urgente</label>' : `<details class="day-disclosure"><summary>¿Usaste algún material?</summary><p class="day-muted">Se descontará del inventario al guardar.</p><div id="materialLines"></div>${action("addMaterial", "＋ Agregar material")}</details>${task?.equipmentId ? `<div class="day-note">${esc(eq(task.equipmentId)?.name || "Equipo asignado")}${field("Horas del equipo al realizar el trabajo", "hours", "", "number", `${task.intervalHours ? "required" : ""} min="0" step="0.1" placeholder="Lectura del contador"`)}</div>` : ""}${field("Fecha del trabajo", "date", today(), "date", `required max="${today()}"`)}`}
    <p class="day-muted">Se registra con tu nombre: ${esc(session.name)}.</p><p id="dayError" class="form-error" role="alert"></p><button type="button" class="day-secondary" data-day="reloadDraft" id="dayReload" hidden>Actualizar datos y revisar el formulario</button>${writable() ? `<button type="submit" class="day-primary">${report ? "Enviar aviso" : "Guardar trabajo"}</button>` : '<p class="day-note">Tu acceso es de lectura.</p>'}${task && !report && writable() ? dayButton("blocked", "No pude hacer esta tarea", task.id, "day-text") : ""}</form>`;
}
function dayStock() {
  return `${dayBack()}<p class="day-eyebrow">INVENTARIO A BORDO</p><h1>Insumos</h1><p class="day-muted">Consultá lo disponible y avisá si falta algo.</p><input id="dayStockSearch" type="search" aria-label="Buscar insumo" placeholder="Buscar insumo o ubicación"><div id="dayStockList"></div>`;
}
function dayStockItems(query = "") {
  const q = query.toLocaleLowerCase();
  $("#dayStockList").innerHTML = state.products.filter(p => [p.name, p.location, p.system, p.specs].join(" ").toLocaleLowerCase().includes(q)).map(p => `<article class="day-inventory"><div class="day-card-heading"><div><h2>${esc(p.name)}</h2><p class="day-muted">${esc(p.location || "Sin ubicación cargada")}</p><small>${esc(p.system)}</small></div><strong>${p.current} ${esc(p.unit)}</strong></div>${stockBadge(p)}${p.expiryDate ? `<p class="day-muted">Vencimiento: ${date(p.expiryDate)}</p>` : ""}<div class="day-actions">${dayButton("missing", "Avisar que hace falta", p.id, "day-text")}${action("showProduct", "Ver detalle", p.id, "text-btn")}</div></article>`).join("") || empty(q ? "No hay insumos con esa búsqueda." : "Todavía no hay insumos cargados. No se muestran cantidades de ejemplo.");
  if (!writable()) document.querySelectorAll('[data-day="missing"]').forEach(b => b.hidden = true);
}
function dayManualSections(content) {
  const sections = [[]];
  let sectionNumber = 0;
  for (const line of content.split("\n")) {
    const heading = line.match(/^(\d+)\. (.+)$/);
    // Preserve numbered lists inside a chapter, including the daily checklist.
    if (heading && Number(heading[1]) >= sectionNumber && !/[.!?:;]$/.test(heading[2])) {
      sectionNumber = Number(heading[1]);
      sections.push([]);
    }
    sections[sections.length - 1].push(line);
  }
  return sections.filter(lines => lines.length).map(lines => lines.join("\n"));
}
function dayManual() {
  const content = state.manual?.content || "El manual todavía no tiene contenido.";
  const sections = dayManualSections(content);
  return `${dayBack()}<p class="day-eyebrow">PARA CONSULTAR</p><h1>Manual de instrucciones</h1><p class="day-muted">La referencia de trabajo a bordo.</p>${sections.map((section, i) => { const lines = section.split("\n"); const title = lines.shift(); return `<details class="day-disclosure" ${i === 0 ? "open" : ""}><summary>${esc(title)}</summary><div class="manual-content">${esc(lines.join("\n"))}</div></details>`; }).join("")}${state.manual?.updatedAt ? `<p class="day-muted">Actualizado ${date(state.manual.updatedAt)}</p>` : ""}`;
}
function dayUpdates() {
  const reports = state.logs.filter(l => l.reportKind && (dayManager() || (l.recordedById ? l.recordedById === session.id : (l.recordedBy || l.responsible) === session.name))).slice().reverse();
  const recent = [...state.logs].sort((a, b) => (b.recordedAt || b.date).localeCompare(a.recordedAt || a.date)).slice(0, 10);
  return `${dayBack()}<h1>Avisos y novedades</h1><p class="day-muted">${session.admin ? "Las novedades de otras personas se comprueban cada minuto mientras la app está abierta." : "Consultá tus avisos y usá Actualizar para ver los cambios."}</p>${dayButton("updates", "Actualizar")}${session.admin && unseenActivity.length ? action("markActivityRead", "Marcar novedades como vistas", "", "text-btn") : ""}<h2 class="day-section">Avisos del barco</h2>${reports.map(l => `<article class="day-inventory">${badge(l.resolvedAt ? "Atendido" : l.urgent ? "Urgente" : "Pendiente", l.resolvedAt ? "ok" : l.urgent ? "bad" : "warn")}<h2>${esc(l.title)}</h2><p>${esc(l.notes)}</p><p class="day-muted">${esc(l.recordedBy || l.responsible)} · ${date(l.date)}</p>${action("showLog", "Ver detalle y fotos", l.id, "text-btn")}${dayManager() && !l.resolvedAt ? dayButton("resolve", "Marcar atendido", l.id, "day-text") : ""}</article>`).join("") || empty("No hay avisos registrados.")}${dayManager() ? `<h2 class="day-section">Últimos registros</h2>${recent.map(l => `<button type="button" class="day-history" data-action="showLog" data-id="${esc(l.id)}"><strong>${esc(l.title)}</strong><small>${esc(l.recordedBy || l.responsible)} · ${date(l.date)} · ${l.reportKind ? "Aviso" : "Trabajo"}</small></button>`).join("") || empty("Todavía no hay registros.")}` : ""}`;
}
function renderDay() {
  $("#dayHeader").innerHTML = `<button type="button" data-day="home" class="day-brand"><span>≈</span> A bordo</button><span>${esc(state.boat.name)}</span>`;
  $("#notice").innerHTML = activityNotice();
  const reports = state.logs.filter(l => l.reportKind && !l.resolvedAt && (dayManager() || (l.recordedBy || l.responsible) === session.name));
  let body = dayPage === "home" ? dayHome() : dayPage === "tasks" ? `${dayBack()}<h1>Mis tareas</h1><p class="day-muted">${dayManager() ? "Ves todas las tareas del barco. " : "Tus tareas y las que todavía no tienen responsable. "}Las vencidas aparecen primero.</p>${dayTasks().map(dayTaskRow).join("") || empty("No tenés tareas pendientes.")}` : dayPage === "stock" ? dayStock() : dayPage === "manual" ? dayManual() : dayPage === "updates" ? dayUpdates() : dayPage === "success" && dayResult ? `<div class="day-success"><span>✓</span><h1>${esc(dayResult.title)}</h1><p class="day-muted">${esc(dayResult.message)}</p></div>${dayButton("home", "Volver a mi día", "", "day-primary")}` : dayWorkForm(dayPage);
  $("#content").innerHTML = `<div class="day-content">${body}<div class="day-footer">${dayButton("updates", dayIcon("bell") + ` Avisos${reports.length ? ` · ${reports.length} ${reports.length === 1 ? "pendiente" : "pendientes"}` : ""}`, "", "day-text")}${dayManager() ? dayButton("manage", "Administrar", "", "day-text") : ""}${action("logout", "Salir", "", "text-btn")}</div></div>`;
  if (dayPage === "stock") { dayStockItems(); $("#dayStockSearch").oninput = e => dayStockItems(e.target.value); }
  if ($("#dayForm")) {
    $("#dayForm").onsubmit = saveDayForm;
    $("#dayForm").elements.photos.onchange = async e => {
      const files = [...e.target.files];
      const preview = $("#dayPhotoPreview");
      if (files.length > 3) { preview.textContent = "Elegí hasta 3 fotos."; return; }
      preview.textContent = files.length ? `${files.length} foto(s) seleccionada(s). Se guardarán con el registro.` : "";
    };
  }
}
async function saveDayForm(event) {
  event.preventDefault();
  if (daySaving || !writable()) return;
  const form = event.target;
  if (!form.reportValidity()) return;
  const d = Object.fromEntries(new FormData(form));
  for (const key in d) if (typeof d[key] === "string") d[key] = d[key].trim();
  const kind = form.dataset.kind, isReport = ["problem", "blocked", "missing"].includes(kind);
  const button = form.querySelector('[type="submit"]');
  daySaving = true; button.disabled = true; $("#dayError").textContent = "";
  try {
    const next = structuredClone(state);
    const task = ["task", "blocked"].includes(kind) ? next.tasks.find(t => t.id === daySelected) : null;
    const product = kind === "missing" ? next.products.find(p => p.id === daySelected) : null;
    if (["task", "blocked"].includes(kind) && (!task || task.done)) throw new Error("Esta tarea ya no está pendiente. Volvé a Mi día.");
    if (kind === "missing" && !product) throw new Error("Este insumo ya no está disponible.");
    if (isReport && !d.notes) throw new Error("Escribí brevemente qué pasó.");
    const title = task?.title || (product ? `Reponer: ${product.name}` : isReport ? `Problema: ${d.system}` : d.title);
    if (!title || (!task && !product && !d.system)) throw new Error("Completá el trabajo y dónde se realizó.");
    if (!isReport && (!d.date || d.date > today())) throw new Error("Elegí una fecha de trabajo que no sea futura.");
    const equipment = next.boat.equipment.find(e => e.id === task?.equipmentId);
    const hours = d.hours ? R.number(d.hours, "Horas") : "";
    if (!isReport && task?.intervalHours && (!equipment || hours === "")) throw new Error("Indicá las horas del equipo para reprogramar esta rutina.");
    const files = [...form.elements.photos.files];
    if (files.length > 3) throw new Error("Podés adjuntar hasta 3 fotos.");
    const lines = isReport ? [] : getLines("#materialLines");
    next.products = R.consume(next.products, lines);
    const photos = await Promise.all(files.map(photo));
    const log = {id: uid(), taskId: task?.id || "", title: (kind === "blocked" ? "No pude hacer: " : "") + title, type: isReport ? "Aviso" : d.type || (cleaningTasks.includes(task?.system) ? "Limpieza" : "Mantenimiento"), date: isReport ? today() : d.date, responsible: session.name, system: task?.system || product?.system || d.system, equipmentId: equipment?.id || "", equipmentName: equipment?.name || "", hours: isReport ? "" : hours, notes: d.notes, observation: "", lines, photos, ...(isReport ? {reportKind: kind, urgent: Boolean(d.urgent), productId: product?.id || ""} : {})};
    next.logs.push(log);
    if (!isReport) {
      if (equipment && hours !== "") equipment.hours = Math.max(equipment.hours, hours);
      const grouped = new Map();
      for (const l of lines) grouped.set(l.productId, R.round((grouped.get(l.productId) || 0) + l.quantity));
      for (const [id, quantity] of grouped) movement(next, next.products.find(p => p.id === id), -quantity, "Trabajo: " + title, d.date);
      if (task) {
        task.lastCompleted = d.date;
        if (task.intervalDays || task.intervalHours) {
          task.nextDate = task.intervalDays ? addDays(d.date, task.intervalDays) : "";
          task.nextHours = task.intervalHours ? R.round(hours + task.intervalHours) : "";
        } else task.done = true;
      }
    }
    await commit(next);
    dayResult = {title: isReport ? "Aviso registrado" : "Trabajo guardado", message: kind === "blocked" ? "El motivo quedó en Avisos. La tarea sigue pendiente." : isReport ? "Quedó guardado en los avisos del barco para su seguimiento." : task?.intervalDays || task?.intervalHours ? `El trabajo quedó registrado y la próxima tarea se reprogramó${task.nextDate ? " para el " + date(task.nextDate) : " por horas"}.` : "Quedó guardado con tu nombre, fecha y los materiales utilizados."};
    dayPage = "success"; render(); window.scrollTo(0, 0);
  } catch (err) {
    if ($("#dayError")) $("#dayError").textContent = err.message;
    if ($("#dayReload")) $("#dayReload").hidden = false;
  } finally { daySaving = false; button.disabled = false; }
}
document.addEventListener("click", async event => {
  const button = event.target.closest("[data-day]");
  if (!button || !state || daySaving) return;
  const page = button.dataset.day;
  try {
    if (page === "manage") { if (dayManager()) navigate("panel"); return; }
    if (page === "reloadDraft") {
      const latest = await api("state?boat=" + encodeURIComponent(boatId));
      state = latest.state; revision = latest.revision; role = latest.role;
      $("#dayError").textContent = "Datos actualizados. Revisá los materiales y volvé a guardar. Tu texto y fotos se conservaron.";
      return;
    }
    if (page === "resolve") {
      if (!dayManager() || !confirm("¿Marcar este aviso como atendido? La tarea asociada no se dará por realizada.")) return;
      const next = structuredClone(state), report = next.logs.find(l => l.id === button.dataset.id && l.reportKind);
      if (!report) return;
      report.resolvedAt = new Date().toISOString(); report.resolvedBy = session.name;
      await commit(next); return;
    }
    if (page === "updates") {
      button.disabled = true;
      await loadBoat(boatId);
    }
    if (button.dataset.id) daySelected = button.dataset.id;
    dayPage = page; navigate("day"); window.scrollTo(0, 0);
  } catch (err) { toast(err.message); }
  finally { button.disabled = false; }
});
