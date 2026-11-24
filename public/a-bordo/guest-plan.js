"use strict";

const guestPlanGroups = [
  ["Embarque y desembarque", [
    ["embarkation", "Lugar de embarque"], ["embarkationTime", "Hora de embarque"],
    ["disembarkation", "Lugar de desembarque"], ["disembarkationTime", "Hora de desembarque"],
    ["transport", "Traslado"]
  ]],
  ["Preferencias y preparación", [
    ["activities", "Actividades"], ["food", "Dieta y comidas"], ["allergies", "Alergias o alimentos a evitar"],
    ["drinks", "Bebidas"], ["requests", "Pedidos especiales"], ["onboardNotes", "Observaciones a bordo"]
  ]]
];
const guestPlanFields = guestPlanGroups.flatMap(group => group[1]);
let guestPlanDraft = null;

function guestPlanCurrent(draft) {
  return draft && draft === guestPlanDraft && session === draft.user && boatId === draft.boat;
}

function guestPlanPanel(res) {
  const plan = res.onboardPlan;
  if (!plan) return "";
  if (guestPlanDraft && (guestPlanDraft.user !== session || guestPlanDraft.boat !== boatId)) guestPlanDraft = null;
  const draft = guestPlanCurrent(guestPlanDraft) && guestPlanDraft.id === res.id ? guestPlanDraft : null;
  const note = plan.fields?.onboardNotes;
  const thinCard = !Number(res.brief?.version || 0);
  const filled = thinCard ? guestPlanFields.filter(([key]) =>
    key !== "onboardNotes" && typeof plan.fields?.[key] === "string" && plan.fields[key].trim()) : [];
  const summary = filled.length ? '<dl class="guest-plan-summary">' + filled.map(([key,label]) =>
    '<div><dt>' + esc(label) + '</dt><dd>' + esc(plan.fields[key]) + '</dd></div>').join("") + '</dl>' : '';
  if (!plan.canEdit && !note && !filled.length) return "";
  const edit = plan.canEdit && !draft ? '<button type="button" class="day-secondary" data-guest-plan-action="edit">Editar ficha</button>' : '';
  const saved = summary + (note ? '<p class="guest-plan-note"><strong>Observaciones a bordo</strong><br>' + esc(note) + '</p>' : '');
  return '<section class="guest-plan" data-guest-plan="' + esc(res.id) + '" aria-label="Datos a bordo">' +
    '<div class="guest-plan-heading"><h3>Datos a bordo</h3>' + edit + '</div>' +
    (draft && plan.canEdit ? guestPlanEditor(draft) : saved) + '</section>';
}

function guestPlanEditor(draft) {
  const cancel = '<button type="button" class="day-secondary" data-guest-plan-action="cancel">Cancelar</button>';
  const error = draft.error ? '<p class="form-error" role="alert">' + esc(draft.error) + '</p>' : "";
  if (!draft.data) return (draft.loading ? '<p role="status">Abriendo ficha…</p>' :
    error + '<button type="button" class="day-secondary" data-guest-plan-action="retry">Volver a intentar</button>') + cancel;
  const inputs = guestPlanGroups.map(([name,fields]) => '<fieldset><legend>' + esc(name) + '</legend>' +
    fields.map(([key,label]) => {
      const value = esc(draft.values[key] || "");
      const long = ["activities","food","allergies","requests","onboardNotes"].includes(key);
      const input = long ? '<textarea rows="2" maxlength="2000" name="' + key + '">' + value + '</textarea>' :
        '<input type="text" maxlength="2000" name="' + key + '" value="' + value + '">';
      let conflict = "";
      if (draft.conflicts.has(key)) conflict = '<div class="day-note" role="group" aria-label="Elegí el valor de ' + esc(label) + '">' +
        '<p>Ahora está guardado: ' + esc(draft.data.values[key] || "Sin completar") + '</p>' +
        '<button type="button" class="day-secondary" data-guest-plan-action="stored" data-field="' + key + '">Usar lo guardado</button> ' +
        '<button type="button" class="day-secondary" data-guest-plan-action="mine" data-field="' + key + '">Conservar mi cambio</button></div>';
      return '<label>' + esc(label) + input + '</label>' + conflict;
    }).join("") + '</fieldset>').join("");
  const locked = draft.loading || draft.saving || draft.uncertain;
  const retry = draft.stale ? '<button type="button" class="day-secondary" data-guest-plan-action="reload">Revisar la versión actual</button>' : '';
  return '<form data-guest-plan-form><div class="guest-plan-fields"><fieldset class="guest-plan-inputs" ' + (locked ? 'disabled' : '') + '>' + inputs + '</fieldset></div>' +
    error + retry + '<div class="area-actions"><button type="submit" class="day-primary" ' +
    (draft.loading || draft.saving || draft.stale || draft.conflicts.size ? 'disabled' : '') + '>' +
    (draft.saving ? 'Guardando…' : draft.uncertain ? 'Reintentar guardado' : 'Guardar cambios') + '</button>' + cancel + '</div></form>';
}

