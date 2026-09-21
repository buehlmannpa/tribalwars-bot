'use strict';

// Diese Schnipsel laufen direkt im Kontext der Spielseite. Sie duerfen nur
// einfache Werte zurueckgeben, weil sie ueber die Prozessgrenze wandern.
// Jeder Schnipsel faengt Fehler selbst ab, damit die App nie haengen bleibt.

const wrap = (body) => `(function () { try { ${body} } catch (err) {
  return { ok: false, error: String(err && err.message ? err.message : err) };
} })();`;

// Erkennt Botschutz, abgelaufene Sitzung und liest die Grunddaten der Seite.
const PROBE = wrap(`
  var url = String(location.href);
  var sessionExpired = /session-expired|page\\/logout/i.test(url);
  var visible = function (el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 40;
  };
  var captchaNode = document.querySelector('.bot-protection-row, #bot_check, .bot-protection, [class*="botprotection"]');
  var frame = Array.prototype.find.call(
    document.querySelectorAll('iframe'),
    function (f) { return /hcaptcha|recaptcha|captcha/i.test(f.src || '') && visible(f); }
  );
  var captcha = Boolean((captchaNode && visible(captchaNode)) || frame);
  var gd = window.game_data || null;
  return {
    ok: true,
    url: url,
    sessionExpired: sessionExpired,
    captcha: captcha,
    loggedIn: Boolean(gd && gd.village),
    screen: gd ? gd.screen : null,
    world: gd ? gd.world : null,
    player: gd ? { id: gd.player.id, name: gd.player.name, villages: Number(gd.player.villages || 0), incomings: Number(gd.player.incomings || 0) } : null,
    village: gd && gd.village ? {
      id: String(gd.village.id),
      name: gd.village.name,
      coords: gd.village.x + '|' + gd.village.y,
      wood: Math.floor(gd.village.wood),
      stone: Math.floor(gd.village.stone),
      iron: Math.floor(gd.village.iron),
      storage: Number(gd.village.storage_max),
      pop: Number(gd.village.pop),
      popMax: Number(gd.village.pop_max)
    } : null
  };
`);

// Liest die Dorfliste aus der Produktionsuebersicht.
const LIST_VILLAGES = wrap(`
  var rows = document.querySelectorAll('#production_table tr[id^="village_"], tr[id^="village_"]');
  var out = [];
  Array.prototype.forEach.call(rows, function (row) {
    var id = String(row.id).replace('village_', '');
    if (!/^\\d+$/.test(id)) return;
    var link = row.querySelector('a[href*="village=' + id + '"], span.quickedit-label');
    var text = link ? link.textContent.trim() : row.textContent.trim().split('\\n')[0];
    var coords = (text.match(/\\((\\d+)\\|(\\d+)\\)/) || [])[0] || '';
    out.push({ id: id, name: text.replace(/\\s*\\(\\d+\\|\\d+\\)\\s*K\\d+\\s*$/, '').trim(), coords: coords.replace(/[()]/g, '') });
  });
  return { ok: true, villages: out };
`);

// Liest Gebaeudestufen, Bauschleife und die gerade klickbaren Ausbauknoepfe.
const READ_BUILD = wrap(`
  var gd = window.game_data;
  if (!gd || !gd.village) return { ok: false, error: 'Keine Spieldaten auf der Seite' };
  var levels = {};
  var src = gd.village.buildings || {};
  Object.keys(src).forEach(function (key) { levels[key] = Number(src[key]); });
  var queueRows = document.querySelectorAll('#buildqueue tr[id^="buildorder_"]');
  var queue = [];
  Array.prototype.forEach.call(queueRows, function (row) {
    var label = row.querySelector('td');
    queue.push(label ? label.textContent.trim().replace(/\\s+/g, ' ') : 'Auftrag');
  });
  var names = {};
  var rows = document.querySelectorAll('tr[id^="main_buildrow_"]');
  Array.prototype.forEach.call(rows, function (row) {
    var key = String(row.id).replace('main_buildrow_', '');
    var cell = row.querySelector('td');
    if (cell) names[key] = cell.textContent.trim().replace(/\\s+/g, ' ').replace(/\\(.*$/, '').trim();
  });
  var buildable = {};
  Object.keys(levels).forEach(function (key) {
    var next = levels[key] + 1;
    var link = document.querySelector('#main_buildlink_' + key + '_' + next);
    if (!link) {
      link = document.querySelector('a.btn-build[href*="id=' + key + '"], a[href*="action=upgrade_building"][href*="id=' + key + '"]');
    }
    if (link && !/disabled/i.test(link.className)) buildable[key] = next;
  });
  return {
    ok: true,
    villageId: String(gd.village.id),
    levels: levels,
    queue: queue,
    queueLength: queue.length,
    buildable: buildable,
    names: names,
    resources: {
      wood: Math.floor(gd.village.wood),
      stone: Math.floor(gd.village.stone),
      iron: Math.floor(gd.village.iron),
      storage: Number(gd.village.storage_max)
    }
  };
`);

