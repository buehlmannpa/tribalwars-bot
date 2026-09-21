'use strict';

// Oberflaeche. Sie haelt keinen eigenen Zustand, sondern spiegelt immer das,
// was der Hauptprozess als Wahrheit fuehrt.
let state = { config: null, status: null };
const selected = new Set();

const $ = (id) => document.getElementById(id);

async function refresh() {
  const data = await window.api.invoke('state:get');
  state.config = data.config;
  state.status = data.status;
  renderAll();
  for (const entry of data.logs) appendLog(entry);
}

function renderAll() {
  renderStatus(state.status);
  renderVillages();
  renderWorld();
  renderTemplateLists();
  renderSettings();
  renderKeyHints();
  $('world').textContent = state.config.world.label + ' - ' + state.config.world.host;
}

function renderStatus(status) {
  if (!status) return;
  state.status = status;
  const badge = $('badge');
  if (status.running && status.observeOnly) {
    badge.textContent = 'beobachtet';
    badge.className = 'badge observe';
  } else {
    badge.textContent = status.running ? 'laeuft' : 'angehalten';
    badge.className = 'badge ' + (status.running ? 'running' : 'stopped');
  }
  const parts = [];
  if (status.pauseReason) parts.push(status.pauseReason);
  if (status.probe && status.probe.features) {
    parts.push(status.probe.features.premium ? 'Premium aktiv' : 'ohne Premium');
  }
  parts.push(`${status.actionsLastHour} Aktionen in der letzten Stunde`);
  if (status.running && status.nextTickAt) {
    const seconds = Math.max(0, Math.round((status.nextTickAt - Date.now()) / 1000));
    parts.push(`naechster Durchlauf in ${seconds} Sekunden`);
  }
  $('statusText').textContent = parts.join(' - ');
}

function renderVillages() {
  const body = document.querySelector('#villageTable tbody');
  const villages = Object.values(state.config.villages);
  body.innerHTML = '';
  for (const id of [...selected]) if (!state.config.villages[id]) selected.delete(id);
  if (!villages.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="10" class="muted">Noch keine Doerfer. Melde dich im Spielfenster an und klicke auf Welt einlesen.</td>';
    body.appendChild(row);
    renderSelectionCount();
    return;
  }
  for (const village of villages.sort((a, b) => (a.name || '').localeCompare(b.name || ''))) {
    const row = document.createElement('tr');
    if (selected.has(village.id)) row.classList.add('selected');
    row.appendChild(tickCell(village, row));
    row.appendChild(cell(village.name || village.id));
    row.appendChild(cell(village.coords || ''));
    row.appendChild(cell(village.points ? String(village.points) : '?'));
    row.appendChild(cell(village.popMax ? `${village.pop} / ${village.popMax}` : '?'));
    row.appendChild(selectCell(Object.keys(state.config.buildTemplates), village.buildTemplate, (value) => {
      update(village.id, { buildTemplate: value || null });
    }));
    row.appendChild(checkCell(village.buildActive, (checked) => update(village.id, { buildActive: checked })));
    row.appendChild(selectCell(Object.keys(state.config.troopTemplates), village.troopTemplate, (value) => {
      update(village.id, { troopTemplate: value || null });
    }));
    row.appendChild(checkCell(village.troopActive, (checked) => update(village.id, { troopActive: checked })));
    row.appendChild(cell(village.lastRun ? new Date(village.lastRun).toLocaleTimeString('de-CH') : 'noch nie'));
    body.appendChild(row);
  }
  renderSelectionCount();
}

// Auswahl fuer die Sammelzuweisung
function tickCell(village, row) {
  const td = document.createElement('td');
  td.className = 'tick';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = selected.has(village.id);
  input.addEventListener('change', () => {
    if (input.checked) selected.add(village.id); else selected.delete(village.id);
    row.classList.toggle('selected', input.checked);
    renderSelectionCount();
  });
  td.appendChild(input);
  return td;
}

function renderSelectionCount() {
  const count = selected.size;
  $('selCount').textContent = count === 1 ? '1 Dorf ausgewaehlt' : `${count} Doerfer ausgewaehlt`;
  const all = Object.keys(state.config.villages);
  $('selAll').checked = all.length > 0 && count === all.length;
}

