'use strict';

// Oberflaeche. Sie haelt keinen eigenen Zustand, sondern spiegelt immer das,
// was der Hauptprozess als Wahrheit fuehrt.
const $ = (id) => document.getElementById(id);
const state = { config: null, status: null, logs: [], logLevel: 'all' };
const selected = new Set();

const BUILDINGS = [
  ['main', 'Hauptgebaeude', 30], ['barracks', 'Kaserne', 25], ['stable', 'Stall', 20],
  ['garage', 'Werkstatt', 15], ['church', 'Kirche', 3], ['snob', 'Adelshof', 1],
  ['smith', 'Schmiede', 20], ['place', 'Versammlungsplatz', 1], ['statue', 'Statue', 1],
  ['market', 'Marktplatz', 25], ['wood', 'Holzfaeller', 30], ['stone', 'Lehmgrube', 30],
  ['iron', 'Eisenmine', 30], ['farm', 'Bauernhof', 30], ['storage', 'Speicher', 30],
  ['hide', 'Versteck', 10], ['wall', 'Wall', 20], ['watchtower', 'Wachturm', 20]
];
const UNITS = [
  ['spear', 'Speertraeger'], ['sword', 'Schwertkaempfer'], ['axe', 'Axtkaempfer'],
  ['archer', 'Bogenschuetze'], ['spy', 'Spaeher'], ['light', 'Leichte Kavallerie'],
  ['marcher', 'Berittener Bogenschuetze'], ['heavy', 'Schwere Kavallerie'],
  ['ram', 'Ramme'], ['catapult', 'Katapult']
];
const B_NAME = Object.fromEntries(BUILDINGS.map(([k, n]) => [k, n]));
const B_MAX = Object.fromEntries(BUILDINGS.map(([k, , m]) => [k, m]));
const U_NAME = Object.fromEntries(UNITS);

const pct = (value, max) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);
const nf = (value) => Number(value || 0).toLocaleString('de-CH');

// ---------------------------------------------------------------- Bausteine

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Ein beschrifteter Balken. Er zeigt auf einen Blick, wie weit etwas ist.
function meter(label, value, max, tone, suffix) {
  const box = el('div', 'meter');
  const top = el('div', 'top');
  top.appendChild(el('span', null, label));
  const right = el('b', null, suffix !== undefined ? suffix : `${nf(value)} / ${nf(max)}`);
  top.appendChild(right);
  const track = el('div', 'track');
  const fill = el('div', `fill ${tone}`);
  fill.style.width = `${pct(value, max)}%`;
  track.appendChild(fill);
  box.appendChild(top);
  box.appendChild(track);
  return box;
}

// Ein Ring fuer den Gesamtfortschritt eines Plans.
function ring(percent, caption) {
  const size = 62;
  const r = 25;
  const c = 2 * Math.PI * r;
  const wrap = el('div', 'ringwrap');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.innerHTML = `
    <circle cx="31" cy="31" r="${r}" fill="none" stroke="rgba(74,47,18,.16)" stroke-width="6"/>
    <circle cx="31" cy="31" r="${r}" fill="none" stroke="#8a5a1c" stroke-width="6"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c - (c * percent) / 100}"
      transform="rotate(-90 31 31)"/>
    <text x="31" y="35" text-anchor="middle">${Math.round(percent)}%</text>`;
  wrap.appendChild(svg);
  wrap.appendChild(el('span', null, caption));
  return wrap;
}

function buildProgress(village) {
  const template = state.config.buildTemplates[village.buildTemplate];
  if (!template || !template.length || !village.levels) return null;
  const done = template.filter(([key, target]) => Number(village.levels[key] || 0) >= target).length;
  return { done, total: template.length, percent: pct(done, template.length) };
}

