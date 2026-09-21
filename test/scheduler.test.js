'use strict';

// Der Planer geht je Durchlauf durch alle faelligen Doerfer und haelt dabei
// den eingestellten Vorrang ein. Diese Tests laufen ohne Spiel und ohne Netz.

const test = require('node:test');
const assert = require('node:assert');
const { Scheduler, summaryText } = require('../src/main/scheduler');

function makeScheduler({ villages, automation, jobs }) {
  const data = {
    automation: Object.assign({
      observeOnly: false, priority: 'build', villageCooldownMinutes: 12,
      maxActionsPerHour: 60, notifications: {}
    }, automation || {}),
    villages
  };
  const logs = [];
  const scheduler = new Scheduler({
    bridge: { setVisible: () => {} },
    store: { get: () => data, patch: () => data, save: () => data },
    logger: {
      info: (m) => logs.push(['info', m]),
      warn: (m) => logs.push(['warn', m]),
      error: (m) => logs.push(['error', m]),
      action: (m) => logs.push(['action', m])
    },
    jobs
  });
  scheduler.running = true;
  return { scheduler, logs, config: data };
}

test('dueVillages liefert alle faelligen Doerfer, das aelteste zuerst', () => {
  const jetzt = Date.now();
  const { scheduler, config } = makeScheduler({
    villages: {
      a: { id: 'a', buildActive: true, lastRun: jetzt - 60 * 60 * 1000 },
      b: { id: 'b', troopActive: true, lastRun: jetzt - 30 * 60 * 1000 },
      c: { id: 'c', buildActive: true, lastRun: jetzt - 60 * 1000 },
      d: { id: 'd', buildActive: false, troopActive: false, farmActive: false, lastRun: 0 }
    }
  });
  const faellig = scheduler.dueVillages(config).map((v) => v.id);
  assert.deepStrictEqual(faellig, ['a', 'b']);
});

test('dueVillages nimmt auch Doerfer, die nur farmen', () => {
  const { scheduler, config } = makeScheduler({
    villages: { a: { id: 'a', farmActive: true, lastRun: 0 } }
  });
  assert.deepStrictEqual(scheduler.dueVillages(config).map((v) => v.id), ['a']);
});

test('isPriorityJob folgt der Einstellung', () => {
  const bau = makeScheduler({ villages: {}, automation: { priority: 'build' } });
  assert.strictEqual(bau.scheduler.isPriorityJob(bau.config, {}, 'build'), true);
  assert.strictEqual(bau.scheduler.isPriorityJob(bau.config, {}, 'troops'), false);

  const truppen = makeScheduler({ villages: {}, automation: { priority: 'troops' } });
  assert.strictEqual(truppen.scheduler.isPriorityJob(truppen.config, {}, 'troops'), true);

  const wechsel = makeScheduler({ villages: {}, automation: { priority: 'alternate' } });
  const dorf = { lastPriority: 'troops' };
  assert.strictEqual(wechsel.scheduler.isPriorityJob(wechsel.config, dorf, 'troops'), true);
  assert.strictEqual(wechsel.scheduler.isPriorityJob(wechsel.config, dorf, 'build'), false);
});

test('bei Vorrang Gebaeude bleiben die Truppen stehen, solange gespart wird', async () => {
  const gelaufen = [];
  const { scheduler, config } = makeScheduler({
    villages: {},
    automation: { priority: 'build' },
    jobs: {
      build: async () => { gelaufen.push('build'); return { ok: true, waiting: true, missing: ['wood'] }; },
      troops: async () => { gelaufen.push('troops'); return { ok: true }; }
    }
  });
  const summary = { villages: 1, built: 0, trained: 0, farmed: 0, observed: 0, waiting: 0, saving: 0, done: 0, idle: 0, problems: 0 };
  await scheduler.runVillage(config, { id: 'a', buildActive: true, troopActive: true }, summary);
  assert.deepStrictEqual(gelaufen, ['build']);
  assert.strictEqual(summary.waiting, 1);
  assert.strictEqual(summary.saving, 1);
});