async function assignToSelection(patch, was) {
  if (!selected.size) return;
  state.config = await window.api.invoke('villages:assign', { ids: [...selected], patch });
  renderVillages();
  appendLog({ ts: Date.now(), level: 'info', message: `${was} fuer ${selected.size} Doerfer gesetzt` });
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function selectCell(options, value, onChange) {
  const td = document.createElement('td');
  const select = document.createElement('select');
  select.appendChild(new Option('keine', ''));
  for (const option of options) select.appendChild(new Option(option, option));
  select.value = value || '';
  select.addEventListener('change', () => onChange(select.value));
  td.appendChild(select);
  return td;
}

function checkCell(checked, onChange) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);
  input.addEventListener('change', () => onChange(input.checked));
  td.appendChild(input);
  return td;
}

async function update(id, patch) {
  state.config = await window.api.invoke('village:update', { id, patch });
  renderVillages();
}

// Vorlagen werden als einfache Textzeilen bearbeitet, das ist schneller als
// jedes Formular und laesst sich kopieren.
function renderTemplateLists() {
  fillSelect($('buildSelect'), Object.keys(state.config.buildTemplates));
  fillSelect($('troopSelect'), Object.keys(state.config.troopTemplates));
  fillAssign($('assignBuild'), Object.keys(state.config.buildTemplates));
  fillAssign($('assignTroop'), Object.keys(state.config.troopTemplates));
  loadBuildTemplate();
  loadTroopTemplate();
}

function fillAssign(select, names) {
  const current = select.value;
  select.innerHTML = '';
  select.appendChild(new Option('keine Vorlage', ''));
  for (const name of names) select.appendChild(new Option(name, name));
  if (current) select.value = current;
}

function fillSelect(select, names) {
  const current = select.value;
  select.innerHTML = '';
  for (const name of names) select.appendChild(new Option(name, name));
  if (names.includes(current)) select.value = current;
}

function loadBuildTemplate() {
  const name = $('buildSelect').value;
  const template = state.config.buildTemplates[name] || [];
  $('buildName').value = name || '';
  $('buildBody').value = template.map(([key, level]) => `${key} ${level}`).join('\n');
  $('buildCount').textContent = `${template.length} Auftraege`;
}

function loadTroopTemplate() {
  const name = $('troopSelect').value;
  const template = state.config.troopTemplates[name] || {};
  $('troopName').value = name || '';
  $('troopBody').value = Object.entries(template).map(([key, amount]) => `${key} ${amount}`).join('\n');
  $('troopCount').textContent = `${Object.keys(template).length} Einheiten`;
}

const BUILD_KEYS = [
  ['main', 'Hauptgebaeude'], ['barracks', 'Kaserne'], ['stable', 'Stall'], ['garage', 'Werkstatt'],
  ['church', 'Kirche'], ['snob', 'Adelshof'], ['smith', 'Schmiede'], ['place', 'Versammlungsplatz'],
  ['statue', 'Statue'], ['market', 'Marktplatz'], ['wood', 'Holzfaeller'], ['stone', 'Lehmgrube'],
  ['iron', 'Eisenmine'], ['farm', 'Bauernhof'], ['storage', 'Speicher'], ['hide', 'Versteck'],
  ['wall', 'Wall'], ['watchtower', 'Wachturm']
];
const UNIT_KEYS = [
  ['spear', 'Speertraeger'], ['sword', 'Schwertkaempfer'], ['axe', 'Axtkaempfer'],
  ['archer', 'Bogenschuetze'], ['spy', 'Spaeher'], ['light', 'Leichte Kavallerie'],
  ['marcher', 'Berittener Bogenschuetze'], ['heavy', 'Schwere Kavallerie'],
  ['ram', 'Ramme'], ['catapult', 'Katapult']
];

function renderKeyHints() {
  if (!$('buildPickKey').options.length) {
    for (const [key, name] of BUILD_KEYS) $('buildPickKey').appendChild(new Option(`${name} (${key})`, key));
    for (const [key, name] of UNIT_KEYS) $('troopPickKey').appendChild(new Option(`${name} (${key})`, key));
  }
  $('buildKeys').textContent = 'Gueltige Gebaeude: ' + BUILD_KEYS.map(([k]) => k).join(' ');
  $('troopKeys').textContent = 'Gueltige Einheiten: ' + UNIT_KEYS.map(([k]) => k).join(' ');
}