function troopProgress(village) {
  const template = state.config.troopTemplates[village.troopTemplate];
  if (!template || !Object.keys(template).length) return null;
  const stock = village.units || {};
  let have = 0;
  let want = 0;
  for (const [unit, target] of Object.entries(template)) {
    want += Number(target);
    have += Math.min(Number(target), Number(stock[unit] || 0));
  }
  return { have, want, percent: pct(have, want) };
}

// ---------------------------------------------------------------- Kopfzeile

function renderStatus(status) {
  if (status) state.status = status;
  const current = state.status;
  if (!current) return;
  const badge = $('badge');
  if (current.running && current.observeOnly) {
    badge.textContent = 'beobachtet';
    badge.className = 'pill observe';
  } else if (current.running) {
    badge.textContent = 'laeuft';
    badge.className = 'pill running';
  } else {
    badge.textContent = 'angehalten';
    badge.className = 'pill stopped';
  }
  $('btnStart').hidden = Boolean(current.running);
  $('btnStop').hidden = !current.running;

  const parts = [];
  if (current.pauseReason) parts.push(current.pauseReason);
  if (current.probe && current.probe.features) {
    parts.push(current.probe.features.premium ? 'Premium aktiv' : 'ohne Premium');
  }
  parts.push(`${current.actionsLastHour} Aktionen in der letzten Stunde`);
  if (current.running && current.nextTickAt) {
    const seconds = Math.max(0, Math.round((current.nextTickAt - Date.now()) / 1000));
    parts.push(`naechster Durchlauf in ${seconds} s`);
  }
  $('statusText').textContent = parts.join(' · ');
}

// ---------------------------------------------------------------- Doerfer

function renderVillages() {
  const box = $('villageList');
  box.innerHTML = '';
  const villages = Object.values(state.config.villages);
  for (const id of [...selected]) if (!state.config.villages[id]) selected.delete(id);

  if (!villages.length) {
    box.appendChild(el('div', 'card empty', 'Noch keine Doerfer. Melde dich in der Spielansicht an und lies die Welt ein.'));
    renderSelection();
    return;
  }

  for (const village of villages.sort((a, b) => (a.name || '').localeCompare(b.name || ''))) {
    box.appendChild(villageCard(village));
  }
  renderSelection();
}

function villageCard(village) {
  const card = el('div', 'village');
  if (selected.has(village.id)) card.classList.add('selected');

  const tick = el('input');
  tick.type = 'checkbox';
  tick.checked = selected.has(village.id);
  tick.addEventListener('change', () => {
    if (tick.checked) selected.add(village.id); else selected.delete(village.id);
    card.classList.toggle('selected', tick.checked);
    renderSelection();
  });
  card.appendChild(tick);

  const body = el('div');
  const head = el('div', 'head');
  head.appendChild(el('span', 'name', village.name || village.id));
  head.appendChild(el('span', 'coord', village.coords || ''));
  if (village.points) head.appendChild(el('span', 'badge-soft', `${nf(village.points)} Punkte`));
  head.appendChild(el('span', `badge-soft ${village.buildActive ? 'on' : 'off'}`, village.buildActive ? 'Bauen an' : 'Bauen aus'));
  head.appendChild(el('span', `badge-soft ${village.troopActive ? 'on' : 'off'}`, village.troopActive ? 'Rekrutieren an' : 'Rekrutieren aus'));
  head.appendChild(el('span', `badge-soft ${village.farmActive ? 'on' : 'off'}`, village.farmActive ? 'Farmen an' : 'Farmen aus'));
  body.appendChild(head);

  const res = village.resources;
  const meters = el('div', 'meters');
  if (res) {
    meters.appendChild(meter('Holz', res.wood, res.storage, res.wood >= res.storage ? 'full' : 'wood'));
    meters.appendChild(meter('Lehm', res.stone, res.storage, res.stone >= res.storage ? 'full' : 'clay'));
    meters.appendChild(meter('Eisen', res.iron, res.storage, res.iron >= res.storage ? 'full' : 'iron'));
  }
  if (village.popMax) {
    const free = village.popMax - village.pop;
    meters.appendChild(meter('Bauernhof', village.pop, village.popMax, free < village.popMax * 0.1 ? 'full' : 'farm', `${nf(free)} frei`));
  }
  if (meters.children.length) body.appendChild(meters);

  const plans = el('div', 'plans');
  plans.appendChild(planSelect(Object.keys(state.config.buildTemplates), village.buildTemplate,
    (value) => update(village.id, { buildTemplate: value || null }), 'Bauplan'));
  plans.appendChild(planSelect(Object.keys(state.config.troopTemplates), village.troopTemplate,
    (value) => update(village.id, { troopTemplate: value || null }), 'Truppenplan'));
  plans.appendChild(el('span', 'sub', village.lastRun
    ? `zuletzt ${new Date(village.lastRun).toLocaleTimeString('de-CH')}`
    : 'noch kein Durchlauf'));
  body.appendChild(plans);
  card.appendChild(body);

  const rings = el('div', 'plans');
  const build = buildProgress(village);
  const troops = troopProgress(village);
  if (build) rings.appendChild(ring(build.percent, 'Bauplan'));
  if (troops) rings.appendChild(ring(troops.percent, 'Truppen'));
  card.appendChild(rings);
  return card;
}

