'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const { Store } = require('./store');
const { Logger } = require('./logger');
const { Bridge } = require('./bridge');
const { Scheduler } = require('./scheduler');
const { WorldData } = require('./worldData');

let store;
let logger;
let bridge;
let scheduler;
let world;
let dashboard;

function createDashboard() {
  dashboard = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1000,
    minHeight: 640,
    title: 'Staemme Manager',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: '#1b1712',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  dashboard.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  dashboard.on('closed', () => { dashboard = null; });
  return dashboard;
}

function send(channel, payload) {
  if (dashboard && !dashboard.isDestroyed()) dashboard.webContents.send(channel, payload);
}

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'Steuerung',
      submenu: [
        { label: 'Automatik starten', accelerator: 'Cmd+R', click: () => scheduler.start() },
        { label: 'Automatik anhalten', accelerator: 'Cmd+.', click: () => scheduler.stop('Von Hand angehalten') },
        { type: 'separator' },
        { label: 'Spielansicht ein und ausblenden', accelerator: 'Cmd+G', click: () => toggleGame() }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  store = new Store();
  logger = new Logger();
  bridge = new Bridge({ store, logger });
  world = new WorldData({ store, logger, bridge });
  scheduler = new Scheduler({ bridge, store, logger, world, onStatus: (status) => send('status', status) });

  logger.onEntry((entry) => send('log', entry));
  createDashboard();
  buildMenu();

  // Die Spielansicht sitzt im selben Fenster. Die Oberflaeche erfaehrt, wie
  // viel Platz sie rechts frei lassen muss.
  bridge.onLayout = (reserved) => send('layout', { gameWidth: reserved });
  bridge.attachTo(dashboard);
  bridge.setVisible(true);
  logger.info('App gestartet. Melde dich im Spielfenster an, danach die Doerfer einlesen.');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDashboard();
      bridge.attachTo(dashboard);
      bridge.setVisible(bridge.isVisible());
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (bridge) bridge.quitting = true;
  if (scheduler) scheduler.stop('App wird beendet');
});

ipcMain.handle('state:get', () => ({
  config: store.get(),
  status: scheduler.status(),
  logs: logger.history(),
  gameWidth: bridge.isVisible() ? bridge.splitWidth() : 0
}));

ipcMain.handle('automation:start', () => scheduler.start());
ipcMain.handle('automation:stop', () => scheduler.stop('Von Hand angehalten'));

ipcMain.handle('config:patch', (_event, patch) => store.patch(patch));

function toggleGame() {
  const result = bridge.setVisible(!bridge.isVisible());
  send('status', scheduler.status());
  return result;
}

ipcMain.handle('window:game', () => toggleGame());
ipcMain.handle('window:gameVisible', () => ({ ok: true, visible: bridge.isVisible() }));

// Welt einlesen: erst die Dorfliste, danach jedes Dorf einmal oeffnen und
// Gebaeudestufen, Rohstoffe, Bauernhof und Truppenbestand mitnehmen.
ipcMain.handle('world:scan', async () => {
  const world = await bridge.ensureWorld();
  if (!world.ok) {
    logger.warn(world.error);
    return { ok: false, error: world.error };
  }

  const list = await bridge.listVillages();
  if (!list || !list.ok || !list.villages.length) {
    const error = list && list.error ? list.error : 'Keine Doerfer gefunden. Bist du angemeldet?';
    logger.warn(`Welt einlesen fehlgeschlagen: ${error}`);
    return { ok: false, error };
  }

  logger.info(`${list.villages.length} Doerfer gefunden, Einzelheiten werden gelesen`);
  let scanned = 0;
  for (const [index, entry] of list.villages.entries()) {
    const village = store.village(entry.id);
    village.name = entry.name || village.name;
    village.coords = entry.coords || village.coords;
    village.continent = entry.continent || village.continent;

    send('scan', { done: index, total: list.villages.length, village: village.name });
    const detail = await bridge.scanVillage(entry.id);
    if (detail && detail.ok) {
      village.points = detail.points;
      village.levels = detail.levels;
      village.units = detail.units;
      village.unitsHome = detail.unitsHome;
      village.pop = detail.pop;
      village.popMax = detail.popMax;
      village.resources = detail.resources;
      village.scannedAt = Date.now();
      scanned += 1;
      const troops = Object.values(detail.unitsHome || {}).reduce((sum, n) => sum + n, 0);
      logger.info(`${village.name}: ${detail.points} Punkte, ${troops} Einheiten daheim, Bauernhof ${detail.pop} von ${detail.popMax}`);
    } else {
      logger.warn(`${village.name || entry.id}: ${detail && detail.error ? detail.error : 'nicht lesbar'}`);
    }
    store.save();
  }

  send('scan', { done: list.villages.length, total: list.villages.length, village: null });
  logger.info(`Welt eingelesen: ${scanned} von ${list.villages.length} Doerfern vollstaendig`);
  return { ok: true, count: list.villages.length, scanned, config: store.get() };
});

