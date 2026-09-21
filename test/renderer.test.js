'use strict';

// Laedt das Dashboard mit jsdom, so wie es die App laedt, und prueft, dass es
// sich mit echten Daten fehlerfrei aufbaut und bedienen laesst.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM, VirtualConsole } = require('jsdom');

const indexFile = path.join(__dirname, '..', 'src', 'renderer', 'index.html');

const CONFIG = {
  world: { host: 'https://ch96.staemme.ch', label: 'Welt ch96' },
  automation: {
    enabled: false, observeOnly: true, premium: false,
    minDelaySeconds: 45, maxDelaySeconds: 180, maxActionsPerHour: 60,
    villageCooldownMinutes: 12, keepQueueFilled: 2, priority: 'build',
    resourceBuffer: { wood: 0, stone: 0, iron: 0 }, minRecruitBatch: 10, farmBuffer: 0,
    nightPause: { enabled: false, startHour: 23, endHour: 8 },
    pauseOnIncoming: true, keepAwake: true,
    notifications: { captcha: true, login: true, incoming: true }
  },
  villages: {
    2201: {
      id: '2201', name: '-001-', coords: '545|520', continent: 'K55', points: 6782,
      buildTemplate: 'Defensiv', troopTemplate: 'Defensiv voll',
      buildActive: true, troopActive: true, lastRun: 0,
      levels: { main: 23, barracks: 20, wall: 20, farm: 25, storage: 27 },
      units: { spear: 440, sword: 120 }, unitsHome: { spear: 200, sword: 120 },
      pop: 8961, popMax: 10848,
      resources: { wood: 51734, stone: 31782, iron: 36610, storage: 215219 },
      scannedAt: Date.now()
    },
    2283: {
      id: '2283', name: '-002-', coords: '545|521', points: 4388,
      buildTemplate: null, troopTemplate: null, buildActive: false, troopActive: false, lastRun: 0
    }
  },
  buildTemplates: { Defensiv: [['main', 20], ['wall', 20], ['farm', 30]] },
  troopTemplates: { 'Defensiv voll': { spear: 3000, sword: 3000 } }
};

const STATUS = { running: false, observeOnly: true, pauseReason: null, nextTickAt: null, actionsLastHour: 0, probe: null };

async function openDashboard() {
  const html = fs.readFileSync(indexFile, 'utf8');
  const calls = [];
  const handlers = {};
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: pathToFileURL(indexFile).href,
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      window.api = {
        invoke: (channel, payload) => {
          calls.push({ channel, payload });
          if (channel === 'state:get') {
            return Promise.resolve({ config: structuredClone(CONFIG), status: STATUS, logs: [], gameWidth: 0 });
          }
          return Promise.resolve(structuredClone(CONFIG));
        },
        on: (channel, fn) => { handlers[channel] = fn; return () => {}; }
      };
    }
  });
  await new Promise((resolve) => dom.window.addEventListener('load', resolve));
  // Ein paar Runden, damit die Versprechen der Oberflaeche eingeloest sind.
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
  return { dom, window: dom.window, document: dom.window.document, calls, handlers };
}

test('Dashboard baut sich mit echten Daten fehlerfrei auf', async () => {
  const { dom, document } = await openDashboard();
  assert.match(document.getElementById('world').textContent, /ch96/);
  assert.strictEqual(document.querySelectorAll('#villageList .village').length, 2);
  assert.strictEqual(document.querySelectorAll('#worldView .card').length, 2);
  dom.window.close();
});

test('Der Hinweis auf den Beobachtungsmodus erscheint', async () => {
  const { dom, document } = await openDashboard();
  assert.strictEqual(document.getElementById('observeBanner').hidden, false);
  assert.strictEqual(document.getElementById('badge').textContent, 'angehalten');
  dom.window.close();
});

test('Fortschritt wird als Balken und Ring dargestellt, nicht als nackter Text', async () => {
  const { dom, document } = await openDashboard();
  const card = document.querySelector('#villageList .village');
  assert.ok(card.querySelectorAll('.track .fill').length >= 4, 'Rohstoffe und Bauernhof als Balken');
  assert.ok(card.querySelectorAll('svg.ring').length >= 1, 'Fortschritt als Ring');
  dom.window.close();
});

test('Der Bauplan Fortschritt rechnet richtig', async () => {
  const { dom, document } = await openDashboard();
  // Vorlage Defensiv: main 20 erreicht, wall 20 erreicht, farm 30 nicht, also zwei von drei.
  const rings = document.querySelectorAll('#worldView .card svg.ring text');
  assert.strictEqual(rings[0].textContent, '67%');
  dom.window.close();
});

test('Die Truppen zeigen den Gesamtbestand und was unterwegs ist', async () => {
  const { dom, document } = await openDashboard();
  const text = document.querySelector('#worldView .card').textContent;
  assert.match(text, /240 unterwegs/);
  dom.window.close();
});

test('Auswahl und Sammelzuweisung sind bedienbar', async () => {
  const { dom, document, calls } = await openDashboard();
  document.getElementById('selAll').checked = true;
  document.getElementById('selAll').dispatchEvent(new dom.window.Event('change'));
  assert.match(document.getElementById('selCount').textContent, /2 Doerfer/);
  document.getElementById('btnAssignBuild').dispatchEvent(new dom.window.Event('click'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(calls.some((c) => c.channel === 'villages:assign'), 'Zuweisung wurde abgeschickt');
  dom.window.close();
});

test('Die Reiter schalten die Ansichten um', async () => {
  const { dom, document } = await openDashboard();
  const tab = document.querySelector('.seg[data-tab="settings"]');
  tab.dispatchEvent(new dom.window.Event('click'));
  assert.ok(document.getElementById('tab-settings').classList.contains('active'));
  assert.ok(!document.getElementById('tab-villages').classList.contains('active'));
  dom.window.close();
});

test('Die Einstellungen stehen auf den gespeicherten Werten', async () => {
  const { dom, document } = await openDashboard();
  assert.strictEqual(document.getElementById('observeOnly').checked, true);
  assert.strictEqual(document.getElementById('minDelay').value, '45');
  assert.strictEqual(document.getElementById('priority').value, 'build');
  assert.strictEqual(document.getElementById('keepQueue').value, '2');
  dom.window.close();
});

test('Gebuendelte Meldungen erscheinen als eine Zeile mit Zaehler', async () => {
  const { dom, document, handlers } = await openDashboard();
  const eintrag = { id: 7, ts: Date.now(), firstTs: Date.now() - 60000, level: 'info', message: 'Durchlauf: 6 Doerfer geprueft, nichts zu tun', count: 1 };
  handlers.log(eintrag);
  handlers.log(Object.assign({}, eintrag, { count: 2 }));
  handlers.log(Object.assign({}, eintrag, { count: 3 }));
  const zeilen = document.querySelectorAll('#log p');
  assert.strictEqual(zeilen.length, 1);
  assert.match(zeilen[0].textContent, /3 mal/);
  dom.window.close();
});

test('Verschiedene Meldungen bleiben eigene Zeilen', async () => {
  const { dom, document, handlers } = await openDashboard();
  handlers.log({ id: 1, ts: Date.now(), firstTs: Date.now(), level: 'info', message: 'A', count: 1 });
  handlers.log({ id: 2, ts: Date.now(), firstTs: Date.now(), level: 'action', message: 'B', count: 1 });
  assert.strictEqual(document.querySelectorAll('#log p').length, 2);
  dom.window.close();
});