function planSelect(options, value, onChange, label) {
  const wrap = el('label', 'field', label);
  const select = el('select');
  select.appendChild(new Option('keine', ''));
  for (const option of options) select.appendChild(new Option(option, option));
  select.value = value || '';
  select.addEventListener('change', () => onChange(select.value));
  wrap.appendChild(select);
  return wrap;
}

function renderSelection() {
  const count = selected.size;
  $('selCount').textContent = count === 1 ? '1 Dorf ausgewaehlt' : `${count} Doerfer ausgewaehlt`;
  const all = Object.keys(state.config.villages);
  $('selAll').checked = all.length > 0 && count === all.length;
}

async function update(id, patch) {
  state.config = await window.api.invoke('village:update', { id, patch });
  renderVillages();
  renderWorld();
}

async function assignToSelection(patch, was) {
  if (!selected.size) { $('scanHint').textContent = 'Zuerst Doerfer ankreuzen.'; return; }
  const count = selected.size;
  state.config = await window.api.invoke('villages:assign', { ids: [...selected], patch });
  renderVillages();
  renderWorld();
  $('scanHint').textContent = `${was} fuer ${count} Doerfer gesetzt.`;
}

// ---------------------------------------------------------------- Weltuebersicht

function renderWorld() {
  const box = $('worldView');
  box.innerHTML = '';
  let villages = Object.values(state.config.villages);
  const scanned = villages.filter((v) => v.scannedAt).length;
  $('worldMeta').textContent = villages.length
    ? `${scanned} von ${villages.length} Doerfern eingelesen`
    : '';

  if (!villages.length) {
    box.appendChild(el('div', 'card empty', 'Noch nichts eingelesen. Melde dich in der Spielansicht an und lies die Welt ein.'));
    return;
  }

  const sort = $('worldSort').value;
  villages = villages.sort((a, b) => {
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sort === 'farm') return ((b.popMax || 0) - (b.pop || 0)) - ((a.popMax || 0) - (a.pop || 0));
    if (sort === 'progress') {
      const pa = buildProgress(a) ? buildProgress(a).percent : 0;
      const pb = buildProgress(b) ? buildProgress(b).percent : 0;
      return pb - pa;
    }
    return (b.points || 0) - (a.points || 0);
  });

  for (const village of villages) box.appendChild(worldCard(village));
}

