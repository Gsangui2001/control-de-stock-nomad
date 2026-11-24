const test = require('node:test');
const assert = require('node:assert/strict');
const { planEquipmentSurvey } = require('../public/a-bordo/equipment-survey.js');

const card = { id: 'survey-uno', name: 'Filtro', system: 'Sanitarios', model: '', location: 'Babor', identificationNote: 'Identificado en el registro.' };
const pack = { format: 'nomad-equipment-survey-v1', boatId: 'barco-a', cards: [card] };

test('prepara fichas sin deducir existencias ni horas', () => {
  const { cards } = planEquipmentSurvey({ ...pack, cards: [{ ...card, hours: 16, current: 5 }] }, 'barco-a', []);
  assert.equal(cards[0].hours, null);
  assert.equal(Object.hasOwn(cards[0], 'current'), false);
});
test('preserva los equipos editados y separa ubicaciones distintas', () => {
  const existing = [{ ...card, id: 'manual', name: ' FILTRO ', hours: 36 }];
  assert.equal(planEquipmentSurvey(pack, 'barco-a', existing).skipped, 1);
  assert.equal(planEquipmentSurvey(pack, 'barco-a', [{ ...card, name: 'Otra descripción' }]).skipped, 1);
  assert.equal(planEquipmentSurvey(pack, 'barco-a', [{ ...existing[0], location: 'Estribor' }]).cards.length, 1);
  assert.equal(existing[0].hours, 36);
});
test('rechaza un relevamiento de otro barco o con fichas ambiguas', () => {
  assert.throws(() => planEquipmentSurvey(pack, 'barco-b', []));
  assert.throws(() => planEquipmentSurvey({ ...pack, cards: [card, card] }, 'barco-a', []));
  assert.throws(() => planEquipmentSurvey({ ...pack, cards: [{ ...card, photo: 'foto-sin-incluir' }] }, 'barco-a', []));
});