// Klickt den Ausbauknopf eines Gebaeudes, genau wie ein Mensch es taete.
const clickBuild = (key) => wrap(`
  var key = ${JSON.stringify(key)};
  var gd = window.game_data;
  if (!gd || !gd.village) return { ok: false, error: 'Keine Spieldaten auf der Seite' };
  var level = Number((gd.village.buildings || {})[key] || 0);
  var link = document.querySelector('#main_buildlink_' + key + '_' + (level + 1));
  if (!link) {
    link = document.querySelector('a.btn-build[href*="id=' + key + '"], a[href*="action=upgrade_building"][href*="id=' + key + '"]');
  }
  if (!link) return { ok: false, error: 'Kein Ausbauknopf fuer ' + key + ' gefunden' };
  if (/disabled/i.test(link.className)) return { ok: false, error: 'Ausbau fuer ' + key + ' gerade nicht moeglich' };
  link.click();
  return { ok: true, building: key, target: level + 1 };
`);

// Liest die Rekrutierungsseite aus.
const READ_TRAIN = wrap(`
  var gd = window.game_data;
  if (!gd || !gd.village) return { ok: false, error: 'Keine Spieldaten auf der Seite' };
  var form = document.querySelector('#train_form') || document.querySelector('form[action*="screen=train"]');
  if (!form) return { ok: false, error: 'Kein Rekrutierungsformular gefunden' };
  var units = {};
  var inputs = form.querySelectorAll('input[type="text"], input[type="number"]');
  Array.prototype.forEach.call(inputs, function (input) {
    var name = input.name;
    if (!name || name === 'h') return;
    var row = input.closest('tr');
    var present = null;
    var max = null;
    if (row) {
      var match = row.textContent.replace(/\\s+/g, ' ').match(/(\\d+)\\s*\\/\\s*(\\d+)/);
      if (match) { present = Number(match[1]); }
      var maxLink = row.querySelector('a[href*="javascript"], a.unit_link');
      if (maxLink) {
        var m2 = maxLink.textContent.match(/\\((\\d+)\\)/);
        if (m2) max = Number(m2[1]);
      }
    }
    units[name] = { present: present, max: max, disabled: Boolean(input.disabled) };
  });
  var queueRows = form.ownerDocument.querySelectorAll('#trainqueue_wrap tr[id^="trainorder_"], tr[id^="trainorder_"]');
  return {
    ok: true,
    villageId: String(gd.village.id),
    units: units,
    queueLength: queueRows.length,
    pop: Number(gd.village.pop),
    popMax: Number(gd.village.pop_max),
    resources: {
      wood: Math.floor(gd.village.wood),
      stone: Math.floor(gd.village.stone),
      iron: Math.floor(gd.village.iron)
    }
  };
`);

// Traegt Mengen ein und schickt den Rekrutierungsauftrag ab.
const submitTrain = (orders) => wrap(`
  var orders = ${JSON.stringify(orders)};
  var form = document.querySelector('#train_form') || document.querySelector('form[action*="screen=train"]');
  if (!form) return { ok: false, error: 'Kein Rekrutierungsformular gefunden' };
  var written = {};
  Object.keys(orders).forEach(function (unit) {
    var input = form.querySelector('[name="' + unit + '"]');
    if (!input || input.disabled) return;
    input.value = String(orders[unit]);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    written[unit] = orders[unit];
  });
  if (!Object.keys(written).length) return { ok: false, error: 'Keine passenden Eingabefelder gefunden' };
  var button = form.querySelector('input[type="submit"], .btn-recruit, button[type="submit"]');
  if (!button) return { ok: false, error: 'Kein Absendeknopf gefunden' };
  button.click();
  return { ok: true, ordered: written };
`);

// Liefert die rohe Seite, damit Auswahlpfade gegen die echte Welt geprueft werden koennen.
const CAPTURE = wrap(`
  return { ok: true, url: location.href, html: document.documentElement.outerHTML };
`);

module.exports = { PROBE, LIST_VILLAGES, READ_BUILD, READ_TRAIN, CAPTURE, clickBuild, submitTrain };
