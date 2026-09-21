'use strict';

const { Notification, powerSaveBlocker } = require('electron');
const { runBuildJob } = require('./jobs/buildJob');
const { runTrainJob } = require('./jobs/trainJob');
const { sleep } = require('./bridge');

const randomBetween = (min, max) => min + Math.random() * (max - min);

// Der Planer ist das Herz der App. Er arbeitet die Doerfer der Reihe nach ab,
// haelt zufaellige Abstaende ein und stoppt sofort, wenn das Spiel einen
// Botschutz zeigt oder die Sitzung abgelaufen ist.
class Scheduler {
  constructor({ bridge, store, logger, onStatus }) {
    this.bridge = bridge;
    this.store = store;
    this.logger = logger;
    this.onStatus = onStatus || (() => {});
    this.running = false;
    this.pauseReason = null;
    this.actionTimes = [];
    this.lastProbe = null;
    this.lastReport = {};
    this.lastIncoming = 0;
    this.nextTickAt = null;
    this.powerBlockerId = null;
  }

  status() {
    return {
      running: this.running,
      observeOnly: Boolean(this.store.get().automation.observeOnly),
      pauseReason: this.pauseReason,
      nextTickAt: this.nextTickAt,
      actionsLastHour: this.actionsLastHour(),
      probe: this.lastProbe
    };
  }

  emit() {
    this.onStatus(this.status());
  }

  start() {
    if (this.running) return this.status();
    this.running = true;
    this.pauseReason = null;
    this.store.patch({ automation: { enabled: true } });
    this.keepAwake(true);
    this.logger.info(this.store.get().automation.observeOnly
      ? 'Automatik gestartet im Modus nur beobachten, es wird nichts geklickt'
      : 'Automatik gestartet, sie handelt jetzt selbstaendig');
    this.loop();
    this.emit();
    return this.status();
  }

  stop(reason) {
    if (!this.running && !reason) return this.status();
    this.running = false;
    this.pauseReason = reason || null;
    this.store.patch({ automation: { enabled: false } });
    this.keepAwake(false);
    this.logger.info(reason ? `Automatik angehalten: ${reason}` : 'Automatik angehalten');
    this.emit();
    return this.status();
  }

  keepAwake(on) {
    const wanted = on && this.store.get().automation.keepAwake;
    if (wanted && this.powerBlockerId === null) {
      this.powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    }
    if (!wanted && this.powerBlockerId !== null) {
      powerSaveBlocker.stop(this.powerBlockerId);
      this.powerBlockerId = null;
    }
  }

  actionsLastHour() {
    const cutoff = Date.now() - 3600 * 1000;
    this.actionTimes = this.actionTimes.filter((t) => t > cutoff);
    return this.actionTimes.length;
  }

