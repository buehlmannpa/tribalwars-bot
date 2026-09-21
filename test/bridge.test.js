'use strict';

// Die Bruecke wird vom Planer und vom Hauptprozess ueber ihre Methoden
// angesprochen. Fehlt eine davon, faellt es erst im Betrieb auf. Diese Tests
// halten den Bauplan der Klasse fest.

const test = require('node:test');
const assert = require('node:assert');
const { Bridge, isWorldHost } = require('../src/main/bridge');

const ERWARTETE_METHODEN = [
  'attachTo', 'layout', 'splitWidth', 'setVisible', 'isVisible',
  'exec', 'ensureWorld', 'adoptWorld', 'navigate', 'probe',
  'listVillages', 'scanVillage', 'readBuild', 'readTrain',
  'upgrade', 'train', 'confirm', 'captureUnconfirmed', 'capture'
];

function makeBridge(host) {
  const data = {
    world: { host, label: 'Test' },
    automation: { observeOnly: false }
  };
  const store = { get: () => data, patch: (partial) => Object.assign(data, partial), save: () => data };
  const logger = { info: () => {}, warn: () => {}, error: () => {}, action: () => {} };
  return new Bridge({ store, logger });
}

test('die Bruecke hat alle Methoden, die anderswo aufgerufen werden', () => {
  const bridge = makeBridge('https://ch96.staemme.ch');
  const fehlend = ERWARTETE_METHODEN.filter((name) => typeof bridge[name] !== 'function');
  assert.deepStrictEqual(fehlend, [], `fehlende Methoden: ${fehlend.join(', ')}`);
});

test('ensureWorld gibt eine bekannte Welt sofort frei', async () => {
  const bridge = makeBridge('https://ch96.staemme.ch');
  const result = await bridge.ensureWorld();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.host, 'https://ch96.staemme.ch');
});

test('ensureWorld meldet verstaendlich, wenn noch keine Welt feststeht', async () => {
  const bridge = makeBridge('https://www.staemme.ch');
  const result = await bridge.ensureWorld();
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Welt/);
});

test('navigate bricht sauber ab, solange keine Welt feststeht', async () => {
  const bridge = makeBridge('https://www.staemme.ch');
  const result = await bridge.navigate('main', '2201');
  assert.strictEqual(result.ok, false);
});

test('ohne Spielansicht liefert exec einen verstaendlichen Hinweis', async () => {
  const bridge = makeBridge('https://ch96.staemme.ch');
  const result = await bridge.exec('1 + 1');
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Spielansicht/);
});

test('isWorldHost unterscheidet Welt und Startseite', () => {
  assert.strictEqual(isWorldHost('https://ch96.staemme.ch'), true);
  assert.strictEqual(isWorldHost('https://www.staemme.ch'), false);
});

// Ein allgemeiner Schutz gegen abhanden gekommene Methoden: alles, was im
// Quelltext auf sich selbst oder auf die Bruecke aufgerufen wird, muss es
// auch wirklich geben.
const fs = require('node:fs');
const path = require('node:path');
const { Scheduler } = require('../src/main/scheduler');

const quelle = (...teile) => fs.readFileSync(path.join(__dirname, '..', 'src', 'main', ...teile), 'utf8');
const aufrufe = (text, praefix) => [...text.matchAll(new RegExp(`${praefix}\\.([a-zA-Z_][\\w]*)\\s*\\(`, 'g'))]
  .map((treffer) => treffer[1]);

// Diese Felder werden von aussen gesetzt, nicht von der Klasse mitgebracht.
const VON_AUSSEN = new Set(['onLayout', 'onStatus']);

test('jede Methode, die die Bruecke auf sich selbst aufruft, ist vorhanden', () => {
  const bridge = makeBridge('https://ch96.staemme.ch');
  const fehlend = [...new Set(aufrufe(quelle('bridge.js'), 'this'))]
    .filter((name) => !VON_AUSSEN.has(name) && typeof bridge[name] !== 'function');
  assert.deepStrictEqual(fehlend, []);
});

test('jede Methode, die der Planer auf sich selbst aufruft, ist vorhanden', () => {
  const scheduler = new Scheduler({
    bridge: makeBridge('https://ch96.staemme.ch'),
    store: { get: () => ({ automation: { observeOnly: false, notifications: {} }, villages: {} }), patch: () => {}, save: () => {} },
    logger: { info: () => {}, warn: () => {}, error: () => {}, action: () => {} }
  });
  const fehlend = [...new Set(aufrufe(quelle('scheduler.js'), 'this'))]
    .filter((name) => !VON_AUSSEN.has(name) && typeof scheduler[name] !== 'function');
  assert.deepStrictEqual(fehlend, []);
});

test('jede Methode, die der Hauptprozess auf der Bruecke aufruft, ist vorhanden', () => {
  const bridge = makeBridge('https://ch96.staemme.ch');
  const namen = [...new Set([...aufrufe(quelle('main.js'), 'bridge'), ...aufrufe(quelle('scheduler.js'), 'this\\.bridge')])];
  const fehlend = namen.filter((name) => !VON_AUSSEN.has(name) && typeof bridge[name] !== 'function');
  assert.deepStrictEqual(fehlend, []);
});