function worldCard(village) {
  const card = el('div', 'card');
  const head = el('div', 'head');
  head.appendChild(el('span', 'name', village.name || village.id));
  head.appendChild(el('span', 'coord', `${village.coords || ''} ${village.continent || ''}`.trim()));
  card.appendChild(head);

  const top = el('div', 'row');
  const build = buildProgress(village);
  const troops = troopProgress(village);
  if (build) top.appendChild(ring(build.percent, `Bauplan ${build.done}/${build.total}`));
  if (troops) top.appendChild(ring(troops.percent, 'Truppen'));
  if (village.points) {
    const points = el('div', 'ringwrap');
    points.appendChild(el('b', 'name', nf(village.points)));
    points.appendChild(el('span', null, 'Punkte'));
    top.appendChild(points);
  }
  card.appendChild(top);

  const res = village.resources;
  if (res) {
    const meters = el('div', 'stack');
    meters.appendChild(meter('Holz', res.wood, res.storage, res.wood >= res.storage ? 'full' : 'wood'));
    meters.appendChild(meter('Lehm', res.stone, res.storage, res.stone >= res.storage ? 'full' : 'clay'));
    meters.appendChild(meter('Eisen', res.iron, res.storage, res.iron >= res.storage ? 'full' : 'iron'));
    if (village.popMax) {
      meters.appendChild(meter('Bauernhof', village.pop, village.popMax, 'farm', `${nf(village.popMax - village.pop)} frei`));
    }
    card.appendChild(meters);
  }

  if (village.levels && Object.keys(village.levels).length) {
    card.appendChild(el('h3', null, 'Gebaeude'));
    const tiles = el('div', 'tiles');
    for (const [key, name, max] of BUILDINGS) {
      const level = Number(village.levels[key] || 0);
      if (!level) continue;
      const tile = el('div', 'tile');
      const t = el('div', 't');
      t.appendChild(el('span', null, name));
      t.appendChild(el('b', null, String(level)));
      const track = el('div', 'track');
      const fill = el('div', `fill ${level >= max ? 'ok' : 'farm'}`);
      fill.style.width = `${pct(level, max)}%`;
      track.appendChild(fill);
      tile.appendChild(t);
      tile.appendChild(track);
      tiles.appendChild(tile);
    }
    card.appendChild(tiles);
  }

  const template = state.config.troopTemplates[village.troopTemplate];
  const stock = village.units || {};
  const home = village.unitsHome || {};
  if (Object.keys(stock).length || template) {
    card.appendChild(el('h3', null, 'Truppen'));
    const list = el('div', 'stack');
    const keys = template ? Object.keys(template) : Object.keys(stock);
    for (const unit of keys) {
      const have = Number(stock[unit] || 0);
      const target = template ? Number(template[unit] || 0) : have;
      if (!have && !target) continue;
      const away = have - Number(home[unit] || 0);
      const suffix = target
        ? `${nf(have)} / ${nf(target)}${away > 0 ? ` · ${nf(away)} unterwegs` : ''}`
        : `${nf(have)}`;
      list.appendChild(meter(U_NAME[unit] || unit, have, target || have, have >= target ? 'ok' : 'farm', suffix));
    }
    card.appendChild(list);
  }

  if (village.scannedAt) {
    card.appendChild(el('p', 'hint', `gelesen um ${new Date(village.scannedAt).toLocaleTimeString('de-CH')}`));
  }
  return card;
}

// ---------------------------------------------------------------- Vorlagen

function renderTemplates() {
  fillSelect($('buildSelect'), Object.keys(state.config.buildTemplates));
  fillSelect($('troopSelect'), Object.keys(state.config.troopTemplates));
  fillAssign($('assignBuild'), Object.keys(state.config.buildTemplates));
  fillAssign($('assignTroop'), Object.keys(state.config.troopTemplates));
  if (!$('buildPickKey').options.length) {
    for (const [key, name] of BUILDINGS) $('buildPickKey').appendChild(new Option(name, key));
    for (const [key, name] of UNITS) $('troopPickKey').appendChild(new Option(name, key));
  }
  $('buildKeys').textContent = 'Gueltige Gebaeude: ' + BUILDINGS.map(([k]) => k).join(' ');
  $('troopKeys').textContent = 'Gueltige Einheiten: ' + UNITS.map(([k]) => k).join(' ');
  loadBuildTemplate();
  loadTroopTemplate();
}

