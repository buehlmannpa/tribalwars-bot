'use strict';

// Entfernungen und Laufzeiten. Reine Rechnerei, ohne Spiel und ohne Netz,
// damit sie sich sauber pruefen laesst.

// Abstand zweier Doerfer in Feldern.
function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Laufzeit in Minuten. Die Geschwindigkeit einer Einheit steht in den
// Weltdaten als Minuten je Feld, der Weltfaktor unit_speed streckt oder
// staucht sie.
function travelMinutes(fields, minutesPerField, unitSpeed = 1) {
  return fields * minutesPerField * unitSpeed;
}

// Ein Angriff ist so langsam wie seine langsamste Einheit.
function slowestSpeed(troops, speeds) {
  let slowest = 0;
  for (const [unit, amount] of Object.entries(troops || {})) {
    if (!amount) continue;
    const speed = Number(speeds[unit]);
    if (Number.isFinite(speed)) slowest = Math.max(slowest, speed);
  }
  return slowest || null;
}

// Wie viel die geschickten Truppen tragen koennen.
function carryCapacity(troops, carry) {
  let total = 0;
  for (const [unit, amount] of Object.entries(troops || {})) {
    total += Number(amount || 0) * Number((carry || {})[unit] || 0);
  }
  return total;
}

module.exports = { distance, travelMinutes, slowestSpeed, carryCapacity };
