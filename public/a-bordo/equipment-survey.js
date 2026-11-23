/* Fichas relevadas a bordo. El archivo se lee en el dispositivo del administrador. */
function planEquipmentSurvey(pack, currentBoatId, equipment) {
  if (pack?.format !== 'nomad-equipment-survey-v1' || pack.boatId !== currentBoatId) {
    throw new Error('Este relevamiento corresponde a otro barco o tiene un formato desconocido.');
  }
  if (!Array.isArray(pack.cards) || !pack.cards.length || pack.cards.length > 40) {
    throw new Error('El relevamiento debe contener entre 1 y 40 fichas.');
  }
  const normalize = (value) => value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const identity = (item) => [item.name, item.location || ''].map(normalize).join('|');
  const ids = new Set();
  const names = new Set();
  const existing = new Set(equipment.map(identity));
  const cards = [];
  let skipped = 0;
  for (const row of pack.cards) {
    if (!row || typeof row.id !== 'string' || !/^survey-[a-z0-9-]{1,72}$/.test(row.id) || ids.has(row.id)) {
      throw new Error('Hay una ficha sin identificador válido o repetida.');
    }
    const clean = { id: row.id, hours: null };
    for (const [key, limit] of Object.entries({name: 140, system: 100, model: 140, location: 140, identificationNote: 700})) {
      if (typeof row[key] !== 'string' || row[key].length > limit || (['name','system','identificationNote'].includes(key) && !row[key].trim())) {
        throw new Error('La ficha contiene un nombre, sistema o detalle de identificación inválido.');
      }
      clean[key] = row[key].trim();
    }
    if (row.photo && (typeof row.photo !== 'string' || row.photo.length > 450000 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(row.photo))) {
      throw new Error('La foto de referencia debe ser una imagen JPG de tamaño reducido.');
    }
    clean.photo = row.photo || '';
    const key = identity(clean);
    if (names.has(key)) throw new Error('Hay dos fichas con el mismo nombre y ubicación.');
    ids.add(row.id);
    names.add(key);
    if (equipment.some((item) => item.id === clean.id) || existing.has(key)) skipped++;
    else cards.push(clean);
  }
  return { cards, skipped };
}

function mountEquipmentSurvey() {
  if (!session?.admin) return;
  const section = document.createElement('section');
  section.className = 'card section-gap';
  section.innerHTML = '<h2>Importar fichas de equipos</h2><label>Archivo de relevamiento<input type="file" accept=".json,application/json"></label><p class="subhead">Revisá las fotos y seleccioná los equipos y puntos de control que corresponden a este barco.</p>';
  document.querySelector('#content').append(section);
  section.querySelector('input').onchange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const target = boatId;
    const sourceState = state;
    try {
      if (file.size > 3500000) throw new Error('El relevamiento supera 3,5 MB.');
      let pack;
      try { pack = JSON.parse(await file.text()); }
      catch { throw new Error('No se pudo leer el archivo de relevamiento.'); }
      if (boatId !== target || !session?.admin || !section.isConnected) return;
      const plan = planEquipmentSurvey(pack, target, sourceState.boat.equipment);
      if (!plan.cards.length) return toast('Todas las fichas ya están registradas en este barco.');
      const modal = document.createElement('dialog');
      modal.className = 'survey-dialog';
      modal.innerHTML = '<form><h2>Revisar fichas para ' + esc(sourceState.boat.name) + '</h2><p>Seleccioná solo las identificaciones que reconocés a bordo. Las horas quedarán pendientes de lectura.</p>' +
        plan.cards.map((card, i) => '<label class="survey-card"><input type="checkbox" value="' + i + '"><span><strong>' + esc(card.name) + '</strong><br>' + esc(card.location || card.system) + '<br>' + esc(card.identificationNote) + '</span>' +
          (card.photo ? '<img src="' + esc(card.photo) + '" width="70" alt="Referencia visual">' : '') + '</label>').join('') +
        (plan.skipped ? '<p>' + plan.skipped + ' fichas ya registradas.</p>' : '') +
        '<p class="form-error" role="alert"></p><div class="inline-actions"><button type="button" class="secondary">Cancelar</button><button class="primary" type="submit">Incorporar seleccionadas</button></div></form>';
      document.body.append(modal);
      const form = modal.querySelector('form');
      const errorField = form.querySelector('[role="alert"]');
      const cancel = form.querySelector('[type="button"]');
      const submit = form.querySelector('[type="submit"]');
      let saving = false;
      cancel.onclick = () => modal.close();
      modal.oncancel = (ev) => { if (saving) ev.preventDefault(); };
      modal.onclose = () => modal.remove();
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        if (saving) return;
        const chosen = Array.from(form.querySelectorAll('input:checked'), el => plan.cards[Number(el.value)]);
        if (!chosen.length) { errorField.textContent = 'Elegí al menos una ficha.'; return; }
        if (!session?.admin || boatId !== target || state !== sourceState) {
          modal.close(); return toast('El estado del barco cambió. Volvé a revisar el archivo.');
        }
        saving = true;
        submit.disabled = cancel.disabled = true;
        errorField.textContent = '';
        try {
          const next = structuredClone(state);
          next.boat.equipment.push(...chosen);
          await commit(next);
          modal.close();
          toast(chosen.length + ' fichas incorporadas a ' + sourceState.boat.name + '.');
        } catch (err) {
          errorField.textContent = err.message;
        } finally {
          saving = false;
          submit.disabled = cancel.disabled = false;
        }
      };
      modal.showModal();
    } catch (err) { toast(err.message); }
  };
}

if (typeof module !== 'undefined') module.exports = { planEquipmentSurvey };