ipcMain.handle('village:update', (_event, { id, patch }) => {
  const village = store.village(id);
  Object.assign(village, patch);
  store.save();
  return store.get();
});

// Sammelzuweisung fuer mehrere Doerfer in einem Schritt.
ipcMain.handle('villages:assign', (_event, { ids, patch }) => {
  for (const id of ids || []) Object.assign(store.village(id), patch);
  store.save();
  logger.info(`Zuweisung fuer ${(ids || []).length} Doerfer gespeichert`);
  return store.get();
});

ipcMain.handle('village:remove', (_event, { id }) => {
  delete store.get().villages[id];
  store.save();
  return store.get();
});

ipcMain.handle('template:save', (_event, { kind, name, value }) => {
  const bucket = kind === 'build' ? 'buildTemplates' : 'troopTemplates';
  store.get()[bucket][name] = value;
  store.save();
  logger.info(`Vorlage gespeichert: ${name}`);
  return store.get();
});

ipcMain.handle('template:delete', (_event, { kind, name }) => {
  const bucket = kind === 'build' ? 'buildTemplates' : 'troopTemplates';
  delete store.get()[bucket][name];
  store.save();
  return store.get();
});

ipcMain.handle('capture', async (_event, { label }) => {
  const result = await bridge.capture(label);
  if (result && result.ok) shell.showItemInFolder(result.file);
  return result;
});

// Vorschau des Farmassistenten fuer ein Dorf, ohne irgendetwas zu schicken.
ipcMain.handle('farm:preview', async (_event, { id }) => {
  const village = store.get().villages[id];
  if (!village) return { ok: false, error: 'Dorf unbekannt' };
  const ready = await world.ensure();
  if (!ready.ok) return ready;

  const { planFarmRun, cleanTroops, parseCoords } = require('./jobs/farmJob');
  const farm = store.get().farm;
  const origin = parseCoords(village.coords);
  if (!origin) return { ok: false, error: 'Dorf noch nicht eingelesen' };

  const troops = cleanTroops(farm.troops);
  const speeds = Object.fromEntries(Object.entries(world.units || {}).map(([k, v]) => [k, v.speed]));
  const plan = planFarmRun({
    origin, troops, units: world.units || {},
    unitSpeed: world.unitSpeed || 1,
    maxHours: Number(farm.maxHours) || 2,
    minMinutes: Number(farm.minMinutesBetweenAttacks) || 120,
    history: farm.history || {},
    barbarians: world.barbarians(),
    home: village.unitsHome || {},
    now: Date.now()
  });

  // Alle erreichbaren Ziele zaehlen, unabhaengig von der Wartezeit.
  const { distance, travelMinutes, slowestSpeed } = require('../shared/geo');
  const slowest = slowestSpeed(troops, speeds);
  const maxFields = slowest ? (Number(farm.maxHours) * 60) / (slowest * (world.unitSpeed || 1)) : 0;
  const reachable = slowest ? world.barbarians()
    .map((v) => ({ v, fields: distance(origin, v) }))
    .filter((entry) => entry.fields > 0 && entry.fields <= maxFields)
    .sort((a, b) => a.fields - b.fields) : [];

  return {
    ok: true,
    total: world.barbarians().length,
    reachable: reachable.length,
    maxFields: Math.round(maxFields * 10) / 10,
    nearest: reachable.slice(0, 12).map((entry) => ({
      coords: `${entry.v.x}|${entry.v.y}`,
      points: entry.v.points,
      fields: Math.round(entry.fields * 10) / 10,
      minutes: Math.round(travelMinutes(entry.fields, slowest, world.unitSpeed || 1)),
      lastAttack: (farm.history || {})[entry.v.id] || 0
    })),
    next: plan.target ? `${plan.target.x}|${plan.target.y}` : null,
    reason: plan.reason || null
  };
});

ipcMain.handle('world:refresh', async () => world.refresh());

ipcMain.handle('probe', async () => {
  const probe = await bridge.probe();
  logger.info(`Statusabfrage: ${probe && probe.loggedIn ? 'angemeldet' : 'nicht angemeldet'}`);
  return probe;
});
