'use strict';

const fs = require('fs');
const path = require('path');
const electron = require('electron');

// Die Welt stellt ihre Karte und ihre Einheitendaten oeffentlich bereit, ohne
// Anmeldung. Diese Dateien werden geholt und auf der Platte zwischengelagert,
// damit die App nicht bei jedem Durchlauf neu laedt.
const MAX_AGE_HOURS = 6;

class WorldData {
  constructor({ store, logger, bridge, strategies }) {
    this.store = store;
    this.logger = logger;
    this.bridge = bridge;
    this.customStrategies = strategies || null;
    this.lastStrategy = null;
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
    return path.join(electron.app.getPath('userData'), 'weltdaten', `${name}.json`);
  }

  // Die oeffentlichen Weltdateien werden ueber mehrere Wege versucht. Node
  // bringt zwar ein eigenes fetch mit, das geht aber an der Netzwerkschicht
  // von Chromium vorbei und scheitert deshalb hinter manchen Zugaengen. Die
  // Wege von Electron und die Spielansicht selbst sind verlaesslicher.
  strategies() {
    if (this.customStrategies) return this.customStrategies;
    const list = [];

    const partition = electron.session && electron.session.fromPartition
      ? electron.session.fromPartition('persist:staemme')
      : null;
    if (partition && typeof partition.fetch === 'function') {
      list.push(['Sitzung der Spielansicht', async (url) => {
        const response = await partition.fetch(url);
        if (!response.ok) throw new Error(`Antwort ${response.status}`);
        return response.text();
      }]);
    }
    if (electron.net && typeof electron.net.fetch === 'function') {
      list.push(['Netzschicht von Electron', async (url) => {
        const response = await electron.net.fetch(url);
        if (!response.ok) throw new Error(`Antwort ${response.status}`);
        return response.text();
      }]);
    }
    if (this.bridge && typeof this.bridge.fetchText === 'function') {
      list.push(['Spielansicht', async (url) => {
        const result = await this.bridge.fetchText(url);
        if (!result || !result.ok) throw new Error(result && result.error ? result.error : 'kein Ergebnis');
        return result.text;
      }]);
    }
    if (typeof globalThis.fetch === 'function') {
      list.push(['Node', async (url) => {
        const response = await globalThis.fetch(url);
        if (!response.ok) throw new Error(`Antwort ${response.status}`);
        return response.text();
      }]);
    }
    return list;
  }

  async fetchText(url) {
    const fehler = [];
    for (const [name, holen] of this.strategies()) {
      try {
        const text = await holen(url);
        if (typeof text === 'string' && text.length) {
          if (this.lastStrategy !== name) {
            this.logger.info(`Weltdaten werden ueber ${name} geladen`);
            this.lastStrategy = name;
          }
          return text;
        }
        fehler.push(`${name}: leere Antwort`);
      } catch (err) {
        fehler.push(`${name}: ${describeError(err)}`);
      }
    }
    throw new Error(fehler.join(' | '));
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
      if (!/^https?:\/\/[a-z]+\d+\./i.test(host)) {
        throw new Error('Es steht noch keine Welt fest. Bitte zuerst in der Spielansicht anmelden.');
      }
      // Nacheinander, damit die Spielansicht nicht drei Seiten gleichzeitig
      // laden muss, falls sie als Weg gebraucht wird.
      const mapText = await this.fetchText(`${host}/map/village.txt`);
      const unitXml = await this.fetchText(`${host}/interface.php?func=get_unit_info`);
      const configXml = await this.fetchText(`${host}/interface.php?func=get_config`);
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

// Node verpackt jeden Netzfehler in ein knappes fetch failed. Der wahre
// Grund steckt darunter und gehoert ins Protokoll.
function describeError(err) {
  const teile = [];
  if (err && err.message) teile.push(err.message);
  const cause = err && err.cause;
  if (cause) {
    if (cause.code) teile.push(cause.code);
    if (cause.message && cause.message !== err.message) teile.push(cause.message);
  }
  return teile.join(', ') || String(err);
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

module.exports = { WorldData, parseVillages, parseUnits, parseNumber, describeError };