test('bei Vorrang Truppen bleibt der Bauplan stehen, solange gespart wird', async () => {
  const gelaufen = [];
  const { scheduler, config } = makeScheduler({
    villages: {},
    automation: { priority: 'troops' },
    jobs: {
      build: async () => { gelaufen.push('build'); return { ok: true }; },
      troops: async () => { gelaufen.push('troops'); return { ok: true, waiting: true }; }
    }
  });
  const summary = { villages: 1, built: 0, trained: 0, farmed: 0, observed: 0, waiting: 0, saving: 0, done: 0, idle: 0, problems: 0 };
  await scheduler.runVillage(config, { id: 'a', buildActive: true, troopActive: true }, summary);
  assert.deepStrictEqual(gelaufen, ['troops']);
});

test('wartet der nachrangige Auftrag, laeuft der bevorzugte trotzdem', async () => {
  const gelaufen = [];
  const { scheduler, config } = makeScheduler({
    villages: {},
    automation: { priority: 'build' },
    jobs: {
      build: async () => { gelaufen.push('build'); return { ok: true, acted: true }; },
      troops: async () => { gelaufen.push('troops'); return { ok: true, waiting: true }; }
    }
  });
  const summary = { villages: 1, built: 0, trained: 0, farmed: 0, observed: 0, waiting: 0, saving: 0, done: 0, idle: 0, problems: 0 };
  await scheduler.runVillage(config, { id: 'a', buildActive: true, troopActive: true }, summary);
  assert.deepStrictEqual(gelaufen, ['build', 'troops']);
  assert.strictEqual(summary.built, 1);
  assert.strictEqual(summary.saving, 0);
});

test('ein Durchlauf geht durch alle faelligen Doerfer', async () => {
  const besucht = [];
  const { scheduler, config } = makeScheduler({
    villages: {
      a: { id: 'a', name: 'Dorf A', buildActive: true, lastRun: 0 },
      b: { id: 'b', name: 'Dorf B', buildActive: true, lastRun: 0 },
      c: { id: 'c', name: 'Dorf C', buildActive: true, lastRun: 0 }
    },
    jobs: {
      build: async ({ village }) => { besucht.push(village.id); return { ok: true, acted: true }; },
      troops: async () => ({ ok: true }),
      farm: async () => ({ ok: true })
    }
  });
  const summary = { villages: 0, built: 0, trained: 0, farmed: 0, observed: 0, waiting: 0, saving: 0, done: 0, idle: 0, problems: 0 };
  for (const village of scheduler.dueVillages(config)) {
    summary.villages += 1;
    await scheduler.runVillage(config, village, summary);
  }
  assert.deepStrictEqual(besucht.sort(), ['a', 'b', 'c']);
  assert.strictEqual(summary.built, 3);
});

test('Probleme bekommen eine eigene Zeile, der Rest nur die Zusammenfassung', () => {
  const { scheduler, logs } = makeScheduler({ villages: {} });
  const summary = { villages: 1, built: 0, trained: 0, farmed: 0, observed: 0, waiting: 0, saving: 0, done: 0, idle: 0, problems: 0 };
  scheduler.account(summary, 'build', { ok: true, waiting: true, reason: 'Rohstoffe fehlen' }, 'Dorf A');
  assert.strictEqual(logs.length, 0);
  scheduler.account(summary, 'troops', { ok: false, reason: 'Seite nicht lesbar' }, 'Dorf A');
  assert.deepStrictEqual(logs, [['warn', 'Dorf A Truppen: Seite nicht lesbar']]);
});

test('die Zusammenfassung fasst einen Durchlauf in einer Zeile zusammen', () => {
  assert.strictEqual(
    summaryText({ villages: 6, built: 1, trained: 2, farmed: 1, observed: 0, waiting: 2, saving: 1, done: 0, idle: 0, problems: 0 }),
    'Durchlauf: 6 Doerfer geprueft, 1 Ausbau, 2 Rekrutierungen, 1 Farmangriff, 2 warten auf Rohstoffe, 1 wegen Vorrang zurueckgestellt'
  );
  assert.strictEqual(
    summaryText({ villages: 1, built: 0, trained: 0, farmed: 0, observed: 0, waiting: 0, saving: 0, done: 0, idle: 1, problems: 0 }),
    'Durchlauf: 1 Dorf geprueft, nichts zu tun'
  );
});
