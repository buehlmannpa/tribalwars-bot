'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Die Welt stellt ihre Karte und ihre Einheitendaten oeffentlich bereit, ohne
// Anmeldung. Diese Dateien werden geholt und auf der Platte zwischengelagert,
// damit die App nicht bei jedem Durchlauf neu laedt.
const MAX_AGE_HOURS = 6;

class WorldData {
  constructor({ store, logger }) {
    this.store = store;
    this.logger = logger;
    this.villages = null;
    this.units = null;
    this.unitSpeed = 1;
    this.worldSpeed = 1;
    this.loadedHost = null;
    this.loadedAt = 0;
  }

  get host() {
    return this.store.get().world.host.replace(/\/+$/, '');
  }

  file(name) {
    return path.join(app.getPath('userData'), 'weltdaten', `${name}.json`);
  }

  fresh() {
    return this.villages
      && this.loadedHost === this.host
      && Date.now() - this.loadedAt < MAX_AGE_HOURS * 3600 * 1000;
  }

  async ensure(force = false) {
    if (!force && this.fresh()) return { ok: true, villages: this.villages.length, cached: true };
    if (!force && this.readCache()) return { ok: true, villages: this.villages.length, cached: true };
    return this.refresh();
  }

  readCache() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file('karte'), 'utf8'));
      if (raw.host !== this.host) return false;
      if (Date.now() - raw.at > MAX_AGE_HOURS * 3600 * 1000) return false;
      this.villages = raw.villages;
      this.units = raw.units;
      this.unitSpeed = raw.unitSpeed || 1;
      this.worldSpeed = raw.worldSpeed || 1;
      this.loadedHost = raw.host;
      this.loadedAt = raw.at;
      return true;
    } catch (err) {
      return false;
    }
  }

  async refresh() {
    const host = this.host;
    try {
      const [mapText, unitXml, configXml] = await Promise.all([
        fetch(`${host}/map/village.txt`).then((r) => r.text()),
        fetch(`${host}/interface.php?func=get_unit_info`).then((r) => r.text()),
        fetch(`${host}/interface.php?func=get_config`).then((r) => r.text())
      ]);
      this.villages = parseVillages(mapText);
      this.units = parseUnits(unitXml);
      this.unitSpeed = parseNumber(configXml, 'unit_speed', 1);
      this.worldSpeed = parseNumber(configXml, 'speed', 1);
      this.loadedHost = host;
      this.loadedAt = Date.now();
      try {
        fs.mkdirSync(path.dirname(this.file('karte')), { recursive: true });
        fs.writeFileSync(this.file('karte'), JSON.stringify({
          host, at: this.loadedAt, villages: this.villages, units: this.units,
          unitSpeed: this.unitSpeed, worldSpeed: this.worldSpeed
        }));
      } catch (err) {
        // Zwischenlager ist Beiwerk, ohne geht es auch.
      }
      const barbarians = this.villages.filter((v) => v.player === 0).length;
      this.logger.info(`Weltdaten geladen: ${this.villages.length} Doerfer, davon ${barbarians} Barbarendoerfer`);
      return { ok: true, villages: this.villages.length, barbarians };
    } catch (err) {
      this.logger.warn(`Weltdaten konnten nicht geladen werden: ${err.message}`);
      return { ok: false, error: String(err.message || err) };
    }
  }

  barbarians() {
    return (this.villages || []).filter((village) => village.player === 0);
  }
}

// Die Karte kommt als Textdatei, eine Zeile je Dorf:
// Nummer, Name, x, y, Spieler, Punkte, Bonus. Der Name ist url-verpackt.
function parseVillages(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const parts = line.trim().split(',');
    if (parts.length < 7) continue;
    const [id, name, x, y, player, points, bonus] = parts;
    if (!/^\d+$/.test(id)) continue;
    out.push({
      id: Number(id),
      name: decodeURIComponent(String(name).replace(/\+/g, ' ')),
      x: Number(x),
      y: Number(y),
      player: Number(player),
      points: Number(points),
      bonus: Number(bonus)
    });
  }
  return out;
}

// Einzelner Zahlenwert aus den Welteinstellungen.
function parseNumber(xml, tag, fallback) {
  const match = new RegExp(`<${tag}>([\\d.]+)</${tag}>`).exec(String(xml));
  return match ? Number(match[1]) : fallback;
}

// Aus den Einheitendaten werden Geschwindigkeit und Tragkraft gelesen.
function parseUnits(xml) {
  const units = {};
  // Die Datei ist in einen Rahmen gepackt. Ohne ihn zu entfernen wuerde der
  // erste Treffer den ganzen Inhalt verschlucken.
  const body = String(xml)
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<\/?config>/g, '');
  const blocks = body.matchAll(/<(\w+)>\s*([\s\S]*?)\s*<\/\1>/g);
  for (const [, key, body] of blocks) {
    const speed = /<speed>([\d.]+)<\/speed>/.exec(body);
    const carry = /<carry>(\d+)<\/carry>/.exec(body);
    if (!speed) continue;
    units[key] = { speed: Number(speed[1]), carry: carry ? Number(carry[1]) : 0 };
  }
  return units;
}

module.exports = { WorldData, parseVillages, parseUnits, parseNumber };
