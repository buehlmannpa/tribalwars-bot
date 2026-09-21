'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { effectiveLevels, nextOrder, matchBuilding } = require('../src/main/jobs/buildJob');
const { chooseOrder, pickBuilding, garageUnlocked } = require('../src/main/jobs/trainJob');

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

test('pickBuilding haelt den Vorrang zweimal Kaserne, einmal Stall ein', () => {
  const template = { spear: 100, light: 50 };
  const village = { levels: { barracks: 20, stable: 15 }, units: { spear: 0, light: 0 } };
  assert.strictEqual(pickBuilding(template, village), 'barracks');
  assert.strictEqual(pickBuilding(template, village), 'barracks');
  assert.strictEqual(pickBuilding(template, village), 'stable');
  assert.strictEqual(pickBuilding(template, village), 'barracks');
  assert.strictEqual(pickBuilding(template, village), 'barracks');
  assert.strictEqual(pickBuilding(template, village), 'stable');
});

test('pickBuilding laesst die Werkstatt aus, solange Kaserne und Stall zu duenn sind', () => {
  const template = { spear: 100, light: 50, ram: 10 };
  const village = {
    levels: { barracks: 20, stable: 15, garage: 9 },
    units: { spear: 10, light: 5, ram: 0 }
  };
  const gewaehlt = [
    pickBuilding(template, village),
    pickBuilding(template, village),
    pickBuilding(template, village),
    pickBuilding(template, village)
  ];
  assert.deepStrictEqual(gewaehlt, ['barracks', 'barracks', 'stable', 'barracks']);
});

test('pickBuilding nimmt die Werkstatt dazu, sobald die Haelfte steht', () => {
  const template = { spear: 100, light: 50, ram: 10 };
  const village = {
    levels: { barracks: 20, stable: 15, garage: 9 },
    units: { spear: 60, light: 30, ram: 0 }
  };
  const gewaehlt = [
    pickBuilding(template, village),
    pickBuilding(template, village),
    pickBuilding(template, village),
    pickBuilding(template, village)
  ];
  assert.deepStrictEqual(gewaehlt, ['barracks', 'barracks', 'stable', 'garage']);
});

test('garageUnlocked rechnet nur mit Truppen von Kaserne und Stall', () => {
  const template = { spear: 100, light: 100, ram: 50 };
  // 50 von 200 sind erst ein Viertel.
  assert.strictEqual(garageUnlocked(template, {
    levels: { barracks: 5, stable: 5, garage: 5 }, units: { spear: 50, light: 0 }
  }), false);
  // 100 von 200 sind genau die Haelfte.
  assert.strictEqual(garageUnlocked(template, {
    levels: { barracks: 5, stable: 5, garage: 5 }, units: { spear: 100, light: 0 }
  }), true);
});

test('garageUnlocked zaehlt Ueberschuss einer Einheit nicht doppelt', () => {
  const template = { spear: 100, light: 300 };
  // Ohne Deckelung waeren 400 Speertraeger schon das ganze Ziel, gezaehlt
  // werden aber nur die 100 aus der Vorlage.
  const village = { levels: { barracks: 5, stable: 5 }, units: { spear: 400, light: 0 } };
  assert.strictEqual(garageUnlocked(template, village), false);
});

test('garageUnlocked laesst fehlende Gebaeude aussen vor', () => {
  const template = { spear: 100, light: 100, ram: 10 };
  // Ohne Stall zaehlt nur die Kaserne, dort steht mehr als die Haelfte.
  const village = { levels: { barracks: 20, stable: 0, garage: 5 }, units: { spear: 60 } };
  assert.strictEqual(garageUnlocked(template, village), true);
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

const { stockOf } = require('../src/main/jobs/trainJob');

test('chooseOrder zaehlt Truppen mit, die gerade unterwegs sind', () => {
  // Die Spielseite meldet null daheim und 440 insgesamt, die Vorlage will 400.
  const order = chooseOrder({
    template: { spy: 400 },
    state: { units: { spy: { present: 0, total: 440, pop: 2 } } },
    freePop: 500,
    minBatch: 10
  });
  assert.strictEqual(order, null);
});

test('chooseOrder bestellt, wenn der Gesamtbestand unter dem Ziel liegt', () => {
  const order = chooseOrder({
    template: { spy: 400 },
    state: { units: { spy: { present: 0, total: 380, pop: 2, max: 500 } } },
    freePop: 500,
    minBatch: 10
  });
  assert.strictEqual(order.unit, 'spy');
  assert.strictEqual(order.amount, 20);
});

test('chooseOrder bestellt nichts, wenn der Bestand nicht lesbar ist', () => {
  const order = chooseOrder({
    template: { spy: 400 },
    state: { units: { spy: { present: null, total: null, pop: 2, max: 500 } } },
    freePop: 500,
    minBatch: 10
  });
  assert.strictEqual(order, null);
});

test('stockOf nimmt den Gesamtbestand vor dem Bestand daheim', () => {
  assert.strictEqual(stockOf({ present: 0, total: 440 }), 440);
  assert.strictEqual(stockOf({ present: 12, total: null }), 12);
  assert.strictEqual(stockOf({ present: null, total: null }), null);
  assert.strictEqual(stockOf(null), null);
});

test('pickBuilding bevorzugt Gebaeude, in denen noch etwas fehlt', () => {
  const template = { spear: 100, light: 100 };
  const village = {
    levels: { barracks: 20, stable: 15 },
    units: { spear: 100, light: 10 },
    lastTrainBuilding: 'stable'
  };
  // In der Kaserne ist das Ziel erreicht, also bleibt der Stall an der Reihe.
  assert.strictEqual(pickBuilding(template, village), 'stable');
});

test('pickBuilding schaut reihum, wenn nirgends etwas fehlt', () => {
  const template = { spear: 100, light: 100 };
  const village = {
    levels: { barracks: 20, stable: 15 },
    units: { spear: 100, light: 100 },
    trainRotation: 2
  };
  assert.strictEqual(pickBuilding(template, village), 'stable');
  assert.strictEqual(pickBuilding(template, village), 'barracks');
});
