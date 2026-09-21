'use strict';

const { BUILDING_BY_KEY } = require('../../shared/constants');

// Dorfmanager. Arbeitet die Bauvorlage strikt von oben nach unten ab und
// beruecksichtigt dabei, was bereits in der Bauschleife steht.
async function runBuildJob({ bridge, store, logger, village }) {
  const config = store.get();
  const template = config.buildTemplates[village.buildTemplate];
  if (!template || !template.length) {
    return { ok: false, skipped: true, reason: 'Keine Bauvorlage zugewiesen' };
  }

  const state = await bridge.readBuild(village.id);
  if (!state || !state.ok) {
    return { ok: false, reason: state ? state.error : 'Bauseite nicht lesbar' };
  }

  // Die Stufen merken, der Truppenmanager braucht sie, um zu wissen, welche
  // Rekrutierungsgebaeude im Dorf ueberhaupt stehen.
  village.levels = state.levels;
  store.save();

  // Ohne Premium nimmt das Spiel hoechstens zwei Auftraege an. Mehr zu planen
  // brächte nichts und würde nur unnötige Klicks erzeugen.
  const limit = config.automation.premium ? 5 : 2;
  const keepFilled = Math.min(Number(config.automation.keepQueueFilled) || 2, limit);
  if (state.queueLength >= keepFilled) {
    return { ok: true, skipped: true, reason: `Bauschleife bereits mit ${state.queueLength} Auftraegen gefuellt` };
  }

  const effective = effectiveLevels(state);
  const next = nextOrder(template, effective);
  if (!next) {
    return { ok: true, done: true, reason: 'Bauvorlage vollstaendig abgearbeitet' };
  }

  const label = BUILDING_BY_KEY[next.key] ? BUILDING_BY_KEY[next.key].name : next.key;
  if (!state.buildable[next.key]) {
    const hint = (state.blocked || {})[next.key];
    return {
      ok: true,
      skipped: true,
      reason: hint
        ? `${label} Stufe ${next.level} wartet: ${hint}`
        : `${label} Stufe ${next.level} noch nicht moeglich, es fehlen Rohstoffe oder Voraussetzungen`
    };
  }

  const result = await bridge.upgrade(village.id, next.key);
  if (result && result.observed) {
    logger.info(`${village.name || village.id}: wuerde ${label} auf Stufe ${result.target} in Auftrag geben`);
    return { ok: true, observed: true, building: next.key, level: result.target };
  }
  if (result && result.ok) {
    logger.action(`${village.name || village.id}: ${label} auf Stufe ${result.target} in Auftrag gegeben`);
    return { ok: true, acted: true, building: next.key, level: result.target };
  }
  return { ok: false, reason: result ? result.error : 'Ausbau fehlgeschlagen' };
}

// Stufen inklusive der Auftraege, die schon in der Bauschleife stehen.
// Die Spielseite fuehrt je Gebaeude mit, wie viele Auftraege laufen. Das ist
// die verlaessliche Quelle. Nur wenn sie fehlt, werden die Zeilen der
// Bauschleife ueber ihre Beschriftung zugeordnet.
function effectiveLevels(state) {
  const levels = { ...state.levels };
  const orders = state.orders || {};
  if (Object.keys(orders).length) {
    for (const [key, count] of Object.entries(orders)) {
      levels[key] = (levels[key] || 0) + Number(count);
    }
    return levels;
  }
  const names = state.names || {};
  for (const entry of state.queue || []) {
    const key = matchBuilding(entry, names);
    if (key) levels[key] = (levels[key] || 0) + 1;
  }
  return levels;
}

function matchBuilding(queueLabel, names) {
  const label = queueLabel.toLowerCase();
  let best = null;
  for (const [key, name] of Object.entries(names)) {
    if (!name) continue;
    if (label.includes(name.toLowerCase()) && (!best || name.length > names[best].length)) best = key;
  }
  return best;
}

function nextOrder(template, levels) {
  for (const [key, target] of template) {
    if ((levels[key] || 0) < target) {
      return { key, level: (levels[key] || 0) + 1, target };
    }
  }
  return null;
}

module.exports = { runBuildJob, effectiveLevels, nextOrder, matchBuilding };
