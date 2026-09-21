'use strict';

const { UNIT_BY_KEY, BUILDING_BY_KEY } = require('../../shared/constants');

// Truppenmanager. Kaserne, Stall und Werkstatt haben je eine eigene Seite,
// darum wird pro Durchlauf ein Gebaeude besucht und reihum gewechselt.
async function runTrainJob({ bridge, store, logger, village }) {
  const config = store.get();
  const template = config.troopTemplates[village.troopTemplate];
  if (!template || !Object.keys(template).length) {
    return { ok: false, skipped: true, reason: 'Keine Truppenvorlage zugewiesen' };
  }

  const building = pickBuilding(template, village);
  if (!building) {
    return { ok: true, skipped: true, reason: 'Kein passendes Rekrutierungsgebaeude im Dorf' };
  }
  village.lastTrainBuilding = building;
  store.save();

  const label = BUILDING_BY_KEY[building] ? BUILDING_BY_KEY[building].name : building;
  const state = await bridge.readTrain(village.id, building);
  if (!state || !state.ok) {
    return { ok: false, reason: `${label}: ${state ? state.error : 'Seite nicht lesbar'}` };
  }

  const buffer = config.automation.resourceBuffer || {};
  const shortOf = ['wood', 'stone', 'iron'].find((key) => state.resources[key] < (Number(buffer[key]) || 0));
  if (shortOf) {
    return { ok: true, skipped: true, reason: `Rohstoffpuffer noch nicht erreicht, ${shortOf} wird geschont` };
  }

  const farmBuffer = Number(config.automation.farmBuffer) || 0;
  const freePop = state.popMax - state.pop - farmBuffer;
  if (freePop <= 0) {
    return { ok: true, skipped: true, reason: 'Keine freien Bauernhofplaetze mehr, Puffer beruecksichtigt' };
  }

  const minBatch = Number(config.automation.minRecruitBatch) || 1;
  const order = chooseOrder({ template, state, freePop, minBatch });
  if (!order) {
    const stillMissing = Object.entries(template).some(([unit, target]) => {
      const info = state.units[unit];
      if (!info || info.disabled) return false;
      return target - (Number.isFinite(info.present) ? info.present : 0) > 0;
    });
    if (stillMissing) {
      return { ok: true, skipped: true, waiting: true, reason: `${label}: Rohstoffe reichen noch nicht fuer eine sinnvolle Bestellung` };
    }
    return { ok: true, done: true, reason: `${label}: Zielbestand erreicht` };
  }

  const result = await bridge.train(village.id, { [order.unit]: order.amount });
  if (result && result.ok) {
    const unitName = UNIT_BY_KEY[order.unit] ? UNIT_BY_KEY[order.unit].name : order.unit;
    logger.action(`${village.name || village.id}: ${order.amount} ${unitName} in Auftrag gegeben`);
    return { ok: true, acted: true, unit: order.unit, amount: order.amount, building };
  }
  return { ok: false, reason: result ? result.error : 'Rekrutierung fehlgeschlagen' };
}

// Waehlt das naechste Gebaeude reihum und ueberspringt, was im Dorf fehlt.
function pickBuilding(template, village) {
  const wanted = [];
  for (const [unit, target] of Object.entries(template)) {
    if (!target) continue;
    const meta = UNIT_BY_KEY[unit];
    if (!meta || wanted.includes(meta.building)) continue;
    wanted.push(meta.building);
  }
  const levels = village.levels || null;
  const available = levels ? wanted.filter((key) => Number(levels[key] || 0) > 0) : wanted;
  if (!available.length) return null;
  const last = available.indexOf(village.lastTrainBuilding);
  return available[(last + 1) % available.length];
}

// Waehlt die Einheit mit dem geringsten Fortschritt und ein passendes Paket.
function chooseOrder({ template, state, freePop, minBatch = 1 }) {
  const candidates = [];
  for (const [unit, target] of Object.entries(template)) {
    if (!target) continue;
    const info = state.units[unit];
    if (!info || info.disabled) continue;
    const present = Number.isFinite(info.present) ? info.present : 0;
    const missing = target - present;
    if (missing <= 0) continue;
    const meta = UNIT_BY_KEY[unit];
    const packet = meta ? meta.packet : 10;
    const pop = Number(info.pop) || (meta ? meta.pop : 1) || 1;
    const desired = Math.min(missing, packet, Math.floor(freePop / pop));
    if (desired <= 0) continue;
    const affordable = Number.isFinite(info.max) && info.max !== null ? info.max : desired;
    const amount = Math.min(desired, affordable);
    if (amount <= 0) continue;
    // Einzelne Einheiten zu bestellen nimmt dem Bauplan die Rohstoffe weg.
    // Reicht es nicht fuer das gewuenschte Paket, wird erst ab der kleinsten
    // sinnvollen Menge bestellt, sonst wartet der Manager.
    if (amount < desired && amount < minBatch) continue;
    candidates.push({ unit, amount, progress: present / target });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.progress - b.progress);
  return candidates[0];
}

module.exports = { runTrainJob, chooseOrder, pickBuilding };