function fillSelect(select, names) {
  const current = select.value;
  select.innerHTML = '';
  for (const name of names) select.appendChild(new Option(name, name));
  if (names.includes(current)) select.value = current;
}

function fillAssign(select, names) {
  const current = select.value;
  select.innerHTML = '';
  select.appendChild(new Option('keine Vorlage', ''));
  for (const name of names) select.appendChild(new Option(name, name));
  if (current) select.value = current;
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

// ---------------------------------------------------------------- Farmen

function renderFarm() {
  const farm = state.config.farm || { troops: {} };
  $('farmEnabled').checked = Boolean(farm.enabled);
  $('farmHours').value = farm.maxHours;
  $('farmWait').value = farm.minMinutesBetweenAttacks;

  const box = $('farmTroops');
  if (!box.children.length) {
    for (const [key, name] of UNITS) {
      const field = el('label', 'field', name);
      const input = el('input');
      input.type = 'number';
      input.min = '0';
      input.id = `farmUnit_${key}`;
      input.addEventListener('change', saveFarm);
      field.appendChild(input);
      box.appendChild(field);
    }
  }
  for (const [key] of UNITS) {
    const input = $(`farmUnit_${key}`);
    if (input) input.value = Number((farm.troops || {})[key] || 0);
  }

  const select = $('farmVillage');
  const current = select.value;
  select.innerHTML = '';
  for (const village of Object.values(state.config.villages)) {
    select.appendChild(new Option(`${village.name || village.id} ${village.coords || ''}`.trim(), village.id));
  }
  if (current) select.value = current;
}

async function saveFarm() {
  const troops = {};
  for (const [key] of UNITS) troops[key] = Number($(`farmUnit_${key}`).value || 0);
  state.config = await window.api.invoke('config:patch', {
    farm: {
      enabled: $('farmEnabled').checked,
      maxHours: Number($('farmHours').value),
      minMinutesBetweenAttacks: Number($('farmWait').value),
      troops
    }
  });
  renderFarm();
}

async function previewFarm() {
  const id = $('farmVillage').value;
  if (!id) return;
  $('farmSummary').textContent = 'Ziele werden gesucht.';
  $('farmTargets').innerHTML = '';
  const result = await window.api.invoke('farm:preview', { id });
  if (!result || !result.ok) {
    $('farmSummary').textContent = result && result.error ? result.error : 'Vorschau nicht moeglich.';
    return;
  }
  $('farmSummary').textContent = `${result.reachable} von ${result.total} Barbarendoerfern in Reichweite, das entspricht ${result.maxFields} Feldern.`
    + (result.next ? ` Als naechstes ${result.next}.` : ` ${result.reason || ''}`);

  const box = $('farmTargets');
  for (const target of result.nearest) {
    const row = el('div', 'meter');
    const top = el('div', 'top');
    top.appendChild(el('span', null, `${target.coords} · ${nf(target.points)} Punkte`));
    const wait = target.lastAttack
      ? `zuletzt ${new Date(target.lastAttack).toLocaleTimeString('de-CH')}`
      : 'noch nie';
    top.appendChild(el('b', null, `${target.minutes} min · ${target.fields} Felder · ${wait}`));
    row.appendChild(top);
    const track = el('div', 'track');
    const fill = el('div', 'fill farm');
    fill.style.width = `${pct(target.fields, result.maxFields)}%`;
    track.appendChild(fill);
    row.appendChild(track);
    box.appendChild(row);
  }
}

// ---------------------------------------------------------------- Einstellungen

function renderSettings() {
  const a = state.config.automation;
  $('observeBanner').hidden = !a.observeOnly;
  $('observeOnly').checked = a.observeOnly;
  $('host').value = state.config.world.host;
  $('minDelay').value = a.minDelaySeconds;
  $('maxDelay').value = a.maxDelaySeconds;
  $('maxActions').value = a.maxActionsPerHour;
  $('cooldown').value = a.villageCooldownMinutes;
  $('keepQueue').value = a.keepQueueFilled;
  $('minBatch').value = a.minRecruitBatch;
  $('farmBuffer').value = a.farmBuffer;
  $('priority').value = a.priority;
  $('bufWood').value = a.resourceBuffer.wood;
  $('bufStone').value = a.resourceBuffer.stone;
  $('bufIron').value = a.resourceBuffer.iron;
  $('pauseIncoming').checked = a.pauseOnIncoming;
  $('keepAwake').checked = a.keepAwake;
  $('nightEnabled').checked = a.nightPause.enabled;
  $('nightStart').value = a.nightPause.startHour;
  $('nightEnd').value = a.nightPause.endHour;
  $('notifyCaptcha').checked = a.notifications.captcha;
  $('notifyLogin').checked = a.notifications.login;
  $('notifyIncoming').checked = a.notifications.incoming;
  $('world').textContent = `${state.config.world.label} · ${state.config.world.host}`;
}

async function saveSettings() {
  state.config = await window.api.invoke('config:patch', {
    world: { host: $('host').value.trim() },
    automation: {
      observeOnly: $('observeOnly').checked,
      minDelaySeconds: Number($('minDelay').value),
      maxDelaySeconds: Number($('maxDelay').value),
      maxActionsPerHour: Number($('maxActions').value),
      villageCooldownMinutes: Number($('cooldown').value),
      keepQueueFilled: Number($('keepQueue').value),
      minRecruitBatch: Number($('minBatch').value),
      farmBuffer: Number($('farmBuffer').value),
      priority: $('priority').value,
      resourceBuffer: {
        wood: Number($('bufWood').value),
        stone: Number($('bufStone').value),
        iron: Number($('bufIron').value)
      },
      pauseOnIncoming: $('pauseIncoming').checked,
      keepAwake: $('keepAwake').checked,
      nightPause: {
        enabled: $('nightEnabled').checked,
        startHour: Number($('nightStart').value),
        endHour: Number($('nightEnd').value)
      },
      notifications: {
        captcha: $('notifyCaptcha').checked,
        login: $('notifyLogin').checked,
        incoming: $('notifyIncoming').checked
      }
    }
  });
  renderSettings();
  renderStatus();
}

// ---------------------------------------------------------------- Protokoll

// Gebuendelte Meldungen kommen mit derselben Kennung zurueck. Dann wird die
// vorhandene Zeile ersetzt und nach unten geholt, statt eine neue zu schreiben.
function appendLog(entry) {
  const vorhanden = state.logs.findIndex((alt) => alt.id !== undefined && alt.id === entry.id);
  if (vorhanden >= 0) state.logs.splice(vorhanden, 1);
  state.logs.push(entry);
  if (state.logs.length > 400) state.logs.shift();
  renderLog();
}

function renderLog() {
  const box = $('log');
  const wanted = state.logLevel;
  const rows = state.logs.filter((entry) => {
    if (wanted === 'all') return true;
    if (wanted === 'action') return entry.level === 'action';
    return entry.level === 'warn' || entry.level === 'error';
  });
  box.innerHTML = '';
  if (!rows.length) {
    box.appendChild(el('div', 'empty', 'Noch nichts zu berichten.'));
    return;
  }
  for (const entry of rows.slice(-200)) {
    const line = el('p');
    line.appendChild(el('time', null, new Date(entry.ts).toLocaleTimeString('de-CH')));
    line.appendChild(el('span', entry.level, entry.message));
    // Wiederholungen stehen als Zaehler am Ende der Zeile.
    if (Number(entry.count) > 1) {
      const seit = new Date(entry.firstTs || entry.ts).toLocaleTimeString('de-CH');
      const zaehler = el('span', 'repeat', `${entry.count} mal`);
      zaehler.title = `seit ${seit}`;
      line.appendChild(zaehler);
    }
    box.appendChild(line);
  }
  box.scrollTop = box.scrollHeight;
}

// ---------------------------------------------------------------- Welt einlesen

async function scanWorld() {
  const buttons = ['btnScan', 'btnScan2'];
  for (const id of buttons) $(id).disabled = true;
  $('scanHint').textContent = 'Welt wird eingelesen.';
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
    for (const id of buttons) $(id).disabled = false;
  }
}

