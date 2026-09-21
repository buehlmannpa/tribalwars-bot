'use strict';

const path = require('path');
const fs = require('fs');
const { BrowserWindow, app } = require('electron');
const scripts = require('./pageScripts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Die Bruecke haelt das Spielfenster und fuehrt darin Aktionen aus.
// Bewusst ueber die echte Seite und echte Klicks, damit die Oberflaeche des
// Spiels die Quelle der Wahrheit bleibt und du jederzeit uebernehmen kannst.
class Bridge {
  constructor({ store, logger }) {
    this.store = store;
    this.logger = logger;
    this.win = null;
    this.busy = false;
  }

  get host() {
    return this.store.get().world.host.replace(/\/+$/, '');
  }

  createWindow(show = true) {
    if (this.win && !this.win.isDestroyed()) {
      if (show) this.win.show();
      return this.win;
    }
    this.win = new BrowserWindow({
      width: 1280,
      height: 900,
      show,
      title: 'Spielfenster',
      webPreferences: {
        partition: 'persist:staemme',
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.win.on('closed', () => { this.win = null; });
    this.win.loadURL(isWorldHost(this.host)
      ? `${this.host}/game.php?screen=overview_villages&mode=prod`
      : `${this.host}/`);
    return this.win;
  }

  async ensureWindow() {
    if (!this.win || this.win.isDestroyed()) this.createWindow(true);
    return this.win;
  }

  async exec(script) {
    const win = await this.ensureWindow();
    try {
      return await win.webContents.executeJavaScript(script, true);
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // Navigiert das Spielfenster und wartet, bis die Seite steht.
  async navigate(screen, villageId, params = {}) {
    const win = await this.ensureWindow();
    const query = new URLSearchParams({ screen, ...params });
    if (villageId) query.set('village', String(villageId));
    const url = `${this.host}/game.php?${query.toString()}`;
    try {
      await win.webContents.loadURL(url);
    } catch (err) {
      this.logger.warn(`Seite konnte nicht geladen werden: ${err.message}`);
    }
    await sleep(600 + Math.floor(Math.random() * 900));
    return url;
  }

  async probe() {
    const probe = await this.exec(scripts.PROBE);
    this.adoptWorld(probe);
    return probe;
  }

  // Die App bindet sich an keine bestimmte Welt. Sobald im Spielfenster eine
  // angemeldete Sitzung steht, wird deren Adresse uebernommen.
  adoptWorld(probe) {
    if (!probe || !probe.ok || !probe.loggedIn || !probe.origin) return;
    if (probe.origin === this.host) return;
    this.store.patch({
      world: {
        host: probe.origin,
        label: probe.world ? `Welt ${probe.world}` : probe.origin
      }
    });
    this.logger.info(`Welt uebernommen: ${probe.world || probe.origin}`);
  }

  async listVillages() {
    await this.navigate('overview_villages', null, { mode: 'prod' });
    return this.exec(scripts.LIST_VILLAGES);
  }

  async readBuild(villageId) {
    await this.navigate('main', villageId);
    return this.exec(scripts.READ_BUILD);
  }

  get observeOnly() {
    return Boolean(this.store.get().automation.observeOnly);
  }

  async upgrade(villageId, buildingKey) {
    if (this.observeOnly) {
      // Im Beobachtungsmodus wird nur geprueft, ob der Knopf bereitstuende.
      const check = await this.exec(scripts.canBuild(buildingKey));
      return check && check.ok
        ? { ok: true, observed: true, building: buildingKey, target: check.target }
        : check;
    }
    const result = await this.exec(scripts.clickBuild(buildingKey));
    if (result && result.ok) {
      await sleep(1200 + Math.floor(Math.random() * 1200));
    }
    return result;
  }

  // Es gibt keine gemeinsame Rekrutierungsseite. Kaserne, Stall und Werkstatt
  // haben je eine eigene Ansicht, darum wird das Gebaeude mitgegeben.
  async readTrain(villageId, building) {
    await this.navigate(building, villageId);
    return this.exec(scripts.READ_TRAIN);
  }

  async train(villageId, orders) {
    if (this.observeOnly) {
      return { ok: true, observed: true, ordered: orders };
    }
    const result = await this.exec(scripts.submitTrain(orders));
    if (result && result.ok) {
      await sleep(1200 + Math.floor(Math.random() * 1200));
    }
    return result;
  }

  // Legt die rohe Seite auf die Platte. Damit lassen sich die Auswahlpfade
  // gegen die echte Welt pruefen, ohne dass Zugangsdaten noetig sind.
  async capture(label) {
    const result = await this.exec(scripts.CAPTURE);
    if (!result || !result.ok) return result;
    const dir = path.join(app.getPath('userData'), 'captures');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `${label || 'seite'}-${stamp}.html`);
    fs.writeFileSync(file, result.html, 'utf8');
    this.logger.info(`Seitenabzug gespeichert: ${file}`);
    return { ok: true, file, url: result.url };
  }
}

// Eine Weltadresse hat eine Nummer im Namen, etwa ch96 oder de249.
function isWorldHost(host) {
  return /^https?:\/\/[a-z]+\d+\./i.test(String(host || ''));
}

module.exports = { Bridge, sleep, isWorldHost };
