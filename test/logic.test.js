'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { effectiveLevels, nextOrder, matchBuilding } = require('../src/main/jobs/buildJob');
const { chooseOrder, pickBuilding } = require('../src/main/jobs/trainJob');

test('nextOrder nimmt den ersten Auftrag, der noch nicht erreicht ist', () => {
  const template = [['main', 3], ['wood', 3], ['stone', 3]];
  const levels = { main: 3, wood: 1, stone: 0 };
  assert.deepStrictEqual(nextOrder(template, levels), { key: 'wood', level: 2, target: 3 });
});

test('nextOrder liefert nichts, wenn die Vorlage fertig ist', () => {
  assert.strictEqual(nextOrder([['main', 2]], { main: 2 }), null);
});

test('Auftraege in der Bauschleife zaehlen als Stufe mit', () => {
  const state = {
    levels: { main: 5, wood: 4 },
    names: { main: 'Hauptgebaeude', wood: 'Holzfaeller' },
    queue: ['Holzfaeller Stufe 5', 'Hauptgebaeude Stufe 6']
  };
  assert.deepStrictEqual(effectiveLevels(state), { main: 6, wood: 5 });
});

test('matchBuilding waehlt den laengsten passenden Namen', () => {
  const names = { wood: 'Holz', main: 'Holzfaeller' };
  assert.strictEqual(matchBuilding('Holzfaeller Stufe 5', names), 'main');
});

test('chooseOrder nimmt die Einheit mit dem geringsten Fortschritt', () => {
  const order = chooseOrder({
    template: { axe: 1000, light: 1000 },
    state: { units: { axe: { present: 800, max: null }, light: { present: 100, max: null } } },
    freePop: 500
  });
  assert.strictEqual(order.unit, 'light');
  assert.strictEqual(order.amount, 20);
});

test('chooseOrder achtet auf freie Bauernhofplaetze', () => {
  const order = chooseOrder({
    template: { axe: 1000 },
    state: { units: { axe: { present: 0, max: null } } },
    freePop: 12
  });
  assert.strictEqual(order.amount, 12);
});

test('chooseOrder wartet, bis ein ganzes Paket bezahlbar ist', () => {
  // Das Spiel meldet, dass nur sieben Axtkaempfer bezahlbar waeren. Ein Paket
  // umfasst fuenfzig, also wird nichts bestellt und die Rohstoffe bleiben
  // dem Bauplan erhalten.
  const order = chooseOrder({
    template: { axe: 1000 },
    state: { units: { axe: { present: 0, max: 7 } } },
    freePop: 500,
    minBatch: 10
  });
  assert.strictEqual(order, null);
});

test('chooseOrder bestellt den Rest, wenn er kleiner als ein Paket ist', () => {
  const order = chooseOrder({
    template: { axe: 12 },
    state: { units: { axe: { present: 0, max: 40 } } },
    freePop: 500
  });
  assert.strictEqual(order.amount, 12);
});

test('chooseOrder liefert nichts, wenn der Zielbestand erreicht ist', () => {
  const order = chooseOrder({
    template: { axe: 100 },
    state: { units: { axe: { present: 100, max: null } } },
    freePop: 500
  });
  assert.strictEqual(order, null);
});

test('chooseOrder rechnet den Bauernhofbedarf je Einheit mit', () => {
  const order = chooseOrder({
    template: { heavy: 1000 },
    state: { units: { heavy: { present: 0, max: null } } },
    freePop: 30
  });
  // Schwere Kavallerie braucht sechs Plaetze, also passen nur fuenf Einheiten.
  assert.strictEqual(order.amount, 5);
});

test('chooseOrder bestellt eine Teilmenge ab der kleinsten sinnvollen Menge', () => {
  const order = chooseOrder({
    template: { axe: 1000 },
    state: { units: { axe: { present: 0, max: 25 } } },
    freePop: 500,
    minBatch: 10
  });
  assert.strictEqual(order.amount, 25);
});

test('chooseOrder wartet, wenn die Teilmenge zu klein waere', () => {
  const order = chooseOrder({
    template: { axe: 1000 },
    state: { units: { axe: { present: 0, max: 4 } } },
    freePop: 500,
    minBatch: 10
  });
  assert.strictEqual(order, null);
});

test('effectiveLevels nutzt die Auftragszahl der Spielseite', () => {
  const state = {
    levels: { main: 23, garage: 9 },
    orders: { main: 1 },
    names: { main: 'Houptgeboeide' },
    queue: []
  };
  assert.deepStrictEqual(effectiveLevels(state), { main: 24, garage: 9 });
});

test('pickBuilding wechselt reihum zwischen den Rekrutierungsgebaeuden', () => {
  const template = { spear: 100, light: 50, ram: 10 };
  const village = { levels: { barracks: 20, stable: 15, garage: 9 } };
  village.lastTrainBuilding = 'barracks';
  assert.strictEqual(pickBuilding(template, village), 'stable');
  village.lastTrainBuilding = 'stable';
  assert.strictEqual(pickBuilding(template, village), 'garage');
  village.lastTrainBuilding = 'garage';
  assert.strictEqual(pickBuilding(template, village), 'barracks');
});

test('pickBuilding ueberspringt Gebaeude, die im Dorf fehlen', () => {
  const template = { spear: 100, light: 50 };
  const village = { levels: { barracks: 3, stable: 0 }, lastTrainBuilding: 'barracks' };
  assert.strictEqual(pickBuilding(template, village), 'barracks');
});

test('pickBuilding liefert nichts, wenn kein Gebaeude passt', () => {
  const template = { light: 50 };
  const village = { levels: { barracks: 3, stable: 0 } };
  assert.strictEqual(pickBuilding(template, village), null);
});

test('chooseOrder nimmt den Einwohnerbedarf von der Spielseite', () => {
  // Die Seite meldet vier Plaetze je leichter Kavallerie.
  const order = chooseOrder({
    template: { light: 1000 },
    state: { units: { light: { present: 0, max: 500, pop: 4 } } },
    freePop: 30,
    minBatch: 1
  });
  assert.strictEqual(order.amount, 7);
});

const { isWorldHost } = require('../src/main/bridge');

test('isWorldHost erkennt eine Weltadresse an der Nummer im Namen', () => {
  assert.strictEqual(isWorldHost('https://ch96.staemme.ch'), true);
  assert.strictEqual(isWorldHost('https://de249.die-staemme.de'), true);
  assert.strictEqual(isWorldHost('https://en130.tribalwars.net'), true);
});

test('isWorldHost erkennt die Startseite als keine Welt', () => {
  assert.strictEqual(isWorldHost('https://www.staemme.ch'), false);
  assert.strictEqual(isWorldHost('https://www.die-staemme.de'), false);
  assert.strictEqual(isWorldHost(''), false);
});
