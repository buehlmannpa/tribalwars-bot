'use strict';

// Trockenlauf ohne Spiel und ohne Browser. Eine einfache Nachbildung eines
// Dorfes liefert genau die Werte, die sonst aus der Spielseite kommen.
// Damit laesst sich pruefen, ob Dorfmanager und Truppenmanager richtig
// entscheiden, bevor die App je eine echte Welt beruehrt.

const { runBuildJob } = require('../src/main/jobs/buildJob');
const { runTrainJob } = require('../src/main/jobs/trainJob');
const { BUILDING_BY_KEY, UNIT_BY_KEY } = require('../src/shared/constants');
const { BUILD_TEMPLATES, TROOP_TEMPLATES } = require('../src/shared/templates');

const BASE_COST = { main: [90, 80, 70], wood: [50, 60, 40], stone: [65, 50, 40], iron: [75, 65, 70],
  farm: [45, 40, 30], storage: [60, 50, 40], barracks: [200, 170, 90], smith: [220, 180, 240],
  market: [100, 100, 100], stable: [270, 240, 260], garage: [300, 240, 260], wall: [50, 100, 20],
  snob: [15000, 25000, 10000], hide: [50, 60, 50], place: [10, 40, 30], statue: [220, 220, 220],
  watchtower: [800, 900, 1000], church: [1000, 1000, 1000] };

const UNIT_COST = { spear: [50, 30, 10], sword: [30, 30, 70], axe: [60, 30, 40], archer: [100, 30, 60],
  spy: [50, 50, 20], light: [125, 100, 250], marcher: [250, 100, 150], heavy: [200, 150, 600],
  ram: [300, 200, 200], catapult: [320, 400, 100] };

class SimulatedVillage {
  constructor(name) {
    this.name = name;
    this.levels = { main: 3, wood: 2, stone: 2, iron: 2, farm: 2, storage: 2, place: 1, hide: 0 };
    this.queue = [];
    this.units = {};
    this.trainQueue = [];
    this.res = { wood: 800, stone: 800, iron: 800 };
    this.minute = 0;
  }

  get storage() { return Math.round(1000 * Math.pow(1.2294934, this.levels.storage)); }
  get popMax() { return Math.round(240 * Math.pow(1.172103, this.levels.farm - 1)); }
  get pop() {
    let used = Object.values(this.levels).reduce((sum, lvl) => sum + lvl * 2, 0);
    for (const [unit, count] of Object.entries(this.units)) {
      used += count * (UNIT_BY_KEY[unit] ? UNIT_BY_KEY[unit].pop : 1);
    }
    return used;
  }

  // Eine Minute Spielzeit: Rohstoffe wachsen, Auftraege laufen ab.
  tick() {
    this.minute += 1;
    const rate = (level) => Math.round(30 * Math.pow(1.163118, level) / 60);
    this.res.wood = Math.min(this.storage, this.res.wood + rate(this.levels.wood));
    this.res.stone = Math.min(this.storage, this.res.stone + rate(this.levels.stone));
    this.res.iron = Math.min(this.storage, this.res.iron + rate(this.levels.iron));
    for (const order of [...this.queue]) {
      order.remaining -= 1;
      if (order.remaining <= 0) {
        this.levels[order.key] = order.level;
        this.queue.splice(this.queue.indexOf(order), 1);
      }
    }
    for (const order of [...this.trainQueue]) {
      order.remaining -= 1;
      if (order.remaining <= 0) {
        this.units[order.unit] = (this.units[order.unit] || 0) + order.amount;
        this.trainQueue.splice(this.trainQueue.indexOf(order), 1);
      }
    }
  }

  cost(key, level) {
    const base = BASE_COST[key] || [100, 100, 100];
    const factor = Math.pow(1.26, level - 1);
    return { wood: Math.round(base[0] * factor), stone: Math.round(base[1] * factor), iron: Math.round(base[2] * factor) };
  }

  canPay(cost) {
    return this.res.wood >= cost.wood && this.res.stone >= cost.stone && this.res.iron >= cost.iron;
  }

  pay(cost) {
    this.res.wood -= cost.wood; this.res.stone -= cost.stone; this.res.iron -= cost.iron;
  }
}

// Nachbildung der Bruecke. Liefert dieselbe Form von Daten wie die echte Seite.
class SimulatedBridge {
  constructor(village) { this.v = village; }

  async readBuild() {
    const buildable = {};
    const names = {};
    for (const key of Object.keys(this.v.levels)) {
      names[key] = BUILDING_BY_KEY[key] ? BUILDING_BY_KEY[key].name : key;
      const next = this.v.levels[key] + 1;
      if (this.v.canPay(this.v.cost(key, next))) buildable[key] = next;
    }
    for (const key of Object.keys(BASE_COST)) {
      if (this.v.levels[key] === undefined) this.v.levels[key] = 0;
      names[key] = BUILDING_BY_KEY[key] ? BUILDING_BY_KEY[key].name : key;
      if (!buildable[key] && this.v.canPay(this.v.cost(key, this.v.levels[key] + 1))) {
        buildable[key] = this.v.levels[key] + 1;
      }
    }
    return {
      ok: true,
      levels: { ...this.v.levels },
      names,
      queue: this.v.queue.map((o) => `${names[o.key]} Stufe ${o.level}`),
      queueLength: this.v.queue.length,
      buildable,
      resources: { ...this.v.res, storage: this.v.storage }
    };
  }

