'use strict';

// Das Protokoll buendelt gleiche Meldungen und raeumt alte Dateien weg.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Logger } = require('../src/main/logger');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'staemme-log-'));
}

test('gleiche Meldungen werden gebuendelt statt wiederholt', () => {
  const logger = new Logger({ dir: tempDir() });
  logger.info('Durchlauf: 6 Doerfer geprueft, nichts zu tun');
  logger.info('Durchlauf: 6 Doerfer geprueft, nichts zu tun');
  logger.info('Durchlauf: 6 Doerfer geprueft, nichts zu tun');
  const eintraege = logger.history();
  assert.strictEqual(eintraege.length, 1);
  assert.strictEqual(eintraege[0].count, 3);
  assert.ok(eintraege[0].ts >= eintraege[0].firstTs);
});

test('die gebuendelte Zeile behaelt ihre Kennung', () => {
  const logger = new Logger({ dir: tempDir() });
  const gesehen = [];
  logger.onEntry((entry) => gesehen.push(entry.id));
  const erste = logger.info('gleiche Meldung');
  logger.info('gleiche Meldung');
  assert.deepStrictEqual(gesehen, [erste.id, erste.id]);
});

test('verschiedene Stufen werden nicht zusammengelegt', () => {
  const logger = new Logger({ dir: tempDir() });
  logger.info('Meldung');
  logger.warn('Meldung');
  assert.strictEqual(logger.history().length, 2);
});

test('nach der Buendelzeit beginnt eine neue Zeile', () => {
  const logger = new Logger({ dir: tempDir(), bundleWindowMs: 0 });
  logger.info('Meldung');
  logger.info('Meldung');
  assert.strictEqual(logger.history().length, 2);
});

test('eine dazwischen liegende Meldung verhindert das Buendeln nicht', () => {
  const logger = new Logger({ dir: tempDir() });
  logger.info('A');
  logger.info('B');
  logger.info('A');
  const eintraege = logger.history();
  assert.strictEqual(eintraege.length, 2);
  assert.strictEqual(eintraege[eintraege.length - 1].message, 'A');
  assert.strictEqual(eintraege[eintraege.length - 1].count, 2);
});

test('Protokolldateien werden je Tag gefuehrt', () => {
  const dir = tempDir();
  const logger = new Logger({ dir });
  logger.info('Eintrag');
  const datei = logger.file();
  assert.ok(fs.existsSync(datei), 'Tagesdatei fehlt');
  assert.match(path.basename(datei), /^aktivitaet-\d{4}-\d{2}-\d{2}\.log$/);
  assert.match(fs.readFileSync(datei, 'utf8'), /\[info\] Eintrag/);
});

test('Protokolle aelter als die Aufbewahrungszeit werden geloescht', () => {
  const dir = tempDir();
  const ordner = path.join(dir, 'protokoll');
  fs.mkdirSync(ordner, { recursive: true });
  const tag = (versatz) => new Date(Date.now() - versatz * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const alt = `aktivitaet-${tag(9)}.log`;
  const frisch = `aktivitaet-${tag(2)}.log`;
  fs.writeFileSync(path.join(ordner, alt), 'alt\n');
  fs.writeFileSync(path.join(ordner, frisch), 'frisch\n');

  const logger = new Logger({ dir, retentionDays: 5 });
  assert.strictEqual(fs.existsSync(path.join(ordner, alt)), false, 'alte Datei blieb liegen');
  assert.strictEqual(fs.existsSync(path.join(ordner, frisch)), true, 'frische Datei wurde geloescht');
  assert.ok(logger.retentionDays === 5);
});

test('alte Zeilen verschwinden auch aus der Anzeige', () => {
  const logger = new Logger({ dir: tempDir(), retentionDays: 5 });
  logger.entries.push({ id: 0, ts: Date.now() - 6 * 24 * 3600 * 1000, firstTs: 0, level: 'info', message: 'uralt', meta: null, count: 1 });
  logger.entries.push({ id: 1, ts: Date.now(), firstTs: Date.now(), level: 'info', message: 'frisch', meta: null, count: 1 });
  const eintraege = logger.history();
  assert.deepStrictEqual(eintraege.map((e) => e.message), ['frisch']);
});
