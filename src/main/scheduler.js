'use strict';

const { Notification, powerSaveBlocker } = require('electron');
const { runBuildJob } = require('./jobs/buildJob');
const { runTrainJob } = require('./jobs/trainJob');
const { runFarmJob } = require('./jobs/farmJob');
const { sleep } = require('./bridge');

const randomBetween = (min, max) => min + Math.random() * (max - min);

const JOB_LABEL = { build: 'Bauplan', troops: 'Truppen', farm: 'Farmen' };

const emptySummary = () => ({
  villages: 0, built: 0, trained: 0, farmed: 0,
  observed: 0, waiting: 0, saving: 0, done: 0, idle: 0, problems: 0
});

// Fasst einen Durchlauf in einer einzigen, lesbaren Zeile zusammen.
function summaryText(s) {
  const parts = [];
  if (s.built) parts.push(s.built === 1 ? '1 Ausbau' : `${s.built} Ausbauten`);
  if (s.trained) parts.push(s.trained === 1 ? '1 Rekrutierung' : `${s.trained} Rekrutierungen`);
  if (s.farmed) parts.push(s.farmed === 1 ? '1 Farmangriff' : `${s.farmed} Farmangriffe`);
  if (s.observed) parts.push(`${s.observed} nur beobachtet`);
  if (s.waiting) parts.push(`${s.waiting} warten auf Rohstoffe`);
  if (s.saving) parts.push(`${s.saving} wegen Vorrang zurueckgestellt`);
  if (s.done) parts.push(`${s.done} Ziel erreicht`);
  if (s.problems) parts.push(s.problems === 1 ? '1 Problem' : `${s.problems} Probleme`);
  const doerfer = s.villages === 1 ? '1 Dorf' : `${s.villages} Doerfer`;
  return `Durchlauf: ${doerfer} geprueft${parts.length ? `, ${parts.join(', ')}` : ', nichts zu tun'}`;
}

// Der Planer ist das Herz der App. Er arbeitet die Doerfer der Reihe nach ab,
// haelt zufaellige Abstaende ein und stoppt sofort, wenn das Spiel einen
// Botschutz zeigt oder die Sitzung abgelaufen ist.
class Scheduler {
  constructor({ bridge, store, logger, world, onStatus, jobs }) {
    this.bridge = bridge;
    this.store = store;
    this.logger = logger;
    this.world = world;
    this.onStatus = onStatus || (() => {});
    // Die Auftraege sind austauschbar, damit sie sich einzeln pruefen lassen.
    this.jobs = Object.assign({ build: runBuildJob, troops: runTrainJob, farm: runFarmJob }, jobs || {});
    this.running = false;
    this.pauseReason = null;
    this.actionTimes = [];
    this.lastProbe = null;
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
      this.bridge.setVisible(true);
      this.stop('Botschutz erkannt, bitte im Spielfenster bestaetigen');
      return;
    }
    if (probe.sessionExpired || !probe.loggedIn) {
      this.notify('Anmeldung noetig', 'Bitte melde dich im Spielfenster neu an.', 'login');
      this.bridge.setVisible(true);
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

    // Ein Durchlauf geht durch alle faelligen Doerfer, nicht nur durch das
    // naechste. Zwischen den Doerfern liegt eine kurze, zufaellige Pause.
    const villages = this.dueVillages(config);
    if (!villages.length) return;

    const summary = emptySummary();
    for (const village of villages) {
      if (!this.running) break;
      if (this.actionsLastHour() >= config.automation.maxActionsPerHour) {
        this.logger.info('Stundenlimit erreicht, die restlichen Doerfer kommen im naechsten Durchlauf');
        break;
      }
      summary.villages += 1;
      village.lastRun = Date.now();
      this.store.save();
      await this.runVillage(config, village, summary);
      this.emit();
      if (this.running && village !== villages[villages.length - 1]) {
        await sleep(Math.round(randomBetween(2500, 7000)));
      }
    }

    this.summarize(summary);
    this.emit();
  }

  // Ein einzelnes Dorf: Bauplan, Truppen und Farmen in der eingestellten
  // Reihenfolge.
  async runVillage(config, village, summary) {
    const name = village.name || village.id;
    let hold = null;

    for (const job of this.jobOrder(config, village)) {
      if (!this.running) break;
      if (job === 'build' && !village.buildActive) continue;
      if (job === 'troops' && !village.troopActive) continue;
      // Bauplan und Rekrutierung greifen auf denselben Topf zu. Wartet der
      // bevorzugte Auftrag auf Rohstoffe, bleibt der andere stehen, sonst
      // wird gleich wieder ausgegeben, was gerade gespart wird.
      if (hold) {
        summary.saving += 1;
        continue;
      }
      const result = await this.jobs[job]({
        bridge: this.bridge, store: this.store, logger: this.logger, village
      });
      this.account(summary, job, result, name);
      if (result && result.waiting && this.isPriorityJob(config, village, job)) hold = job;
    }

    if (!this.running || !village.farmActive) return;
    const farm = await this.jobs.farm({
      bridge: this.bridge, store: this.store, logger: this.logger, village, world: this.world
    });
    this.account(summary, 'farm', farm, name);
  }

  // Zaehlt das Ergebnis eines Auftrags fuer die Zusammenfassung. Nur echte
  // Probleme bekommen sofort eine eigene Zeile.
  account(summary, job, result, name) {
    if (!result) return;
    if (result.acted) {
      this.actionTimes.push(Date.now());
      summary[job === 'build' ? 'built' : job === 'troops' ? 'trained' : 'farmed'] += 1;
      return;
    }
    if (result.observed) {
      summary.observed += 1;
      return;
    }
    if (!result.ok) {
      summary.problems += 1;
      this.logger.warn(`${name} ${JOB_LABEL[job]}: ${result.reason || 'unbekannter Fehler'}`);
      return;
    }
    if (result.waiting) {
      summary.waiting += 1;
      return;
    }
    if (result.done) {
      summary.done += 1;
      return;
    }
    summary.idle += 1;
  }

  // Eine Zeile je Durchlauf statt einer Zeile je Dorf und Auftrag.
  summarize(summary) {
    if (!summary.villages) return;
    this.logger.info(summaryText(summary));
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

  // Ist dieser Auftrag im Dorf gerade der bevorzugte.
  isPriorityJob(config, village, job) {
    const mode = config.automation.priority || 'build';
    if (mode === 'alternate') return job === (village.lastPriority || 'build');
    if (mode === 'troops') return job === 'troops';
    return job === 'build';
  }

  // Alle Doerfer, deren Wartezeit abgelaufen ist, das laengst gepruefte zuerst.
  dueVillages(config) {
    const cooldown = (Number(config.automation.villageCooldownMinutes) || 12) * 60 * 1000;
    const now = Date.now();
    return Object.values(config.villages)
      .filter((v) => v.buildActive || v.troopActive || v.farmActive)
      .filter((v) => now - (v.lastRun || 0) >= cooldown)
      .sort((a, b) => (a.lastRun || 0) - (b.lastRun || 0));
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

module.exports = { Scheduler, summaryText };