  async loop() {
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        this.logger.error(`Fehler im Durchlauf: ${err.message}`);
      }
      if (!this.running) break;
      const { minDelaySeconds, maxDelaySeconds } = this.store.get().automation;
      const wait = Math.round(randomBetween(minDelaySeconds, maxDelaySeconds) * 1000);
      this.nextTickAt = Date.now() + wait;
      this.emit();
      await sleep(wait);
    }
    this.nextTickAt = null;
    this.emit();
  }

  async tick() {
    const config = this.store.get();

    if (this.isNightPause(config)) {
      this.logger.info('Nachtpause aktiv, es wird nichts unternommen');
      return;
    }
    if (this.actionsLastHour() >= config.automation.maxActionsPerHour) {
      this.logger.info('Stundenlimit erreicht, der Planer wartet');
      return;
    }

    const probe = await this.bridge.probe();
    this.lastProbe = probe;
    this.emit();

    if (!probe || !probe.ok) {
      this.logger.warn('Spielseite konnte nicht gelesen werden');
      return;
    }
    if (probe.captcha) {
      this.notify('Botschutz erkannt', 'Bitte loese das Captcha im Spielfenster. Die Automatik ist angehalten.', 'captcha');
      this.bridge.createWindow(true);
      this.stop('Botschutz erkannt, bitte im Spielfenster bestaetigen');
      return;
    }
    if (probe.sessionExpired || !probe.loggedIn) {
      this.notify('Anmeldung noetig', 'Bitte melde dich im Spielfenster neu an.', 'login');
      this.bridge.createWindow(true);
      this.stop('Sitzung abgelaufen, bitte im Spielfenster anmelden');
      return;
    }
    const incoming = probe.player ? Number(probe.player.incomings || 0) : 0;
    if (incoming > this.lastIncoming) {
      this.notify('Eingehender Angriff', `${incoming} Angriffe sind unterwegs.`, 'incoming');
    }
    this.lastIncoming = incoming;
    if (config.automation.pauseOnIncoming && incoming > 0) {
      this.logger.warn(`${incoming} eingehende Angriffe, dieser Durchlauf wird uebersprungen`);
      return;
    }

    const village = this.pickVillage(config);
    if (!village) return;

    village.lastRun = Date.now();
    this.store.save();

    // Bauplan und Rekrutierung greifen auf denselben Topf zu. Wer zuerst an
    // der Reihe ist, bekommt die Rohstoffe, deshalb ist der Vorrang einstellbar.
    let savingForTroops = false;
    for (const job of this.jobOrder(config, village)) {
      if (!this.running) break;
      if (job === 'build' && savingForTroops) {
        this.logger.info(`${village.name || village.id} Bauplan: wartet, es wird fuer Truppen gespart`);
        continue;
      }
      if (job === 'build' && village.buildActive) {
        const result = await runBuildJob({ bridge: this.bridge, store: this.store, logger: this.logger, village });
        this.report(village, 'Bauplan', result);
        if (result && result.acted) this.actionTimes.push(Date.now());
      }
      if (job === 'troops' && village.troopActive) {
        const result = await runTrainJob({ bridge: this.bridge, store: this.store, logger: this.logger, village });
        this.report(village, 'Truppen', result);
        if (result && result.acted) this.actionTimes.push(Date.now());
        // Bei Vorrang Truppen bleibt der Bauplan stehen, solange gespart wird.
        if (result && result.waiting && (config.automation.priority || 'build') === 'troops') {
          savingForTroops = true;
        }
      }
    }
    this.emit();
  }

  // Gleich bleibende Meldungen werden nur einmal geschrieben, sonst fuellt
  // sich das Protokoll bei jedem Durchlauf mit derselben Zeile.
  report(village, label, result) {
    if (!result) return;
    const name = village.name || village.id;
    if (result.acted || result.observed) {
      this.lastReport[`${village.id}:${label}`] = null;
      return;
    }
    const key = `${village.id}:${label}`;
    const message = result.reason || (result.ok ? 'nichts zu tun' : 'unbekannter Fehler');
    if (this.lastReport[key] === message) return;
    this.lastReport[key] = message;
    if (result.ok) {
      this.logger.info(`${name} ${label}: ${message}`);
    } else {
      this.logger.warn(`${name} ${label}: ${message}`);
    }
  }

  // Legt fest, wer im Dorf zuerst an die Rohstoffe darf.
  jobOrder(config, village) {
    const mode = config.automation.priority || 'build';
    if (mode === 'troops') return ['troops', 'build'];
    if (mode === 'alternate') {
      village.lastPriority = village.lastPriority === 'troops' ? 'build' : 'troops';
      return village.lastPriority === 'troops' ? ['troops', 'build'] : ['build', 'troops'];
    }
    return ['build', 'troops'];
  }

  // Waehlt das Dorf, dessen letzter Durchlauf am laengsten zurueckliegt.
  pickVillage(config) {
    const cooldown = (Number(config.automation.villageCooldownMinutes) || 12) * 60 * 1000;
    const now = Date.now();
    const candidates = Object.values(config.villages)
      .filter((v) => v.buildActive || v.troopActive)
      .filter((v) => now - (v.lastRun || 0) >= cooldown)
      .sort((a, b) => (a.lastRun || 0) - (b.lastRun || 0));
    return candidates[0] || null;
  }

  isNightPause(config) {
    const night = config.automation.nightPause;
    if (!night || !night.enabled) return false;
    const hour = new Date().getHours();
    if (night.startHour <= night.endHour) return hour >= night.startHour && hour < night.endHour;
    return hour >= night.startHour || hour < night.endHour;
  }

  notify(title, body, kind) {
    const settings = this.store.get().automation.notifications || {};
    if (kind && settings[kind] === false) return;
    try {
      if (Notification.isSupported()) new Notification({ title, body }).show();
    } catch (err) {
      // Benachrichtigungen sind Beiwerk, sie duerfen nichts blockieren.
    }
  }
}

module.exports = { Scheduler };
