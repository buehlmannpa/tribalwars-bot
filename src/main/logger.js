'use strict';

const fs = require('fs');
const path = require('path');

// Protokoll mit Buendelung. Gleiche Meldungen werden nicht immer wieder neu
// geschrieben, sondern bei der vorhandenen Zeile mitgezaehlt. Dazu wird je Tag
// eine Datei gefuehrt, aeltere Dateien werden nach der Aufbewahrungszeit
// geloescht, damit auch ein Dauerbetrieb keinen Speicher frisst.
const BUNDLE_WINDOW_MS = 60 * 60 * 1000;
const BUNDLE_LOOKBACK = 80;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

class Logger {
  constructor(options = {}) {
    this.entries = [];
    this.limit = Number(options.limit) || 500;
    this.retentionDays = Number(options.retentionDays) || 5;
    this.bundleWindowMs = options.bundleWindowMs === undefined ? BUNDLE_WINDOW_MS : Number(options.bundleWindowMs);
    this.listeners = new Set();
    this.dir = options.dir || userDataDir();
    this.nextId = 1;
    this.lastCleanup = 0;
    this.cleanup();
  }

  onEntry(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  write(level, message, meta) {
    const now = Date.now();
    this.prune(now);

    // Buendeln: steht dieselbe Meldung schon kuerzlich im Protokoll, wird sie
    // nur hochgezaehlt und nach vorne geholt.
    const bundled = this.findBundle(level, message, now);
    if (bundled) {
      bundled.count += 1;
      bundled.ts = now;
      const index = this.entries.indexOf(bundled);
      this.entries.splice(index, 1);
      this.entries.push(bundled);
      this.publish(bundled);
      return bundled;
    }

    const entry = { id: this.nextId++, ts: now, firstTs: now, level, message, meta: meta || null, count: 1 };
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.shift();
    this.append(entry);
    this.publish(entry);
    if (now - this.lastCleanup > CLEANUP_INTERVAL_MS) this.cleanup();
    return entry;
  }

  findBundle(level, message, now) {
    if (!this.bundleWindowMs) return null;
    const start = Math.max(0, this.entries.length - BUNDLE_LOOKBACK);
    for (let i = this.entries.length - 1; i >= start; i -= 1) {
      const entry = this.entries[i];
      if (entry.level !== level || entry.message !== message) continue;
      if (now - entry.ts > this.bundleWindowMs) return null;
      return entry;
    }
    return null;
  }

  publish(entry) {
    for (const fn of this.listeners) fn(entry);
  }

  // Zeilen, die aelter als die Aufbewahrungszeit sind, verschwinden auch aus
  // der Anzeige, nicht nur aus den Dateien.
  prune(now = Date.now()) {
    const cutoff = now - this.retentionDays * DAY_MS;
    while (this.entries.length && this.entries[0].ts < cutoff) this.entries.shift();
  }

  file(ts = Date.now()) {
    if (!this.dir) return null;
    const tag = new Date(ts).toISOString().slice(0, 10);
    return path.join(this.dir, 'protokoll', `aktivitaet-${tag}.log`);
  }

  append(entry) {
    const file = this.file(entry.ts);
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, `${new Date(entry.ts).toISOString()} [${entry.level}] ${entry.message}\n`);
    } catch (err) {
      // Das Protokoll darf den Betrieb nie stoppen.
    }
  }

  // Loescht Protokolldateien, die aelter als die Aufbewahrungszeit sind.
  cleanup(now = Date.now()) {
    this.lastCleanup = now;
    if (!this.dir) return [];
    const folder = path.join(this.dir, 'protokoll');
    const cutoff = now - this.retentionDays * DAY_MS;
    const removed = [];
    try {
      // Die frueher genutzte Sammeldatei wird nicht mehr gefuehrt.
      const alt = path.join(this.dir, 'activity.log');
      if (fs.existsSync(alt)) { fs.unlinkSync(alt); removed.push(alt); }
    } catch (err) {
      // nicht weiter schlimm
    }
    let names = [];
    try {
      names = fs.readdirSync(folder);
    } catch (err) {
      return removed;
    }
    for (const name of names) {
      const match = /^aktivitaet-(\d{4})-(\d{2})-(\d{2})\.log$/.exec(name);
      if (!match) continue;
      const tag = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (tag >= cutoff) continue;
      try {
        fs.unlinkSync(path.join(folder, name));
        removed.push(name);
      } catch (err) {
        // nicht weiter schlimm
      }
    }
    return removed;
  }

  info(message, meta) { return this.write('info', message, meta); }
  warn(message, meta) { return this.write('warn', message, meta); }
  error(message, meta) { return this.write('error', message, meta); }
  action(message, meta) { return this.write('action', message, meta); }

  history() {
    this.prune();
    return this.entries.slice(-200);
  }
}

// Im Test laeuft die Datei ohne Electron, dann gibt es keinen Benutzerordner.
function userDataDir() {
  try {
    const { app } = require('electron');
    return app && typeof app.getPath === 'function' ? app.getPath('userData') : null;
  } catch (err) {
    return null;
  }
}

module.exports = { Logger };