// ---------------------------------------------------------------- Start

function renderAll() {
  renderSettings();
  renderFarm();
  renderTemplates();
  renderVillages();
  renderWorld();
  renderStatus();
}

async function refresh() {
  const data = await window.api.invoke('state:get');
  state.config = data.config;
  state.status = data.status;
  state.logs = data.logs || [];
  document.documentElement.style.setProperty('--game-width', `${data.gameWidth || 0}px`);
  renderAll();
  renderLog();
}

document.querySelectorAll('.seg').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.seg').forEach((t) => t.classList.remove('active'));
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
$('btnScan').addEventListener('click', scanWorld);
$('btnScan2').addEventListener('click', scanWorld);
$('worldSort').addEventListener('change', renderWorld);
$('btnClearLog').addEventListener('click', () => { state.logs = []; renderLog(); });

$('btnGoLive').addEventListener('click', async () => {
  state.config = await window.api.invoke('config:patch', { automation: { observeOnly: false } });
  renderSettings();
  appendLog({ ts: Date.now(), level: 'warn', message: 'Beobachtungsmodus ausgeschaltet, die App handelt ab jetzt selbstaendig' });
});

$('logFilter').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#logFilter .chip').forEach((c) => c.classList.remove('active'));
  chip.classList.add('active');
  state.logLevel = chip.dataset.level;
  renderLog();
});

