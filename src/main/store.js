'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { BUILD_TEMPLATES, TROOP_TEMPLATES } = require('../shared/templates');

// Alles bleibt lokal im Benutzerordner der App. Es verlaesst den Laptop nie.
const DEFAULTS = {
  // Die Welt wird beim ersten Anmelden aus dem Spielfenster uebernommen.
  // Bis dahin zeigt das Fenster die Startseite, auf der du deine Welt waehlst.
  world: {
    host: 'https://www.staemme.ch',
    label: 'noch keine Welt gewaehlt'
  },
  automation: {
    enabled: false,
    // Beim ersten Start wird nur beobachtet. Die App liest alles und schreibt
    // ins Protokoll, was sie tun wuerde, klickt aber nichts im Spiel.
    observeOnly: true,
    // Ohne Premium nimmt das Spiel hoechstens zwei Bauauftraege an.
    premium: false,
    minDelaySeconds: 45,
    maxDelaySeconds: 180,
    maxActionsPerHour: 60,
    villageCooldownMinutes: 12,
    keepQueueFilled: 2,
    priority: 'build',
    resourceBuffer: { wood: 0, stone: 0, iron: 0 },
    minRecruitBatch: 10,
    farmBuffer: 0,
    nightPause: { enabled: false, startHour: 23, endHour: 8 },
    pauseOnIncoming: true,
    keepAwake: true,
    notifications: { captcha: true, login: true, incoming: true }
  },
  villages: {},
  buildTemplates: BUILD_TEMPLATES,
  troopTemplates: TROOP_TEMPLATES
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'config.json');
    this.data = this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return mergeDeep(structuredClone(DEFAULTS), raw);
    } catch (err) {
      return structuredClone(DEFAULTS);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    return this.data;
  }

  get() {
    return this.data;
  }

  patch(partial) {
    this.data = mergeDeep(this.data, partial);
    return this.save();
  }

  // Ein Dorf traegt seine Zuweisungen und den Fortschritt der Bauschleife.
  village(id) {
    if (!this.data.villages[id]) {
      this.data.villages[id] = {
        id: String(id),
        name: '',
        coords: '',
        buildTemplate: null,
        troopTemplate: null,
        buildActive: false,
        troopActive: false,
        lastRun: 0,
        note: ''
      };
    }
    return this.data.villages[id];
  }
}

function mergeDeep(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      base[key] = mergeDeep(base[key] && typeof base[key] === 'object' ? base[key] : {}, value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

module.exports = { Store, DEFAULTS };
