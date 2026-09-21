'use strict';

const { UNIT_BY_KEY } = require('../../shared/constants');

// Truppenmanager. Rekrutiert in Paketen und haelt die Einheiten der Vorlage
// auf annaehernd gleichem Fortschritt, so wie es der offizielle Manager tut.
async function runTrainJob({ bridge, store, logger, village }) {
  const config = store.get();
  const template = config.troopTemplates[village.troopTemplate];
  if (!template || !Object.keys(template).length) {
    return { ok: false, skipped: true, reason: 'Keine Truppenvorlage zugewiesen' };
  }

  const state = await bridge.readTrain(village.id);
  if (!state || !state.ok) {
    return { ok: false, reason: state ? state.error : 'Rekrutierungsseite nicht lesbar' };
  }

  const farmBuffer = Number(config.automation.farmBuffer) || 0;
  const freePop = state.popMax - state.pop - farmBuffer;
  if (freePop <= 0) {
    return { ok: true, skipped: true, reason: 'Keine freien Bauernhofplaetze mehr, Puffer beruecksichtigt' };
  }

  const order = chooseOrder({ template, state, freePop });
  if (!order) {
    return { ok: true, done: true, reason: 'Zielbestand erreicht oder nichts rekrutierbar' };
  }

  const result = await bridge.train(village.id, { [order.unit]: order.amount });
  if (result && result.ok) {
    const label = UNIT_BY_KEY[order.unit] ? UNIT_BY_KEY[order.unit].name : order.unit;
    logger.action(`${village.name || village.id}: ${order.amount} ${label} in Auftrag gegeben`);
    return { ok: true, acted: true, unit: order.unit, amount: order.amount };
  }
  return { ok: false, reason: result ? result.error : 'Rekrutierung fehlgeschlagen' };
}

// Waehlt die Einheit mit dem geringsten Fortschritt und ein passendes Paket.
function chooseOrder({ template, state, freePop }) {
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
    const pop = meta && meta.pop ? meta.pop : 1;
    let amount = Math.min(missing, packet, Math.floor(freePop / pop));
    if (Number.isFinite(info.max) && info.max !== null) amount = Math.min(amount, info.max);
    if (amount <= 0) continue;
    candidates.push({ unit, amount, progress: present / target });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.progress - b.progress);
  return candidates[0];
}

module.exports = { runTrainJob, chooseOrder };
