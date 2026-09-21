'use strict';

// Bauvorlagen sind Listen von Auftraegen. Jeder Auftrag nennt ein Gebaeude und
// die Stufe, die nach dem Auftrag erreicht sein soll. Der Dorfmanager arbeitet
// die Liste strikt von oben nach unten ab, genau wie die Bauschleife im Spiel.
const BUILD_TEMPLATES = {
  Rohstoffe: [
    ['main', 3], ['wood', 3], ['stone', 3], ['iron', 3], ['farm', 3],
    ['storage', 3], ['wood', 6], ['stone', 6], ['iron', 6], ['main', 5],
    ['farm', 5], ['storage', 6], ['wood', 10], ['stone', 10], ['iron', 10],
    ['farm', 8], ['storage', 10], ['market', 5], ['main', 10],
    ['wood', 15], ['stone', 15], ['iron', 15], ['farm', 12], ['storage', 15],
    ['wood', 20], ['stone', 20], ['iron', 20], ['farm', 16], ['storage', 20],
    ['main', 15], ['wood', 25], ['stone', 25], ['iron', 25], ['farm', 20],
    ['storage', 25], ['wood', 30], ['stone', 30], ['iron', 30], ['farm', 25],
    ['storage', 30], ['main', 20], ['market', 10]
  ],
  Offensiv: [
    ['main', 3], ['wood', 3], ['stone', 3], ['iron', 3], ['farm', 3],
    ['storage', 3], ['barracks', 1], ['wood', 6], ['stone', 6], ['iron', 6],
    ['main', 5], ['farm', 5], ['storage', 6], ['barracks', 3],
    ['wood', 10], ['stone', 10], ['iron', 10], ['farm', 8], ['storage', 10],
    ['smith', 3], ['market', 3], ['main', 10], ['barracks', 6],
    ['wood', 15], ['stone', 15], ['iron', 15], ['farm', 12], ['storage', 15],
    ['stable', 3], ['smith', 5], ['main', 15], ['barracks', 10],
    ['wood', 20], ['stone', 20], ['iron', 20], ['farm', 16], ['storage', 20],
    ['stable', 5], ['smith', 10], ['garage', 2], ['main', 20],
    ['wood', 25], ['stone', 25], ['iron', 25], ['farm', 20], ['storage', 25],
    ['barracks', 15], ['stable', 10], ['smith', 15], ['garage', 5],
    ['wood', 30], ['stone', 30], ['iron', 30], ['farm', 25], ['storage', 30],
    ['smith', 20], ['barracks', 20], ['stable', 15], ['garage', 10],
    ['main', 25], ['market', 10], ['farm', 30], ['snob', 1]
  ],
  Defensiv: [
    ['main', 3], ['wood', 3], ['stone', 3], ['iron', 3], ['farm', 3],
    ['storage', 3], ['barracks', 1], ['wood', 6], ['stone', 6], ['iron', 6],
    ['main', 5], ['farm', 5], ['storage', 6], ['barracks', 3],
    ['wood', 10], ['stone', 10], ['iron', 10], ['farm', 8], ['storage', 10],
    ['smith', 3], ['market', 3], ['main', 10], ['barracks', 6], ['wall', 5],
    ['wood', 15], ['stone', 15], ['iron', 15], ['farm', 12], ['storage', 15],
    ['smith', 5], ['main', 15], ['barracks', 10], ['wall', 10],
    ['wood', 20], ['stone', 20], ['iron', 20], ['farm', 16], ['storage', 20],
    ['stable', 5], ['smith', 10], ['wall', 15],
    ['wood', 25], ['stone', 25], ['iron', 25], ['farm', 20], ['storage', 25],
    ['barracks', 15], ['smith', 15], ['wall', 20],
    ['wood', 30], ['stone', 30], ['iron', 30], ['farm', 25], ['storage', 30],
    ['smith', 20], ['barracks', 20], ['stable', 10], ['main', 20],
    ['market', 10], ['farm', 30]
  ]
};

// Truppenvorlagen nennen den Zielbestand, der am Ende im Dorf stehen soll.
const TROOP_TEMPLATES = {
  'Offensiv voll': { axe: 7000, light: 3000, ram: 300, catapult: 200, spy: 50 },
  'Defensiv voll': { spear: 7000, sword: 7000, heavy: 1000, spy: 50 },
  'Frueh Farmen': { spear: 500, light: 250, spy: 20 }
};

module.exports = { BUILD_TEMPLATES, TROOP_TEMPLATES };
