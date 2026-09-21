'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { distance, travelMinutes, slowestSpeed, carryCapacity } = require('../src/shared/geo');
const { parseVillages, parseUnits, parseNumber } = require('../src/main/worldData');
const { planFarmRun, cleanTroops, parseCoords } = require('../src/main/jobs/farmJob');
const { runTrainJob } = require('../src/main/jobs/trainJob');

// Aufbau der oeffentlichen Kartendatei, wortgetreu wie ausgeliefert.
const KARTE = [
  '1,014,515,517,1019748,8830,0',
  '2,493%7C498+Bambam+der+Baba+Knusper,493,498,1215701,9444,0',
  '17,Barbarendorf,545,521,0,120,0',
  '18,Barbarendorf,547,523,0,95,0',
  '19,Bonusdorf,560,560,0,300,3',
  'unsinn'
].join('\n');

const EINHEITEN = `<?xml version="1.0"?><config>
  <spear><speed>18</speed><carry>25</carry></spear>
  <spy><speed>9</speed><carry>0</carry></spy>
  <light><speed>10</speed><carry>80</carry></light>
</config>`;

test('Die Kartendatei wird richtig gelesen', () => {
  const villages = parseVillages(KARTE);
  assert.strictEqual(villages.length, 5);
  assert.strictEqual(villages[1].name, '493|498 Bambam der Baba Knusper');
  const barbaren = villages.filter((v) => v.player === 0);
  assert.strictEqual(barbaren.length, 3);
  assert.strictEqual(barbaren[0].x, 545);
});

test('Geschwindigkeit und Tragkraft werden gelesen', () => {
  const units = parseUnits(EINHEITEN);
  assert.strictEqual(units.spear.speed, 18);
  assert.strictEqual(units.light.carry, 80);
  assert.strictEqual(parseNumber('<unit_speed>0.625</unit_speed>', 'unit_speed', 1), 0.625);
});

test('Entfernung und Laufzeit stimmen', () => {
  assert.strictEqual(distance({ x: 500, y: 500 }, { x: 503, y: 504 }), 5);
  // Fuenf Felder mit zehn Minuten je Feld sind fuenfzig Minuten.
  assert.strictEqual(travelMinutes(5, 10, 1), 50);
  // Ein Weltfaktor von 0.625 macht die Truppen schneller.
  assert.strictEqual(travelMinutes(5, 10, 0.625), 31.25);
});

test('Der Angriff ist so langsam wie seine langsamste Einheit', () => {
  assert.strictEqual(slowestSpeed({ spy: 10, light: 5 }, { spy: 9, light: 10 }), 10);
  assert.strictEqual(slowestSpeed({ spy: 0 }, { spy: 9 }), null);
});

test('Die Tragkraft wird aus den Einheiten gerechnet', () => {
  assert.strictEqual(carryCapacity({ light: 10, spear: 4 }, { light: 80, spear: 25 }), 900);
});

const BARBAREN = parseVillages(KARTE).filter((v) => v.player === 0);
const UNITS = { spear: { speed: 18, carry: 25 }, light: { speed: 10, carry: 80 } };
const BASIS = {
  origin: { x: 545, y: 520 },
  troops: { light: 10 },
  units: UNITS,
  unitSpeed: 1,
  maxHours: 2,
  minMinutes: 120,
  history: {},
  barbarians: BARBAREN,
  home: { light: 50 },
  now: 1000000
};

test('Es wird das naechstgelegene Barbarendorf gewaehlt', () => {
  const plan = planFarmRun(BASIS);
  assert.strictEqual(plan.target.x, 545);
  assert.strictEqual(plan.target.y, 521);
  assert.strictEqual(Math.round(plan.minutes), 10);
  assert.strictEqual(plan.carry, 800);
});

test('Ziele in der Wartezeit werden uebersprungen', () => {
  const plan = planFarmRun({ ...BASIS, history: { 17: BASIS.now - 60 * 60 * 1000 } });
  assert.strictEqual(plan.target.id, 18);
});

test('Stehen alle Ziele in der Wartezeit, wird nichts geschickt', () => {
  const plan = planFarmRun({
    ...BASIS,
    history: { 17: BASIS.now, 18: BASIS.now, 19: BASIS.now }
  });
  assert.strictEqual(plan.target, null);
  assert.match(plan.reason, /Wartezeit/);
});

test('Der Umkreis in Stunden begrenzt die Auswahl', () => {
  // Zehn Minuten je Feld, eine Viertelstunde erlaubt also 1.5 Felder.
  const plan = planFarmRun({ ...BASIS, maxHours: 0.25 });
  assert.strictEqual(plan.target.id, 17);
  const eng = planFarmRun({ ...BASIS, maxHours: 0.1 });
  assert.strictEqual(eng.target, null);
  assert.match(eng.reason, /Kein Barbarendorf/);
});

test('Ohne genug Truppen daheim wird nichts geschickt', () => {
  const plan = planFarmRun({ ...BASIS, home: { light: 3 } });
  assert.strictEqual(plan.target, null);
  assert.match(plan.reason, /Zu wenige Truppen daheim/);
});

test('cleanTroops wirft Unsinn weg', () => {
  assert.deepStrictEqual(cleanTroops({ light: 10, quatsch: 5, spear: 0 }), { light: 10 });
});

test('parseCoords liest die Koordinaten aus der Beschriftung', () => {
  assert.deepStrictEqual(parseCoords('545|520'), { x: 545, y: 520 });
  assert.strictEqual(parseCoords('keine'), null);
});

