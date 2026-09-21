'use strict';

// Oberflaeche. Sie haelt keinen eigenen Zustand, sondern spiegelt immer das,
// was der Hauptprozess als Wahrheit fuehrt.
let state = { config: null, status: null };

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
  renderTemplateLists();
  renderSettings();
  renderKeyHints();
  $('world').textContent = state.config.world.label + ' - ' + state.config.world.host;
}

function renderStatus(status) {
  if (!status) return;
  state.status = status;
  const badge = $('badge');
  badge.textContent = status.running ? 'laeuft' : 'angehalten';
  badge.className = 'badge ' + (status.running ? 'running' : 'stopped');
  const parts = [];
  if (status.pauseReason) parts.push(status.pauseReason);
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
  if (!villages.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="7" class="muted">Noch keine Doerfer. Melde dich im Spielfenster an und klicke auf Doerfer einlesen.</td>';
    body.appendChild(row);
    return;
  }
  for (const village of villages.sort((a, b) => (a.name || '').localeCompare(b.name || ''))) {
    const row = document.createElement('tr');
    row.appendChild(cell(village.name || village.id));
    row.appendChild(cell(village.coords || ''));
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
  loadBuildTemplate();
  loadTroopTemplate();
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
}

function loadTroopTemplate() {
  const name = $('troopSelect').value;
  const template = state.config.troopTemplates[name] || {};
  $('troopName').value = name || '';
  $('troopBody').value = Object.entries(template).map(([key, amount]) => `${key} ${amount}`).join('\n');
}

const BUILD_KEYS = 'main barracks stable garage church snob smith place statue market wood stone iron farm storage hide wall watchtower';
const UNIT_KEYS = 'spear sword axe archer spy light marcher heavy ram catapult';

function renderKeyHints() {
  $('buildKeys').textContent = 'Gueltige Gebaeude: ' + BUILD_KEYS;
  $('troopKeys').textContent = 'Gueltige Einheiten: ' + UNIT_KEYS;
}

function renderSettings() {
  const a = state.config.automation;
  $('host').value = state.config.world.host;
  $('minDelay').value = a.minDelaySeconds;
  $('maxDelay').value = a.maxDelaySeconds;
  $('maxActions').value = a.maxActionsPerHour;
  $('cooldown').value = a.villageCooldownMinutes;
  $('keepQueue').value = a.keepQueueFilled;
  $('farmBuffer').value = a.farmBuffer;
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
$('btnProbe').addEventListener('click', () => window.api.invoke('probe'));
$('btnCapture').addEventListener('click', () => window.api.invoke('capture', { label: 'seite' }));
$('btnClearLog').addEventListener('click', () => { $('log').innerHTML = ''; });

$('btnSync').addEventListener('click', async () => {
  const result = await window.api.invoke('villages:sync');
  if (result && result.config) { state.config = result.config; renderVillages(); }
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
  'pauseIncoming', 'keepAwake', 'nightEnabled', 'nightStart', 'nightEnd']) {
  $(id).addEventListener('change', saveSettings);
}

window.api.on('status', renderStatus);
window.api.on('log', appendLog);
setInterval(() => renderStatus(state.status), 1000);

refresh();