const B_SHORT = {
  main: 'Hauptgebaeude', barracks: 'Kaserne', stable: 'Stall', garage: 'Werkstatt',
  church: 'Kirche', snob: 'Adelshof', smith: 'Schmiede', place: 'Versammlungsplatz',
  statue: 'Statue', market: 'Marktplatz', wood: 'Holzfaeller', stone: 'Lehmgrube',
  iron: 'Eisenmine', farm: 'Bauernhof', storage: 'Speicher', hide: 'Versteck',
  wall: 'Wall', watchtower: 'Wachturm'
};
const U_SHORT = {
  spear: 'Speer', sword: 'Schwert', axe: 'Axt', archer: 'Bogen', spy: 'Spaeher',
  light: 'LKav', marcher: 'BBogen', heavy: 'SKav', ram: 'Ramme', catapult: 'Kata',
  knight: 'Paladin', snob: 'Adel', militia: 'Miliz'
};

// Die Weltuebersicht zeigt, was beim Einlesen gefunden wurde.
function renderWorld() {
  const box = $('worldView');
  const villages = Object.values(state.config.villages)
    .sort((a, b) => (b.points || 0) - (a.points || 0));
  box.innerHTML = '';
  if (!villages.length) {
    box.innerHTML = '<p class="muted">Noch nichts eingelesen. Melde dich im Spielfenster an und klicke auf Welt einlesen.</p>';
    return;
  }
  for (const village of villages) {
    const card = document.createElement('div');
    card.className = 'vcard';

    const title = document.createElement('h3');
    title.textContent = village.name || village.id;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const parts = [village.coords || '', village.continent || ''];
    if (village.points) parts.push(`${village.points} Punkte`);
    if (village.popMax) parts.push(`Bauernhof ${village.pop} von ${village.popMax}`);
    if (village.resources) {
      parts.push(`Holz ${village.resources.wood}, Lehm ${village.resources.stone}, Eisen ${village.resources.iron} von ${village.resources.storage}`);
    }
    if (village.scannedAt) parts.push(`gelesen um ${new Date(village.scannedAt).toLocaleTimeString('de-CH')}`);
    meta.textContent = parts.filter(Boolean).join(' · ');
    card.appendChild(meta);

    card.appendChild(chipBlock('Gebaeude', village.levels, B_SHORT, 'noch nicht eingelesen'));
    card.appendChild(chipBlock('Truppen daheim', village.unitsHome, U_SHORT, 'keine Einheiten daheim'));
    card.appendChild(chipBlock('Truppen gesamt', village.units, U_SHORT, 'keine Einheiten'));
    box.appendChild(card);
  }
}

