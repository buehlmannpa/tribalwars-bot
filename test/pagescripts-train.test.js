'use strict';

// Prueft die Seitenskripte fuer Dorfliste und Rekrutierung gegen wortgetreue
// Auszuege der echten Seiten von Welt 96.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const scripts = require('../src/main/pageScripts');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const baseGameData = JSON.parse(fixture('gamedata-ch96.json'));

const BARRACKS_UNITS = {
  spear: { wood: 50, stone: 30, iron: 10, pop: 1, build_time: 212.02, requirements_met: true },
  sword: { wood: 30, stone: 30, iron: 70, pop: 1, build_time: 311.8, requirements_met: true },
  axe: { wood: 60, stone: 30, iron: 40, pop: 1, build_time: 274.38, requirements_met: true },
  archer: { wood: 100, stone: 30, iron: 60, pop: 1, build_time: 374.16, requirements_met: false }
};

const STABLE_UNITS = {
  spy: { wood: 50, stone: 50, iron: 20, pop: 2, build_time: 250.35, requirements_met: true },
  light: { wood: 125, stone: 100, iron: 250, pop: 4, build_time: 500.71, requirements_met: true },
  marcher: { wood: 250, stone: 100, iron: 150, pop: 5, build_time: 751.07, requirements_met: false }
};

function openPage(file, { screen, units } = {}) {
  const dom = new JSDOM(fixture(file), { runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const { window } = dom;
  window.game_data = structuredClone(baseGameData);
  if (screen) window.game_data.screen = screen;
  if (units) window.unit_managers = { units: structuredClone(units) };
  const submits = [];
  window.document.addEventListener('click', (event) => {
    event.preventDefault();
    const form = event.target.form;
    if (form) {
      const values = {};
      for (const input of form.querySelectorAll('input[name]')) values[input.name] = input.value;
      submits.push({ action: form.getAttribute('action'), values });
    }
  });
  return { window, submits, run: (script) => window.eval(script) };
}

test('LIST_VILLAGES liest Nummer, Name und Koordinaten aller Doerfer', () => {
  const { run } = openPage('villages-ch96.html', { screen: 'overview_villages' });
  const result = run(scripts.LIST_VILLAGES);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.villages.length, 3);
  assert.strictEqual(result.villages[0].id, '2201');
  assert.strictEqual(result.villages[0].name, '-001-');
  assert.strictEqual(result.villages[0].coords, '545|520');
  assert.strictEqual(result.villages[0].continent, 'K55');
  assert.strictEqual(result.villages[2].id, '1990');
  assert.strictEqual(result.villages[2].coords, '543|520');
});

test('READ_TRAIN liest Bestand, Hoechstzahl und Kosten der Kaserne', () => {
  const { run } = openPage('train-barracks-ch96.html', { screen: 'barracks', units: BARRACKS_UNITS });
  const state = run(scripts.READ_TRAIN);
  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.building, 'barracks');
  assert.strictEqual(state.units.spear.present, 45);
  assert.strictEqual(state.units.spear.total, 3264);
  assert.strictEqual(state.units.spear.max, 1044);
  assert.strictEqual(state.units.spear.pop, 1);
  assert.strictEqual(state.units.sword.present, 0);
  assert.strictEqual(state.units.sword.max, 527);
  assert.strictEqual(state.units.axe.max, 870);
  // Der Bogenschuetze ist nicht erforscht und hat kein Eingabefeld.
  assert.strictEqual(state.units.archer, undefined);
});

test('READ_TRAIN zaehlt laufende Ausbildungen ueber die Abbruchknoepfe', () => {
  const { run } = openPage('train-barracks-ch96.html', { screen: 'barracks', units: BARRACKS_UNITS });
  const state = run(scripts.READ_TRAIN);
  assert.strictEqual(state.queueLength, 1);
  assert.match(state.queue[0], /128 Speertr/);
});

test('READ_TRAIN kommt auch ohne laufende Ausbildung zurecht', () => {
  const { run } = openPage('train-stable-ch96.html', { screen: 'stable', units: STABLE_UNITS });
  const state = run(scripts.READ_TRAIN);
  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.queueLength, 0);
  assert.strictEqual(state.units.spy.pop, 2);
  assert.strictEqual(state.units.light.pop, 4);
  assert.strictEqual(state.units.light.max, 147);
});

test('READ_TRAIN meldet ein fehlendes Gebaeude, statt zu raten', () => {
  const { run } = openPage('villages-ch96.html', { screen: 'overview_villages' });
  const state = run(scripts.READ_TRAIN);
  assert.strictEqual(state.ok, false);
  assert.match(state.error, /Gebaeude fehlt/);
});

test('submitTrain traegt die Menge ein und schickt das Formular ab', () => {
  const { run, submits, window } = openPage('train-barracks-ch96.html', { screen: 'barracks', units: BARRACKS_UNITS });
  const result = run(scripts.submitTrain({ spear: 50 }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(window.document.querySelector('#spear_0').value, '50');
  assert.strictEqual(submits.length, 1);
  assert.match(submits[0].action, /action=train/);
  assert.strictEqual(submits[0].values.spear, '50');
  assert.strictEqual(submits[0].values.h, '57fa980b');
});

test('submitTrain ruehrt fremde Einheiten nicht an', () => {
  const { run, window } = openPage('train-barracks-ch96.html', { screen: 'barracks', units: BARRACKS_UNITS });
  run(scripts.submitTrain({ sword: 50 }));
  assert.strictEqual(window.document.querySelector('#spear_0').value, '');
  assert.strictEqual(window.document.querySelector('#sword_0').value, '50');
});

test('SCAN_VILLAGE liest Gebaeudestufen, Punkte und Bauernhof', () => {
  const { run } = openPage('overview-village.html', { screen: 'overview' });
  const state = run(scripts.SCAN_VILLAGE);
  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.id, '2201');
  assert.strictEqual(state.points, 6782);
  assert.strictEqual(state.levels.main, 23);
  assert.strictEqual(state.levels.wall, 20);
  assert.strictEqual(state.pop, 8961);
  assert.strictEqual(state.popMax, 10848);
  assert.strictEqual(state.resources.storage, 215219);
});

test('SCAN_VILLAGE unterscheidet Truppen daheim und Truppen gesamt', () => {
  const { run } = openPage('overview-village.html', { screen: 'overview' });
  const state = run(scripts.SCAN_VILLAGE);
  assert.strictEqual(state.units.spear, 40);
  assert.strictEqual(state.unitsHome.spear, 35);
  assert.strictEqual(state.units.ram, 20);
  assert.strictEqual(state.unitsHome.ram, 20);
});

test('SCAN_VILLAGE kommt ohne Truppenanzeige zurecht', () => {
  const { run } = openPage('villages-ch96.html', { screen: 'overview' });
  const state = run(scripts.SCAN_VILLAGE);
  assert.strictEqual(state.ok, true);
  assert.strictEqual(Object.keys(state.unitsHome).length, 0);
});
