'use strict';

const { UNITS, UNIT_BY_KEY } = require('../../shared/constants');
const { distance, travelMinutes, slowestSpeed, carryCapacity } = require('../../shared/geo');

const UNIT_KEYS = UNITS.map((unit) => unit.key);

// Farmassistent. Greift Barbarendoerfer im eingestellten Umkreis an, immer mit
// derselben eingestellten Truppenzahl, und merkt sich, wann ein Ziel zuletzt
// an der Reihe war.
async function runFarmJob({ bridge, store, logger, village, world }) {
  const config = store.get();
  const farm = config.farm || {};
  if (!farm.enabled) return { ok: true, skipped: true, reason: 'Farmassistent ist aus' };
  if (!village.farmActive) return { ok: true, skipped: true, reason: 'Farmen fuer dieses Dorf ist aus' };

  const troops = cleanTroops(farm.troops);
  if (!Object.keys(troops).length) {
    return { ok: true, skipped: true, reason: 'Keine Truppen fuer das Farmen eingestellt' };
  }

  const origin = parseCoords(village.coords);
  if (!origin) return { ok: true, skipped: true, reason: 'Dorf noch nicht eingelesen' };

  const ready = await world.ensure();
  if (!ready.ok) return { ok: false, reason: `Weltdaten fehlen: ${ready.error}` };

  // Frischer Blick ins Dorf: welche Truppen stehen daheim und wie viele
  // Befehle laufen bereits.
  const detail = await bridge.scanVillage(village.id);
  if (detail && detail.ok) {
    village.unitsHome = detail.unitsHome;
    village.units = detail.units;
    village.levels = detail.levels;
    village.resources = detail.resources;
    village.pop = detail.pop;
    village.popMax = detail.popMax;
    village.scannedAt = Date.now();
    store.save();
  }

  const plan = planFarmRun({
    origin,
    troops,
    units: world.units || {},
    unitSpeed: Number(farm.unitSpeed || world.unitSpeed || 1),
    maxHours: Number(farm.maxHours) || 2,
    minMinutes: Number(farm.minMinutesBetweenAttacks) || 120,
    history: farm.history || {},
    barbarians: world.barbarians(),
    home: village.unitsHome || {},
    now: Date.now()
  });

  if (!plan.target) return { ok: true, skipped: true, reason: plan.reason };

  const result = await bridge.sendAttack(
    village.id, plan.target, troops, UNIT_KEYS,
    detail && detail.ok ? Number(detail.commands) : undefined
  );
  const label = `${plan.target.x}|${plan.target.y}`;
  const minutes = Math.round(plan.minutes);

  if (result && result.observed) {
    logger.info(`[nur beobachtet, nichts geklickt] ${village.name || village.id}: wuerde ${describe(troops)} auf Barbarendorf ${label} schicken, Laufzeit ${minutes} Minuten`);
    return { ok: true, observed: true, target: plan.target };
  }
  if (result && result.ok) {
    farm.history = farm.history || {};
    farm.history[plan.target.id] = Date.now();
    store.save();
    logger.action(`${village.name || village.id}: ${describe(troops)} auf Barbarendorf ${label} geschickt, Laufzeit ${minutes} Minuten, Tragkraft ${plan.carry}`);
    return { ok: true, acted: true, target: plan.target };
  }
  return { ok: false, reason: result ? result.error : 'Angriff fehlgeschlagen' };
}

// Die Auswahl des naechsten Ziels, ohne Spiel und ohne Netz.
function planFarmRun({ origin, troops, units, unitSpeed, maxHours, minMinutes, history, barbarians, home, now }) {
  const speeds = Object.fromEntries(Object.entries(units).map(([key, info]) => [key, info.speed]));
  const carry = Object.fromEntries(Object.entries(units).map(([key, info]) => [key, info.carry]));
  const slowest = slowestSpeed(troops, speeds);
  if (!slowest) return { target: null, reason: 'Geschwindigkeit der Einheiten ist unbekannt' };

  // Reichen die Truppen daheim ueberhaupt aus.
  const fehlend = Object.entries(troops).filter(([unit, amount]) => Number(home[unit] || 0) < amount);
  if (fehlend.length) {
    const namen = fehlend.map(([unit]) => (UNIT_BY_KEY[unit] ? UNIT_BY_KEY[unit].name : unit)).join(', ');
    return { target: null, reason: `Zu wenige Truppen daheim: ${namen}` };
  }

  const maxFields = (maxHours * 60) / (slowest * unitSpeed);
  let nearest = null;
  let gesperrt = 0;
  for (const village of barbarians) {
    const fields = distance(origin, village);
    if (fields <= 0 || fields > maxFields) continue;
    const last = Number(history[village.id] || 0);
    if (last && now - last < minMinutes * 60 * 1000) { gesperrt += 1; continue; }
    if (!nearest || fields < nearest.fields) nearest = { village, fields };
  }

  if (!nearest) {
    return {
      target: null,
      reason: gesperrt
        ? `Alle ${gesperrt} Ziele im Umkreis sind noch in der Wartezeit`
        : `Kein Barbarendorf innerhalb von ${maxHours} Stunden`
    };
  }

  return {
    target: nearest.village,
    fields: nearest.fields,
    minutes: travelMinutes(nearest.fields, slowest, unitSpeed),
    carry: carryCapacity(troops, carry)
  };
}

function cleanTroops(troops) {
  const out = {};
  for (const [unit, amount] of Object.entries(troops || {})) {
    if (UNIT_BY_KEY[unit] && Number(amount) > 0) out[unit] = Number(amount);
  }
  return out;
}

function parseCoords(text) {
  const match = /(\d+)\|(\d+)/.exec(String(text || ''));
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function describe(troops) {
  return Object.entries(troops)
    .map(([unit, amount]) => `${amount} ${UNIT_BY_KEY[unit] ? UNIT_BY_KEY[unit].name : unit}`)
    .join(', ');
}

module.exports = { runFarmJob, planFarmRun, cleanTroops, parseCoords };
