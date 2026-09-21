'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Ringpuffer fuer die Oberflaeche plus eine Datei fuer die Nachschau.
class Logger {
  constructor(limit = 500) {
    this.entries = [];
    this.limit = limit;
    this.listeners = new Set();
    this.file = path.join(app.getPath('userData'), 'activity.log');
  }

  onEntry(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  write(level, message, meta) {
    const entry = { ts: Date.now(), level, message, meta: meta || null };
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.shift();
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${new Date(entry.ts).toISOString()} [${level}] ${message}\n`);
    } catch (err) {
      // Protokoll darf den Betrieb nie stoppen.
    }
    for (const fn of this.listeners) fn(entry);
    return entry;
  }

  info(message, meta) { return this.write('info', message, meta); }
  warn(message, meta) { return this.write('warn', message, meta); }
  error(message, meta) { return this.write('error', message, meta); }
  action(message, meta) { return this.write('action', message, meta); }

  history() {
    return this.entries.slice(-200);
  }
}

module.exports = { Logger };