test('Rekrutiert wird nur, wenn nichts mehr in Ausbildung ist', async () => {
  const village = { id: '1', name: 'Test', troopTemplate: 'Plan', levels: { barracks: 20 } };
  const store = {
    data: {
      automation: { trainOnlyWhenIdle: true, resourceBuffer: {}, farmBuffer: 0, minRecruitBatch: 10 },
      troopTemplates: { Plan: { spear: 1000 } }
    },
    get() { return this.data; },
    save() {}
  };
  const bridge = {
    readTrain: async () => ({
      ok: true, building: 'barracks', queueLength: 1,
      units: { spear: { present: 10, total: 10, max: 500, pop: 1 } },
      pop: 100, popMax: 1000, resources: { wood: 9999, stone: 9999, iron: 9999 }
    }),
    train: async () => { throw new Error('darf nicht bestellen'); }
  };
  const result = await runTrainJob({ bridge, store, logger: { action() {}, info() {} }, village });
  assert.strictEqual(result.skipped, true);
  assert.match(result.reason, /Ausbildung laeuft noch/);
});

test('Ist die Ausbildung leer, wird wieder bestellt', async () => {
  const bestellt = [];
  const village = { id: '1', name: 'Test', troopTemplate: 'Plan', levels: { barracks: 20 } };
  const store = {
    data: {
      automation: { trainOnlyWhenIdle: true, resourceBuffer: {}, farmBuffer: 0, minRecruitBatch: 10 },
      troopTemplates: { Plan: { spear: 1000 } }
    },
    get() { return this.data; },
    save() {}
  };
  const bridge = {
    readTrain: async () => ({
      ok: true, building: 'barracks', queueLength: 0,
      units: { spear: { present: 10, total: 10, max: 500, pop: 1 } },
      pop: 100, popMax: 1000, resources: { wood: 9999, stone: 9999, iron: 9999 }
    }),
    train: async (id, orders) => { bestellt.push(orders); return { ok: true }; }
  };
  const result = await runTrainJob({ bridge, store, logger: { action() {}, info() {} }, village });
  assert.strictEqual(result.acted, true);
  assert.deepStrictEqual(bestellt, [{ spear: 50 }]);
});

// --------------------------------------------------------- Abruf der Weltdaten

const { WorldData, describeError } = require('../src/main/worldData');

const KONFIG = '<config><speed>1</speed><unit_speed>1</unit_speed></config>';

function makeWorld(strategies, host = 'https://ch96.staemme.ch') {
  const store = { get: () => ({ world: { host } }) };
  const meldungen = [];
  const logger = { info: (m) => meldungen.push(m), warn: (m) => meldungen.push(m) };
  return { world: new WorldData({ store, logger, strategies }), meldungen };
}

test('Der Abruf nimmt den ersten Weg, der funktioniert', async () => {
  const benutzt = [];
  const { world } = makeWorld([
    ['erster', async () => { benutzt.push('erster'); return 'inhalt'; }],
    ['zweiter', async () => { benutzt.push('zweiter'); return 'inhalt'; }]
  ]);
  const text = await world.fetchText('https://ch96.staemme.ch/map/village.txt');
  assert.strictEqual(text, 'inhalt');
  assert.deepStrictEqual(benutzt, ['erster']);
});

test('Scheitert ein Weg, wird der naechste versucht', async () => {
  const benutzt = [];
  const { world, meldungen } = makeWorld([
    ['erster', async () => { benutzt.push('erster'); throw new Error('fetch failed'); }],
    ['zweiter', async () => { benutzt.push('zweiter'); return 'inhalt'; }]
  ]);
  assert.strictEqual(await world.fetchText('https://ch96.staemme.ch/map/village.txt'), 'inhalt');
  assert.deepStrictEqual(benutzt, ['erster', 'zweiter']);
  assert.ok(meldungen.some((m) => m.includes('zweiter')));
});

test('Scheitern alle Wege, nennt die Meldung jeden Grund', async () => {
  const { world } = makeWorld([
    ['erster', async () => { const e = new Error('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; }],
    ['zweiter', async () => { throw new Error('Antwort 403'); }]
  ]);
  await assert.rejects(
    () => world.fetchText('https://ch96.staemme.ch/map/village.txt'),
    (err) => /ENOTFOUND/.test(err.message) && /403/.test(err.message)
  );
});

test('describeError holt den wahren Grund unter fetch failed hervor', () => {
  const err = new Error('fetch failed');
  err.cause = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' };
  assert.match(describeError(err), /fetch failed/);
  assert.match(describeError(err), /ECONNREFUSED/);
});

test('Ohne feststehende Welt wird gar nicht erst geladen', async () => {
  const { world } = makeWorld([['egal', async () => { throw new Error('darf nicht aufgerufen werden'); }]], 'https://www.staemme.ch');
  const result = await world.refresh();
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /keine Welt/i);
});

test('Ein vollstaendiger Abruf liest Karte, Einheiten und Weltfaktoren', async () => {
  const { world } = makeWorld([['prueflauf', async (url) => {
    if (url.includes('village.txt')) return KARTE;
    if (url.includes('get_unit_info')) return EINHEITEN;
    return KONFIG;
  }]]);
  const result = await world.refresh();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.villages, 5);
  assert.strictEqual(result.barbarians, 3);
  assert.strictEqual(world.units.light.speed, 10);
  assert.strictEqual(world.unitSpeed, 1);
  assert.strictEqual(world.barbarians().length, 3);
});
