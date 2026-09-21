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
    this.quitting = false;
    this.capturedUnconfirmed = false;
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
    // Das Spielfenster laesst sich schliessen, es verschwindet dann nur aus
    // dem Blickfeld. Die Anmeldung und die laufende Arbeit bleiben bestehen.
    this.win.on('close', (event) => {
      if (this.quitting) return;
      event.preventDefault();
      this.win.hide();
      this.logger.info('Spielfenster in den Hintergrund gelegt, die Arbeit laeuft weiter');
    });
    this.win.on('closed', () => { this.win = null; });
    this.win.loadURL(isWorldHost(this.host)
      ? `${this.host}/game.php?screen=overview_villages&mode=prod`
      : `${this.host}/`);
    return this.win;
  }

  async ensureWindow() {
    if (!this.win || this.win.isDestroyed()) this.createWindow(false);
    return this.win;
  }

  setVisible(visible) {
    const win = this.win && !this.win.isDestroyed() ? this.win : this.createWindow(visible);
    if (visible) win.show(); else win.hide();
    return { ok: true, visible };
  }

  isVisible() {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible());
  }

  // Ohne bekannte Welt fuehrt jede Navigation ins Leere. Deshalb wird vor dem
  // ersten Seitenaufruf geprueft, wo die angemeldete Sitzung steht.
  async ensureWorld() {
    if (isWorldHost(this.host)) return { ok: true, host: this.host };
    const probe = await this.exec(scripts.PROBE);
    this.adoptWorld(probe);
    if (isWorldHost(this.host)) return { ok: true, host: this.host };
    return {
      ok: false,
      error: 'Keine Welt erkannt. Bitte im Spielfenster eine Welt waehlen und anmelden.'
    };
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
    const world = await this.ensureWorld();
    if (!world.ok) return world;
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
    const nav = await this.navigate('overview_villages', null, { mode: 'prod' });
    if (nav && nav.ok === false) return nav;
    return this.exec(scripts.LIST_VILLAGES);
  }

  // Liest ein einzelnes Dorf vollstaendig aus, ein Seitenaufruf genuegt.
  async scanVillage(villageId) {
    const nav = await this.navigate('overview', villageId);
    if (nav && nav.ok === false) return nav;
    return this.exec(scripts.SCAN_VILLAGE);
  }

  async readBuild(villageId) {
    const nav = await this.navigate('main', villageId);
    if (nav && nav.ok === false) return nav;
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

    const fingerprint = scripts.buildFingerprint(buildingKey);
    const before = await this.exec(fingerprint);
    const result = await this.exec(scripts.clickBuild(buildingKey));
    if (!result || !result.ok) return result;

    // Erst wenn sich die Seite wirklich veraendert hat, gilt der Auftrag als
    // erteilt. Sonst wuerde das Protokoll Erfolge melden, die es nie gab.
    const check = await this.confirm(fingerprint, before);
    if (!check.changed) {
      await this.captureUnconfirmed('bauauftrag');
      return {
        ok: false,
        error: `Ausbau wurde ausgeloest (${result.how}), das Spiel hat aber nichts uebernommen`
      };
    }
    return { ...result, confirmed: true };
  }

  // Wartet, bis sich der Fingerabdruck der Seite veraendert hat.
  async confirm(fingerprintScript, before, tries = 8, waitMs = 700) {
    if (!before || !before.ok) return { changed: true, unchecked: true };
    const start = JSON.stringify(before);
    for (let i = 0; i < tries; i += 1) {
      await sleep(waitMs);
      const now = await this.exec(fingerprintScript);
      if (!now || !now.ok) continue;
      if (JSON.stringify(now) !== start) return { changed: true, after: now };
    }
    return { changed: false };
  }

  // Legt einmal je Sitzung einen Seitenabzug ab, wenn eine Aktion nicht
  // bestaetigt werden konnte. Damit laesst sich die Ursache nachtraeglich
  // feststellen, ohne dass sich Dateien anhaeufen.
  async captureUnconfirmed(label) {
    if (this.capturedUnconfirmed) return null;
    this.capturedUnconfirmed = true;
    const result = await this.capture(`nicht-bestaetigt-${label}`);
    if (result && result.ok) {
      this.logger.warn(`Seitenabzug zur Fehlersuche abgelegt: ${result.file}`);
    }
    return result;
  }

  async readTrain(villageId, building) {
    const nav = await this.navigate(building, villageId);
    if (nav && nav.ok === false) return nav;
    return this.exec(scripts.READ_TRAIN);
  }

  async train(villageId, orders) {
    if (this.observeOnly) {
      return { ok: true, observed: true, ordered: orders };
    }

    const before = await this.exec(scripts.TRAIN_FINGERPRINT);
    const result = await this.exec(scripts.submitTrain(orders));
    if (!result || !result.ok) return result;

    const check = await this.confirm(scripts.TRAIN_FINGERPRINT, before);
    if (!check.changed) {
      await this.captureUnconfirmed('rekrutierung');
      return {
        ok: false,
        error: 'Rekrutierung wurde abgeschickt, das Spiel hat aber nichts uebernommen'
      };
    }
    return { ...result, confirmed: true };
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
