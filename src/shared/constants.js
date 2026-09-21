'use strict';

// Gebaeude Schluessel so, wie sie das Spiel intern verwendet.
const BUILDINGS = [
  { key: 'main', name: 'Hauptgebaeude', max: 30 },
  { key: 'barracks', name: 'Kaserne', max: 25 },
  { key: 'stable', name: 'Stall', max: 20 },
  { key: 'garage', name: 'Werkstatt', max: 15 },
  { key: 'church', name: 'Kirche', max: 3 },
  { key: 'snob', name: 'Adelshof', max: 1 },
  { key: 'smith', name: 'Schmiede', max: 20 },
  { key: 'place', name: 'Versammlungsplatz', max: 1 },
  { key: 'statue', name: 'Statue', max: 1 },
  { key: 'market', name: 'Marktplatz', max: 25 },
  { key: 'wood', name: 'Holzfaeller', max: 30 },
  { key: 'stone', name: 'Lehmgrube', max: 30 },
  { key: 'iron', name: 'Eisenmine', max: 30 },
  { key: 'farm', name: 'Bauernhof', max: 30 },
  { key: 'storage', name: 'Speicher', max: 30 },
  { key: 'hide', name: 'Versteck', max: 10 },
  { key: 'wall', name: 'Wall', max: 20 },
  { key: 'watchtower', name: 'Wachturm', max: 20 }
];

// Einheiten in der Reihenfolge, in der sie im Spiel erscheinen.
const UNITS = [
  { key: 'spear', name: 'Speertraeger', building: 'barracks', packet: 50, pop: 1 },
  { key: 'sword', name: 'Schwertkaempfer', building: 'barracks', packet: 50, pop: 1 },
  { key: 'axe', name: 'Axtkaempfer', building: 'barracks', packet: 50, pop: 1 },
  { key: 'archer', name: 'Bogenschuetze', building: 'barracks', packet: 50, pop: 1 },
  { key: 'spy', name: 'Spaeher', building: 'stable', packet: 20, pop: 2 },
  { key: 'light', name: 'Leichte Kavallerie', building: 'stable', packet: 20, pop: 4 },
  { key: 'marcher', name: 'Berittener Bogenschuetze', building: 'stable', packet: 20, pop: 5 },
  { key: 'heavy', name: 'Schwere Kavallerie', building: 'stable', packet: 20, pop: 6 },
  { key: 'ram', name: 'Ramme', building: 'garage', packet: 10, pop: 5 },
  { key: 'catapult', name: 'Katapult', building: 'garage', packet: 10, pop: 8 }
];

const UNIT_BY_KEY = Object.fromEntries(UNITS.map((u) => [u.key, u]));
const BUILDING_BY_KEY = Object.fromEntries(BUILDINGS.map((b) => [b.key, b]));

module.exports = { BUILDINGS, UNITS, UNIT_BY_KEY, BUILDING_BY_KEY };