async function loadGuestPlan(draft) {
  if (draft.loading) return;
  draft.loading = true;
  draft.error = "";
  render();
  try {
    const query = new URLSearchParams({boat:draft.boat,id:draft.id});
    const response = await fetch('/api/boat-ops/guest_plan?' + query, {cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "No se pudo abrir la ficha.");
    if (!guestPlanCurrent(draft)) return;
    const next = {...data.values};
    if (draft.data) {
      for (const [key] of guestPlanFields) {
        const before = draft.data.values[key] || "", mine = draft.values[key] || "", current = next[key] || "";
        if (before === mine || mine === current) continue;
        next[key] = mine;
        if (before !== current) draft.conflicts.add(key);
      }
    }
    draft.data = data;
    draft.values = next;
    draft.stale = false;
    if (draft.conflicts.size) draft.error = "Otra persona cambió estos datos. Elegí qué valor guardar.";
  } catch (error) {
    draft.error = error.message || "No se pudo actualizar la ficha.";
  } finally {
    draft.loading = false;
    if (guestPlanCurrent(draft)) render();
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-guest-plan-action]');
  if (!button) return;
  const id = button.closest('[data-guest-plan]')?.dataset.guestPlan;
  if (!id) return;
  const action = button.dataset.guestPlanAction;
  if (action === 'edit') {
    guestPlanDraft = {id,boat:boatId,user:session,data:null,values:{},conflicts:new Set()};
    loadGuestPlan(guestPlanDraft);
    return;
  }
  const draft = guestPlanDraft;
  if (!guestPlanCurrent(draft) || draft.id !== id || draft.saving) return;
  if (action === 'cancel') { guestPlanDraft = null; render(); return; }
  if (action === 'retry' || action === 'reload') { loadGuestPlan(draft); return; }
  const key = button.dataset.field;
  if (draft.conflicts.has(key) && ['stored','mine'].includes(action)) {
    if (action === 'stored') draft.values[key] = draft.data.values[key] || "";
    draft.conflicts.delete(key);
    if (!draft.conflicts.size) draft.error = "";
    render();
  }
});

document.addEventListener('input', event => {
  const field = event.target;
  if (field.form?.matches('[data-guest-plan-form]') && guestPlanCurrent(guestPlanDraft))
    guestPlanDraft.values[field.name] = field.value;
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('[data-guest-plan-form]')) return;
  event.preventDefault();
  const draft = guestPlanDraft;
  if (!guestPlanCurrent(draft) || draft.saving || !draft.data || draft.stale || draft.conflicts.size || !form.reportValidity()) return;
  if (!draft.pending) {
    const changes = {};
    for (const [key] of guestPlanFields) {
      const value = (form.elements.namedItem(key)?.value || "").trim();
      draft.values[key] = value;
      if (value !== (draft.data.values[key] || "")) changes[key] = value;
    }
    if (!Object.keys(changes).length) { guestPlanDraft = null; render(); return; }
    draft.pending = {id:draft.id, key:uid(), revision:draft.data.revision, version:draft.data.version, changes};
  }
  draft.saving = true;
  draft.error = "";
  render();
  try {
    const saved = await opsFetch('guest_plan_save',draft.pending,draft.boat);
    if (!guestPlanCurrent(draft)) return;
    for (const entries of [opsReservations, typeof briefAgenda === 'undefined' ? [] : briefAgenda]) {
      const item = entries?.find(row => row.id === draft.id);
      if (!item) continue;
      item.onboardPlan = saved;
      item.details = {...(item.details || item.brief?.draft || {}),...saved.fields};
    }
    guestPlanDraft = null;
    render();
    toast("Cambios guardados en la ficha.");
  } catch (error) {
    if (!guestPlanCurrent(draft)) return;
    draft.saving = false;
    draft.stale = error.status === 409;
    draft.uncertain = !error.status || error.status >= 500;
    if (!draft.uncertain) draft.pending = null;
    draft.error = error.message || "No se pudo guardar la ficha.";
    render();
  }
});
