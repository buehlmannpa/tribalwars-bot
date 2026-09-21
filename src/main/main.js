'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const { Store } = require('./store');
const { Logger } = require('./logger');
const { Bridge } = require('./bridge');
const { Scheduler } = require('./scheduler');

let store;
let logger;
let bridge;
let scheduler;
let dashboard;

function createDashboard() {
  dashboard = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    title: 'Staemme Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  dashboard.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  dashboard.on('closed', () => { dashboard = null; });
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
        { label: 'Spielfenster zeigen', accelerator: 'Cmd+G', click: () => bridge.createWindow(true) }
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
  scheduler = new Scheduler({ bridge, store, logger, onStatus: (status) => send('status', status) });

  logger.onEntry((entry) => send('log', entry));
  createDashboard();
  buildMenu();
  bridge.createWindow(true);
  logger.info('App gestartet. Melde dich im Spielfenster an, danach die Doerfer einlesen.');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createDashboard();
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
  logs: logger.history()
}));

ipcMain.handle('automation:start', () => scheduler.start());
ipcMain.handle('automation:stop', () => scheduler.stop('Von Hand angehalten'));

ipcMain.handle('config:patch', (_event, patch) => store.patch(patch));

ipcMain.handle('window:game', () => bridge.setVisible(!bridge.isVisible()));

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

ipcMain.handle('probe', async () => {
  const probe = await bridge.probe();
  logger.info(`Statusabfrage: ${probe && probe.loggedIn ? 'angemeldet' : 'nicht angemeldet'}`);
  return probe;
});
