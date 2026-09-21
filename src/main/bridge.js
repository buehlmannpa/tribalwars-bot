'use strict';

const path = require('path');
const fs = require('fs');
const { WebContentsView, app } = require('electron');
const scripts = require('./pageScripts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Die Bruecke haelt das Spielfenster und fuehrt darin Aktionen aus.
// Bewusst ueber die echte Seite und echte Klicks, damit die Oberflaeche des
// Spiels die Quelle der Wahrheit bleibt und du jederzeit uebernehmen kannst.
class Bridge {
  constructor({ store, logger }) {
    this.store = store;
    this.logger = logger;
    this.view = null;
    this.parent = null;
    this.visible = false;
    this.onLayout = null;
    this.busy = false;
    this.quitting = false;
    this.capturedUnconfirmed = false;
  }

  get host() {
    return this.store.get().world.host.replace(/\/+$/, '');
  }

  // Die Spielansicht ist keine eigene Fenster mehr, sondern eine Flaeche im
  // Hauptfenster. Geschlossen sitzt sie knapp ausserhalb des sichtbaren
  // Bereichs, damit die Seite ihre normale Groesse behaelt und weiterarbeitet.
  attachTo(parent) {
    this.parent = parent;
    // Wird das Hauptfenster geschlossen, geht die Flaeche mit. Dann wird beim
    // naechsten Oeffnen eine neue gebaut, die Anmeldung bleibt gespeichert.
    if (this.view && this.view.webContents.isDestroyed()) this.view = null;
    if (this.view) {
      parent.contentView.addChildView(this.view);
      this.layout();
      return this.view;
    }

    this.view = new WebContentsView({
      webPreferences: {
        partition: 'persist:staemme',
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    parent.contentView.addChildView(this.view);
    this.layout();
    this.view.webContents.loadURL(isWorldHost(this.host)
      ? `${this.host}/game.php?screen=overview_villages&mode=prod`
      : `${this.host}/`);
    parent.on('resize', () => this.layout());
    return this.view;
  }

  get webContents() {
    return this.view && !this.view.webContents.isDestroyed() ? this.view.webContents : null;
  }

  // Breite der Spielansicht im geteilten Fenster.
  splitWidth() {
    if (!this.parent) return 0;
    const [width] = this.parent.getContentSize();
    return Math.max(460, Math.round(width * 0.5));
  }

  layout() {
    if (!this.view || !this.parent) return 0;
    const [width, height] = this.parent.getContentSize();
    const split = this.splitWidth();
    const x = this.visible ? width - split : width + 40;
    this.view.setBounds({ x, y: 0, width: split, height });
    const reserved = this.visible ? split : 0;
    if (this.onLayout) this.onLayout(reserved);
    return reserved;
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.layout();
    return { ok: true, visible: this.visible, width: this.visible ? this.splitWidth() : 0 };
  }

  isVisible() {
    return Boolean(this.visible);
  }

  // Bleibt aus Gruenden der Vertraeglichkeit bestehen, zeigt die Ansicht.
  createWindow(show = true) {
    return this.setVisible(show);
  }

  async ensureWindow() {
    return this.view;
  }

  async exec(script) {
    const contents = this.webContents;
    if (!contents) return { ok: false, error: 'Spielansicht ist nicht bereit' };
    try {
      return await contents.executeJavaScript(script, true);
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
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
      error: 'Keine Welt erkannt. Bitte in der Spielansicht eine Welt waehlen und anmelden.'
    };
  }

  // Navigiert die Spielansicht und wartet, bis die Seite steht.
  async navigate(screen, villageId, params = {}) {
    const world = await this.ensureWorld();
    if (!world.ok) return world;
    const contents = this.webContents;
    if (!contents) return { ok: false, error: 'Spielansicht ist nicht bereit' };
    const query = new URLSearchParams({ screen, ...params });
    if (villageId) query.set('village', String(villageId));
    const url = `${this.host}/game.php?${query.toString()}`;
    try {
      await contents.loadURL(url);
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

  // Holt eine Datei der Welt aus der Spielansicht heraus. Da die Ansicht auf
  // derselben Adresse steht, ist das ein Abruf im eigenen Haus und geht durch
  // jede Zugangsbeschraenkung, die auch das Spiel selbst passiert.
  async fetchText(url) {
    const world = await this.ensureWorld();
    if (!world.ok) return world;

    const probe = await this.exec(scripts.PROBE);
    const origin = probe && probe.ok ? probe.origin : null;
    if (!origin || !String(url).startsWith(origin)) {
      const nav = await this.navigate('overview_villages', null, { mode: 'prod' });
      if (nav && nav.ok === false) return nav;
    }

    return this.exec(`(function () {
      return fetch(${JSON.stringify(url)}, { credentials: 'include' })
        .then(function (response) {
          if (!response.ok) throw new Error('Antwort ' + response.status);
          return response.text();
        })
        .then(function (text) { return { ok: true, text: text }; })
        .catch(function (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; });
    })();`);
  }

  // Zahl der eigenen ausgehenden Befehle eines Dorfes.
  async readCommands(villageId) {
    const nav = await this.navigate('overview', villageId);
    if (nav && nav.ok === false) return nav;
    return this.exec(scripts.COMMAND_COUNT);
  }

  // Schickt einen Angriff auf ein Ziel. Jeder Schritt wird gegengeprueft, und
  // erst ein zusaetzlicher Befehl in der Liste gilt als Nachweis.
  async sendAttack(villageId, target, troops, unitKeys, knownCommands) {
    if (this.observeOnly) {
      return { ok: true, observed: true, target, ordered: troops };
    }

    const before = Number.isFinite(knownCommands)
      ? { ok: true, commands: knownCommands }
      : await this.readCommands(villageId);
    const nav = await this.navigate('place', villageId);
    if (nav && nav.ok === false) return nav;

    const prepared = await this.exec(scripts.prepareAttack(target.x, target.y, troops, unitKeys));
    if (!prepared || !prepared.ok) {
      await this.captureUnconfirmed('angriff-vorbereiten');
      return prepared || { ok: false, error: 'Versammlungsplatz nicht lesbar' };
    }

    await sleep(1200 + Math.floor(Math.random() * 900));
    const confirmed = await this.exec(scripts.confirmAttack(target.x, target.y));
    if (!confirmed || !confirmed.ok) {
      await this.captureUnconfirmed('angriff-bestaetigen');
      return confirmed || { ok: false, error: 'Bestaetigung nicht lesbar' };
    }

    await sleep(1500 + Math.floor(Math.random() * 1200));
    const after = await this.readCommands(villageId);
    if (before && before.ok && after && after.ok && after.commands > before.commands) {
      return { ok: true, confirmed: true, target, ordered: troops };
    }
    await this.captureUnconfirmed('angriff-nachweis');
    return { ok: false, error: 'Angriff wurde abgeschickt, es ist aber kein neuer Befehl erschienen' };
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