function chipBlock(label, values, names, emptyText) {
  const block = document.createElement('div');
  block.className = 'block';
  const head = document.createElement('b');
  head.textContent = label;
  block.appendChild(head);
  const chips = document.createElement('div');
  chips.className = 'chips';
  const entries = Object.entries(values || {}).filter(([, value]) => Number(value) > 0);
  if (!entries.length) {
    const chip = document.createElement('span');
    chip.className = 'chip empty';
    chip.textContent = emptyText;
    chips.appendChild(chip);
  }
  for (const [key, value] of entries) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${names[key] || key} ${value}`;
    chips.appendChild(chip);
  }
  block.appendChild(chips);
  return block;
}

function renderSettings() {
  const a = state.config.automation;
  $('observeBanner').hidden = !a.observeOnly;
  $('host').value = state.config.world.host;
  $('minDelay').value = a.minDelaySeconds;
  $('maxDelay').value = a.maxDelaySeconds;
  $('maxActions').value = a.maxActionsPerHour;
  $('cooldown').value = a.villageCooldownMinutes;
  $('keepQueue').value = a.keepQueueFilled;
  $('farmBuffer').value = a.farmBuffer;
  $('minBatch').value = a.minRecruitBatch;
  $('priority').value = a.priority;
  $('bufWood').value = a.resourceBuffer.wood;
  $('bufStone').value = a.resourceBuffer.stone;
  $('bufIron').value = a.resourceBuffer.iron;
  $('observeOnly').checked = a.observeOnly;
  $('notifyCaptcha').checked = a.notifications.captcha;
  $('notifyLogin').checked = a.notifications.login;
  $('notifyIncoming').checked = a.notifications.incoming;
  $('pauseIncoming').checked = a.pauseOnIncoming;
  $('keepAwake').checked = a.keepAwake;
  $('nightEnabled').checked = a.nightPause.enabled;
  $('nightStart').value = a.nightPause.startHour;
  $('nightEnd').value = a.nightPause.endHour;
}

async function saveSettings() {
  state.config = await window.api.invoke('config:patch', {
    world: { host: $('host').value.trim() },
    automation: {
      minDelaySeconds: Number($('minDelay').value),
      maxDelaySeconds: Number($('maxDelay').value),
      maxActionsPerHour: Number($('maxActions').value),
      villageCooldownMinutes: Number($('cooldown').value),
      keepQueueFilled: Number($('keepQueue').value),
      farmBuffer: Number($('farmBuffer').value),
      minRecruitBatch: Number($('minBatch').value),
      priority: $('priority').value,
      resourceBuffer: {
        wood: Number($('bufWood').value),
        stone: Number($('bufStone').value),
        iron: Number($('bufIron').value)
      },
      observeOnly: $('observeOnly').checked,
      notifications: {
        captcha: $('notifyCaptcha').checked,
        login: $('notifyLogin').checked,
        incoming: $('notifyIncoming').checked
      },
      pauseOnIncoming: $('pauseIncoming').checked,
      keepAwake: $('keepAwake').checked,
      nightPause: {
        enabled: $('nightEnabled').checked,
        startHour: Number($('nightStart').value),
        endHour: Number($('nightEnd').value)
      }
    }
  });
}

function appendLog(entry) {
  const log = $('log');
  const line = document.createElement('div');
  line.className = entry.level;
  const time = new Date(entry.ts).toLocaleTimeString('de-CH');
  line.textContent = `${time}  ${entry.message}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

// Ereignisse verdrahten
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab).classList.add('active');
  });
});

$('btnStart').addEventListener('click', async () => renderStatus(await window.api.invoke('automation:start')));
$('btnStop').addEventListener('click', async () => renderStatus(await window.api.invoke('automation:stop')));
$('btnGame').addEventListener('click', () => window.api.invoke('window:game'));
$('btnGoLive').addEventListener('click', async () => {
  state.config = await window.api.invoke('config:patch', { automation: { observeOnly: false } });
  renderSettings();
  appendLog({ ts: Date.now(), level: 'warn', message: 'Beobachtungsmodus ausgeschaltet, die App handelt ab jetzt selbstaendig' });
});
$('btnProbe').addEventListener('click', () => window.api.invoke('probe'));
$('btnCapture').addEventListener('click', () => window.api.invoke('capture', { label: 'seite' }));
$('btnClearLog').addEventListener('click', () => { $('log').innerHTML = ''; });

async function scanWorld(button) {
  const labels = ['btnScan', 'btnScan2'];
  for (const id of labels) $(id).disabled = true;
  $('scanHint').textContent = 'Welt wird eingelesen, das Spielfenster arbeitet im Hintergrund.';
  try {
    const result = await window.api.invoke('world:scan');
    if (result && result.config) {
      state.config = result.config;
      renderVillages();
      renderWorld();
      $('scanHint').textContent = `${result.scanned} von ${result.count} Doerfern vollstaendig eingelesen.`;
    } else {
      $('scanHint').textContent = result && result.error ? result.error : 'Einlesen fehlgeschlagen.';
    }
  } finally {
    for (const id of labels) $(id).disabled = false;
  }
}

$('btnScan').addEventListener('click', () => scanWorld());
$('btnScan2').addEventListener('click', () => scanWorld());

window.api.on('scan', (progress) => {
  if (!progress) return;
  $('scanHint').textContent = progress.village
    ? `Lese ${progress.village}, Dorf ${progress.done + 1} von ${progress.total}`
    : `${progress.total} Doerfer gelesen`;
});

$('buildSelect').addEventListener('change', loadBuildTemplate);
$('troopSelect').addEventListener('change', loadTroopTemplate);

$('btnSaveBuild').addEventListener('click', async () => {
  const name = $('buildName').value.trim();
  if (!name) return;
  const value = $('buildBody').value.split('\n')
    .map((line) => line.trim()).filter(Boolean)
    .map((line) => { const [key, level] = line.split(/\s+/); return [key, Number(level)]; })
    .filter(([key, level]) => key && Number.isFinite(level));
  state.config = await window.api.invoke('template:save', { kind: 'build', name, value });
  renderTemplateLists();
  renderVillages();
});

