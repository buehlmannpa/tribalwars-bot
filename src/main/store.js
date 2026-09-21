'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { BUILD_TEMPLATES, TROOP_TEMPLATES } = require('../shared/templates');

// Alles bleibt lokal im Benutzerordner der App. Es verlaesst den Laptop nie.
// Die Doerfer sind bereits eingetragen, so wie sie am 21. September 2026 in
// der Dorfuebersicht standen. Beim Einlesen werden Name und Koordinaten
// aufgefrischt, die Zuweisungen bleiben bestehen.
const VILLAGES = [
  ['2201', '-001-', '545|520', 'Defensiv', 'Defensiv voll'],
  ['2283', '-002-', '545|521', 'Defensiv', 'Defensiv voll'],
  ['2347', '-003-', '546|522', 'Offensiv', 'Offensiv voll'],
  ['2312', '-004-', '547|520', 'Defensiv', 'Defensiv voll'],
  ['1990', '-005-', '543|520', 'Defensiv', 'Defensiv voll'],
  ['2153', '-006-', '543|521', 'Offensiv', 'Offensiv voll']
];

const seededVillages = () => Object.fromEntries(VILLAGES.map(([id, name, coords, build, troop]) => [id, {
  id, name, coords,
  buildTemplate: build,
  troopTemplate: troop,
  buildActive: true,
  troopActive: true,
  lastRun: 0,
  note: ''
}]));

const DEFAULTS = {
  world: {
    host: 'https://ch96.staemme.ch',
    label: 'Welt 96 Schweiz'
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
  villages: seededVillages(),
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