  async upgrade(_id, key) {
    const level = this.v.levels[key] + 1 + this.v.queue.filter((o) => o.key === key).length;
    const cost = this.v.cost(key, level);
    if (!this.v.canPay(cost)) return { ok: false, error: 'Rohstoffe reichen nicht' };
    this.v.pay(cost);
    this.v.queue.push({ key, level, remaining: Math.max(2, Math.round(level * 3.5)) });
    return { ok: true, building: key, target: level };
  }

  async readTrain(_id, buildingKey) {
    const units = {};
    for (const [unit, cost] of Object.entries(UNIT_COST)) {
      if (buildingKey && UNIT_BY_KEY[unit] && UNIT_BY_KEY[unit].building !== buildingKey) continue;
      const affordable = Math.min(
        Math.floor(this.v.res.wood / cost[0]),
        Math.floor(this.v.res.stone / cost[1]),
        Math.floor(this.v.res.iron / cost[2])
      );
      const meta = UNIT_BY_KEY[unit];
      const building = meta ? meta.building : 'barracks';
      units[unit] = {
        pop: UNIT_BY_KEY[unit] ? UNIT_BY_KEY[unit].pop : 1,
        present: this.v.units[unit] || 0,
        total: this.v.units[unit] || 0,
        max: affordable,
        disabled: (this.v.levels[building] || 0) === 0
      };
    }
    return {
      ok: true, units,
      queueLength: this.v.trainQueue.length,
      pop: this.v.pop, popMax: this.v.popMax,
      resources: { ...this.v.res }
    };
  }

  async train(_id, orders) {
    const [unit, amount] = Object.entries(orders)[0];
    const cost = UNIT_COST[unit];
    const total = { wood: cost[0] * amount, stone: cost[1] * amount, iron: cost[2] * amount };
    if (!this.v.canPay(total)) return { ok: false, error: 'Rohstoffe reichen nicht' };
    this.v.pay(total);
    this.v.trainQueue.push({ unit, amount, remaining: Math.max(2, amount) });
    return { ok: true, ordered: orders };
  }
}

async function main() {
  const minutes = Number(process.argv[2]) || 600;
  const village = new SimulatedVillage('Testdorf');
  const bridge = new SimulatedBridge(village);
  const logger = {
    lines: [],
    action(msg) { this.lines.push(`[${String(village.minute).padStart(4)} min] ${msg}`); console.log(`[${String(village.minute).padStart(4)} min] AKTION  ${msg}`); },
    info() {}, warn() {}, error(msg) { console.log('FEHLER ', msg); }
  };
  const store = {
    data: {
      automation: {
        keepQueueFilled: 2,
        farmBuffer: 0,
        minRecruitBatch: 10,
        resourceBuffer: { wood: 0, stone: 0, iron: 0 }
      },
      buildTemplates: BUILD_TEMPLATES,
      troopTemplates: TROOP_TEMPLATES
    },
    get() { return this.data; },
    save() {}
  };
  const config = { id: '1', name: 'Testdorf', buildTemplate: 'Offensiv', troopTemplate: 'Frueh Farmen' };

  console.log(`Trockenlauf ueber ${minutes} Minuten Spielzeit, Vorlagen Offensiv und Frueh Farmen, Vorrang ${process.argv[3] || 'build'}\n`);
  const priority = process.argv[3] || 'build';
  for (let i = 0; i < minutes; i++) {
    village.tick();
    if (i % 10 === 0) {
      const jobs = priority === 'troops' ? ['troops', 'build'] : ['build', 'troops'];
      let saving = false;
      for (const job of jobs) {
        if (job === 'build') {
          if (saving) continue;
          await runBuildJob({ bridge, store, logger, village: config });
        } else {
          const result = await runTrainJob({ bridge, store, logger, village: config });
          if (result && result.waiting && priority === 'troops') saving = true;
        }
      }
    }
  }

  console.log('\nErgebnis nach der Laufzeit');
  const levels = Object.entries(village.levels).filter(([, l]) => l > 0)
    .map(([k, l]) => `${BUILDING_BY_KEY[k] ? BUILDING_BY_KEY[k].name : k} ${l}`);
  console.log('  Gebaeude   ', levels.join(', '));
  console.log('  Truppen    ', Object.entries(village.units).map(([u, c]) => `${u} ${c}`).join(', ') || 'keine');
  console.log('  Rohstoffe  ', `Holz ${village.res.wood}, Lehm ${village.res.stone}, Eisen ${village.res.iron} von ${village.storage}`);
  console.log('  Bauernhof  ', `${village.pop} von ${village.popMax}`);
  console.log('  Aktionen   ', logger.lines.length);
}

main();