$('btnDeleteBuild').addEventListener('click', async () => {
  state.config = await window.api.invoke('template:delete', { kind: 'build', name: $('buildSelect').value });
  renderTemplateLists();
  renderVillages();
});

$('btnSaveTroop').addEventListener('click', async () => {
  const name = $('troopName').value.trim();
  if (!name) return;
  const value = {};
  for (const line of $('troopBody').value.split('\n')) {
    const [key, amount] = line.trim().split(/\s+/);
    if (key && Number.isFinite(Number(amount))) value[key] = Number(amount);
  }
  state.config = await window.api.invoke('template:save', { kind: 'troop', name, value });
  renderTemplateLists();
  renderVillages();
});

$('btnDeleteTroop').addEventListener('click', async () => {
  state.config = await window.api.invoke('template:delete', { kind: 'troop', name: $('troopSelect').value });
  renderTemplateLists();
  renderVillages();
});

for (const id of ['host', 'minDelay', 'maxDelay', 'maxActions', 'cooldown', 'keepQueue', 'farmBuffer',
  'minBatch', 'priority', 'bufWood', 'bufStone', 'bufIron', 'observeOnly',
  'notifyCaptcha', 'notifyLogin', 'notifyIncoming',
  'pauseIncoming', 'keepAwake', 'nightEnabled', 'nightStart', 'nightEnd']) {
  $(id).addEventListener('change', saveSettings);
}

// Sammelzuweisung
$('selAll').addEventListener('change', () => {
  selected.clear();
  if ($('selAll').checked) for (const id of Object.keys(state.config.villages)) selected.add(id);
  renderVillages();
});
$('btnAssignBuild').addEventListener('click', () =>
  assignToSelection({ buildTemplate: $('assignBuild').value || null }, 'Bauvorlage'));
$('btnAssignTroop').addEventListener('click', () =>
  assignToSelection({ troopTemplate: $('assignTroop').value || null }, 'Truppenvorlage'));
$('btnActivate').addEventListener('click', () =>
  assignToSelection({ buildActive: true, troopActive: true }, 'Automatik aktiv'));
$('btnDeactivate').addEventListener('click', () =>
  assignToSelection({ buildActive: false, troopActive: false }, 'Automatik pausiert'));

// Vorlagen verwalten
$('btnNewBuild').addEventListener('click', () => {
  $('buildName').value = '';
  $('buildBody').value = '';
  $('buildCount').textContent = 'neue Vorlage';
  $('buildName').focus();
});
$('btnCopyBuild').addEventListener('click', () => {
  $('buildName').value = ($('buildSelect').value || 'Vorlage') + ' Kopie';
  $('buildCount').textContent = 'Kopie, noch nicht gespeichert';
  $('buildName').focus();
});
$('btnAddOrder').addEventListener('click', () => {
  const line = `${$('buildPickKey').value} ${Number($('buildPickLevel').value)}`;
  const body = $('buildBody');
  body.value = body.value.trim() ? `${body.value.replace(/\n+$/, '')}\n${line}` : line;
  body.scrollTop = body.scrollHeight;
});
$('btnNewTroop').addEventListener('click', () => {
  $('troopName').value = '';
  $('troopBody').value = '';
  $('troopCount').textContent = 'neue Vorlage';
  $('troopName').focus();
});
$('btnCopyTroop').addEventListener('click', () => {
  $('troopName').value = ($('troopSelect').value || 'Vorlage') + ' Kopie';
  $('troopCount').textContent = 'Kopie, noch nicht gespeichert';
  $('troopName').focus();
});
$('btnAddUnit').addEventListener('click', () => {
  const key = $('troopPickKey').value;
  const amount = Number($('troopPickAmount').value);
  const lines = $('troopBody').value.split('\n').filter((l) => l.trim() && l.trim().split(/\s+/)[0] !== key);
  lines.push(`${key} ${amount}`);
  $('troopBody').value = lines.join('\n');
});

window.api.on('status', renderStatus);
window.api.on('log', appendLog);
setInterval(() => renderStatus(state.status), 1000);

refresh();