$('selAll').addEventListener('change', () => {
  selected.clear();
  if ($('selAll').checked) for (const id of Object.keys(state.config.villages)) selected.add(id);
  renderVillages();
});
$('btnAssignBuild').addEventListener('click', () => assignToSelection({ buildTemplate: $('assignBuild').value || null }, 'Bauplan'));
$('btnAssignTroop').addEventListener('click', () => assignToSelection({ troopTemplate: $('assignTroop').value || null }, 'Truppenplan'));
$('btnActivate').addEventListener('click', () => assignToSelection({ buildActive: true, troopActive: true }, 'Automatik aktiv'));
$('btnFarmOn').addEventListener('click', () => assignToSelection({ farmActive: true }, 'Farmen aktiv'));
$('btnFarmOff').addEventListener('click', () => assignToSelection({ farmActive: false }, 'Farmen pausiert'));
$('btnFarmPreview').addEventListener('click', previewFarm);
$('btnWorldRefresh').addEventListener('click', async () => {
  $('worldDataInfo').textContent = 'Weltdaten werden geladen.';
  const result = await window.api.invoke('world:refresh');
  $('worldDataInfo').textContent = result && result.ok
    ? `${nf(result.villages)} Doerfer geladen, davon ${nf(result.barbarians)} Barbarendoerfer.`
    : `Laden fehlgeschlagen. ${result && result.error ? result.error : 'Grund unbekannt'}`;
});
for (const id of ['farmEnabled', 'farmHours', 'farmWait']) $(id).addEventListener('change', saveFarm);
$('btnDeactivate').addEventListener('click', () => assignToSelection({ buildActive: false, troopActive: false }, 'Automatik pausiert'));

