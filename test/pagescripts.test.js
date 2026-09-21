'use strict';

// Diese Tests fuehren die Seitenskripte gegen einen wortgetreuen Auszug der
// echten Gebaeudeansicht von Welt 96 aus. Damit ist geprueft, dass die App auf
// der richtigen Seite den richtigen Knopf findet.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const scripts = require('../src/main/pageScripts');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'main-ch96.html'), 'utf8');
const gameData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'gamedata-ch96.json'), 'utf8'));

// Auszug aus BuildingMain.buildings der echten Seite.
const BUILDINGS = {
  main: { name: 'Houptgeböide', level: '23', level_next: 24, wood: 18313, stone: 21371, iron: 14244, pop: 27, order: null, error: null, can_build: true },
  garage: { name: 'Wärkstatt', level: '9', level_next: 10, wood: 2401, stone: 2214, iron: 2081, pop: 5, order: null, error: null, can_build: true },
  snob: { name: 'Adelshof', level: '1', level_next: 2, wood: 30000, stone: 50000, iron: 20000, pop: 14, order: null, error: 'Rohstoff vrfüegbar hüt um 18:59', can_build: true },
  wood: { name: 'Holzfäller', level: '29', level_next: 30, wood: 32312, stone: 68857, iron: 23013, pop: 43, order: null, error: 'Rohstoff vrfüegbar morn um 04:02', can_build: true },
  storage: { name: 'Spicher', level: '27', level_next: 28, wood: 34245, stone: 31745, iron: 14847, pop: 0, order: null, error: 'Rohstoff vrfüegbar i 0:01:58', can_build: true }
};

function openPage(options = {}) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(fixture, { runScripts: 'outside-only', virtualConsole });
  const { window } = dom;
  window.game_data = structuredClone(gameData);
  window.BuildingMain = { buildings: structuredClone(BUILDINGS) };
  if (options.orders) {
    for (const [key, count] of Object.entries(options.orders)) window.BuildingMain.buildings[key].order = count;
  }
  const clicks = [];
  window.document.addEventListener('click', (event) => {
    event.preventDefault();
    const anchor = event.target.closest ? event.target.closest('a') : null;
    if (anchor) clicks.push(anchor.getAttribute('href'));
  });
  return { window, clicks, run: (script) => window.eval(script) };
}

test('READ_BUILD liest Stufen und Namen aus der echten Seite', () => {
  const { run } = openPage();
  const state = run(scripts.READ_BUILD);
  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.villageId, '2201');
  assert.strictEqual(state.levels.main, 23);
  assert.strictEqual(state.levels.wall, 20);
  assert.strictEqual(state.names.garage, 'Wärkstatt');
  assert.strictEqual(state.resources.storage, 215219);
});

test('READ_BUILD haelt nur Gebaeude mit sichtbarem Knopf fuer baubar', () => {
  const { run } = openPage();
  const state = run(scripts.READ_BUILD);
  assert.strictEqual(state.buildable.main, 24);
  assert.strictEqual(state.buildable.garage, 10);
  // Holz und Speicher haben einen ausgeblendeten Knopf, weil Rohstoffe fehlen.
  assert.strictEqual(state.buildable.wood, undefined);
  assert.strictEqual(state.buildable.storage, undefined);
  // Der Adelshof ist vollstaendig ausgebaut und hat gar keinen Knopf.
  assert.strictEqual(state.buildable.snob, undefined);
});

test('READ_BUILD uebernimmt den Grund, warum ein Ausbau nicht geht', () => {
  const { run } = openPage();
  const state = run(scripts.READ_BUILD);
  assert.match(state.blocked.wood, /Rohstoff/);
});

test('READ_BUILD zaehlt laufende Bauauftraege aus den Spieldaten', () => {
  const { run } = openPage({ orders: { main: 1, garage: 1 } });
  const state = run(scripts.READ_BUILD);
  assert.strictEqual(state.queueLength, 2);
  // Der Wert kommt aus der Seitenumgebung, darum ueber JSON vergleichen.
  assert.strictEqual(JSON.stringify(state.orders), JSON.stringify({ main: 1, garage: 1 }));
});

test('clickBuild trifft den richtigen Knopf', () => {
  const { run, clicks } = openPage();
  const result = run(scripts.clickBuild('main'));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.target, 24);
  assert.strictEqual(clicks.length, 1);
  assert.match(clicks[0], /action=upgrade_building/);
  assert.match(clicks[0], /id=main/);
});

test('clickBuild klickt niemals den Knopf, der Premiumpunkte kostet', () => {
  const { run, clicks } = openPage();
  run(scripts.clickBuild('main'));
  run(scripts.clickBuild('garage'));
  for (const href of clicks) assert.ok(!/cheap/.test(href), `Knopf mit Premiumkosten geklickt: ${href}`);
});

test('clickBuild meldet den Grund, wenn Rohstoffe fehlen, und klickt nicht', () => {
  const { run, clicks } = openPage();
  const result = run(scripts.clickBuild('wood'));
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Rohstoff/);
  assert.strictEqual(clicks.length, 0);
});

test('clickBuild meldet ein vollstaendig ausgebautes Gebaeude', () => {
  const { run, clicks } = openPage();
  const result = run(scripts.clickBuild('snob'));
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /vollstaendig ausgebaut/);
  assert.strictEqual(clicks.length, 0);
});

test('clickBuild ruft die Funktion des Spiels auf, wenn es sie gibt', () => {
  const { run, window, clicks } = openPage();
  const calls = [];
  window.BuildingMain.build = (key) => { calls.push(key); return false; };
  const result = run(scripts.clickBuild('main'));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.how, 'BuildingMain.build');
  assert.deepStrictEqual([...calls], ['main']);
  // Der Knopf wird dann nicht zusaetzlich geklickt.
  assert.strictEqual(clicks.length, 0);
});

test('clickBuild weicht auf den Knopf aus, wenn die Funktion fehlt', () => {
  const { run, window, clicks } = openPage();
  delete window.BuildingMain.build;
  const result = run(scripts.clickBuild('main'));
  assert.strictEqual(result.how, 'Klick');
  assert.strictEqual(clicks.length, 1);
});

test('buildFingerprint bleibt gleich, solange sich nichts tut', () => {
  const { run } = openPage();
  const a = run(scripts.buildFingerprint('main'));
  const b = run(scripts.buildFingerprint('main'));
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

test('buildFingerprint erkennt einen neuen Auftrag in der Bauschleife', () => {
  const { run, window } = openPage();
  const before = run(scripts.buildFingerprint('main'));
  const queue = window.document.createElement('table');
  queue.id = 'buildqueue';
  queue.innerHTML = '<tr id="buildorder_1"><td>Houptgeböide Stufe 24</td></tr>';
  window.document.body.appendChild(queue);
  const after = run(scripts.buildFingerprint('main'));
  assert.notStrictEqual(JSON.stringify(after), JSON.stringify(before));
  assert.strictEqual(after.queueRows, 1);
});

test('buildFingerprint erkennt die naechste Stufe am Knopf', () => {
  const { run, window } = openPage();
  const before = run(scripts.buildFingerprint('main'));
  window.document.querySelector('#main_buildlink_main_24').setAttribute('data-level-next', '25');
  const after = run(scripts.buildFingerprint('main'));
  assert.strictEqual(before.nextLevel, 24);
  assert.strictEqual(after.nextLevel, 25);
});