$('buildSelect').addEventListener('change', loadBuildTemplate);
$('troopSelect').addEventListener('change', loadTroopTemplate);
$('btnNewBuild').addEventListener('click', () => { $('buildName').value = ''; $('buildBody').value = ''; $('buildName').focus(); });
$('btnCopyBuild').addEventListener('click', () => { $('buildName').value = ($('buildSelect').value || 'Vorlage') + ' Kopie'; $('buildName').focus(); });
$('btnNewTroop').addEventListener('click', () => { $('troopName').value = ''; $('troopBody').value = ''; $('troopName').focus(); });
$('btnCopyTroop').addEventListener('click', () => { $('troopName').value = ($('troopSelect').value || 'Vorlage') + ' Kopie'; $('troopName').focus(); });

$('btnAddOrder').addEventListener('click', () => {
  const line = `${$('buildPickKey').value} ${Number($('buildPickLevel').value)}`;
  const body = $('buildBody');
  body.value = body.value.trim() ? `${body.value.replace(/\n+$/, '')}\n${line}` : line;
  body.scrollTop = body.scrollHeight;
});
$('btnAddUnit').addEventListener('click', () => {
  const key = $('troopPickKey').value;
  const amount = Number($('troopPickAmount').value);
  const lines = $('troopBody').value.split('\n').filter((l) => l.trim() && l.trim().split(/\s+/)[0] !== key);
  lines.push(`${key} ${amount}`);
  $('troopBody').value = lines.join('\n');
});

$('btnSaveBuild').addEventListener('click', async () => {
  const name = $('buildName').value.trim();
  if (!name) return;
  const value = $('buildBody').value.split('\n')
    .map((line) => line.trim()).filter(Boolean)
    .map((line) => { const [key, level] = line.split(/\s+/); return [key, Number(level)]; })
    .filter(([key, level]) => B_NAME[key] && Number.isFinite(level));
  state.config = await window.api.invoke('template:save', { kind: 'build', name, value });
  renderTemplates();
  renderVillages();
  renderWorld();
});
$('btnDeleteBuild').addEventListener('click', async () => {
  state.config = await window.api.invoke('template:delete', { kind: 'build', name: $('buildSelect').value });
  renderTemplates();
  renderVillages();
});
$('btnSaveTroop').addEventListener('click', async () => {
  const name = $('troopName').value.trim();
  if (!name) return;
  const value = {};
  for (const line of $('troopBody').value.split('\n')) {
    const [key, amount] = line.trim().split(/\s+/);
    if (U_NAME[key] && Number.isFinite(Number(amount))) value[key] = Number(amount);
  }
  state.config = await window.api.invoke('template:save', { kind: 'troop', name, value });
  renderTemplates();
  renderVillages();
  renderWorld();
});
$('btnDeleteTroop').addEventListener('click', async () => {
  state.config = await window.api.invoke('template:delete', { kind: 'troop', name: $('troopSelect').value });
  renderTemplates();
  renderVillages();
});

for (const id of ['host', 'minDelay', 'maxDelay', 'maxActions', 'cooldown', 'keepQueue', 'minBatch',
  'farmBuffer', 'priority', 'bufWood', 'bufStone', 'bufIron', 'observeOnly',
  'pauseIncoming', 'keepAwake', 'nightEnabled', 'nightStart', 'nightEnd',
  'notifyCaptcha', 'notifyLogin', 'notifyIncoming']) {
  $(id).addEventListener('change', saveSettings);
}

window.api.on('status', renderStatus);
window.api.on('log', appendLog);
window.api.on('scan', (progress) => {
  if (!progress) return;
  $('scanHint').textContent = progress.village
    ? `Lese ${progress.village}, Dorf ${progress.done + 1} von ${progress.total}`
    : `${progress.total} Doerfer gelesen`;
});
window.api.on('layout', (info) => {
  document.documentElement.style.setProperty('--game-width', `${info && info.gameWidth ? info.gameWidth : 0}px`);
});

setInterval(() => renderStatus(), 1000);
refresh();
