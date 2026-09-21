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
    origin: location.origin,
    sessionExpired: sessionExpired,
    captcha: captcha,
    loggedIn: Boolean(gd && gd.village),
    screen: gd ? gd.screen : null,
    world: gd ? gd.world : null,
    features: gd && gd.features ? {
      premium: Boolean(gd.features.Premium && gd.features.Premium.active),
      accountManager: Boolean(gd.features.AccountManager && gd.features.AccountManager.active),
      farmAssistent: Boolean(gd.features.FarmAssistent && gd.features.FarmAssistent.active)
    } : null,
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
// Geprueft gegen Welt 96. Die Zeilen tragen keine Kennung, die Dorfnummer
// steht am Feld data-id der Schnellbearbeitung, Name und Koordinaten stehen
// in der Beschriftung daneben.
const LIST_VILLAGES = wrap(`
  var nodes = document.querySelectorAll('#production_table [data-id], [data-id].quickedit-vn');
  var seen = {};
  var out = [];
  Array.prototype.forEach.call(nodes, function (node) {
    var id = String(node.getAttribute('data-id') || '');
    if (!/^\\d+$/.test(id) || seen[id]) return;
    var label = node.querySelector('.quickedit-label');
    var text = label ? label.textContent.replace(/\\s+/g, ' ').trim() : '';
    var name = label && label.getAttribute('data-text') ? label.getAttribute('data-text') : text;
    var coords = (text.match(/(\\d+)\\|(\\d+)/) || [])[0] || '';
    var continent = (text.match(/K\\d+/) || [])[0] || '';
    seen[id] = true;
    out.push({ id: id, name: name.trim(), coords: coords, continent: continent });
  });
  return { ok: true, villages: out };
`);

// Liest Gebaeudestufen, Bauschleife und die gerade klickbaren Ausbauknoepfe.
// Geprueft gegen die Gebaeudeansicht von Welt 96. Die Seite legt unter
// BuildingMain.buildings saemtliche Angaben je Gebaeude ab, das ist die
// verlaesslichste Quelle. Die Tabelle dient als Rueckfallebene.
const READ_BUILD = wrap(`
  var gd = window.game_data;
  if (!gd || !gd.village) return { ok: false, error: 'Keine Spieldaten auf der Seite' };
  var info = (window.BuildingMain && window.BuildingMain.buildings) ? window.BuildingMain.buildings : {};

  var levels = {};
  var src = gd.village.buildings || {};
  Object.keys(src).forEach(function (key) { levels[key] = Number(src[key]); });

  var names = {};
  var orders = {};
  var blocked = {};
  var costs = {};
  Object.keys(info).forEach(function (key) {
    var b = info[key];
    if (!b) return;
    names[key] = b.name || key;
    if (b.order) orders[key] = Number(b.order);
    if (levels[key] === undefined && b.level !== undefined) levels[key] = Number(b.level);
    costs[key] = { wood: Number(b.wood), stone: Number(b.stone), iron: Number(b.iron), pop: Number(b.pop) };
    if (b.error) blocked[key] = String(b.error).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
  });

  // Ein Gebaeude gilt nur dann als baubar, wenn sein eigener Ausbauknopf
  // sichtbar ist. Fehlen Rohstoffe, blendet das Spiel den Knopf aus und zeigt
  // stattdessen einen Hinweis mit dem Zeitpunkt.
  var buildable = {};
  var rows = document.querySelectorAll('tr[id^="main_buildrow_"]');
  Array.prototype.forEach.call(rows, function (row) {
    var key = String(row.id).replace('main_buildrow_', '');
    if (!names[key]) {
      var label = row.querySelector('td a');
      names[key] = label ? label.textContent.trim() : key;
    }
    var link = row.querySelector('a.btn-build[data-level-next]');
    if (!link) return;
    if (/cheap/.test(link.id) || /cheap/.test(link.getAttribute('href') || '')) return;
    if (link.style && link.style.display === 'none') return;
    buildable[key] = Number(link.getAttribute('data-level-next'));
  });

  var queueRows = document.querySelectorAll('#buildqueue tr[id^="buildorder_"]');
  var queue = [];
  Array.prototype.forEach.call(queueRows, function (row) {
    var label = row.querySelector('td');
    queue.push(label ? label.textContent.trim().replace(/\\s+/g, ' ') : 'Auftrag');
  });
  var queueLength = queue.length;
  var orderSum = Object.keys(orders).reduce(function (sum, key) { return sum + orders[key]; }, 0);
  if (orderSum > queueLength) queueLength = orderSum;

  return {
    ok: true,
    villageId: String(gd.village.id),
    levels: levels,
    names: names,
    orders: orders,
    blocked: blocked,
    costs: costs,
    queue: queue,
    queueLength: queueLength,
    buildable: buildable,
    resources: {
      wood: Math.floor(gd.village.wood),
      stone: Math.floor(gd.village.stone),
      iron: Math.floor(gd.village.iron),
      storage: Number(gd.village.storage_max)
    }
  };
`);

// Loest den Ausbau eines Gebaeudes aus.
// Das Spiel haengt an den Ausbauknoepfen eigene Behandlungsroutinen. Deshalb
// wird nach Moeglichkeit die Funktion des Spiels selbst aufgerufen, genau die,
// die das Spiel auch an seinen eigenen Hinweistexten hinterlegt. Nur wenn es
// sie nicht gibt, wird auf einen Klick zurueckgegriffen.
// Der Knopf mit den um zwanzig Prozent reduzierten Kosten kostet dreissig
// Premiumpunkte. Er wird ausdruecklich nie angeruehrt.
const clickBuild = (key) => wrap(`
  var key = ${JSON.stringify(key)};
  var row = document.getElementById('main_buildrow_' + key);
  if (!row) return { ok: false, error: 'Keine Tabellenzeile fuer ' + key + ' gefunden' };
  var link = row.querySelector('a.btn-build[data-level-next]');
  if (!link) return { ok: false, error: key + ' ist vollstaendig ausgebaut oder hat keinen Ausbauknopf' };
  var href = link.getAttribute('href') || '';
  if (/cheap/.test(link.id) || /cheap/.test(href)) {
    return { ok: false, error: 'Sicherung: ein Knopf mit Premiumkosten wird nie geklickt' };
  }
  if (link.style && link.style.display === 'none') {
    var hint = row.querySelector('.build_options .inactive');
    return { ok: false, error: hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : 'Ausbau gerade nicht moeglich' };
  }
  var target = Number(link.getAttribute('data-level-next'));
  var how = 'Klick';
  if (window.BuildingMain && typeof window.BuildingMain.build === 'function') {
    how = 'BuildingMain.build';
    window.BuildingMain.build(key);
  } else {
    link.click();
  }
  return { ok: true, building: key, target: target, how: how };
`);

// Prueft, ob der Ausbau moeglich waere, ohne etwas anzuruehren.
// Dieselben Sicherungen wie beim Klicken, nur ohne Klick.
const canBuild = (key) => wrap(`
  var key = ${JSON.stringify(key)};
  var row = document.getElementById('main_buildrow_' + key);
  if (!row) return { ok: false, error: 'Keine Tabellenzeile fuer ' + key + ' gefunden' };
  var link = row.querySelector('a.btn-build[data-level-next]');
  if (!link) return { ok: false, error: key + ' ist vollstaendig ausgebaut oder hat keinen Ausbauknopf' };
  var href = link.getAttribute('href') || '';
  if (/cheap/.test(link.id) || /cheap/.test(href)) {
    return { ok: false, error: 'Sicherung: ein Knopf mit Premiumkosten wird nie beruehrt' };
  }
  if (link.style && link.style.display === 'none') {
    var hint = row.querySelector('.build_options .inactive');
    return { ok: false, error: hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : 'Ausbau gerade nicht moeglich' };
  }
  return { ok: true, building: key, target: Number(link.getAttribute('data-level-next')) };
`);

// Liest die Rekrutierungsseite eines Gebaeudes aus.
// Geprueft gegen Kaserne, Stall und Werkstatt von Welt 96. Es gibt keine
// gemeinsame Seite, jedes Gebaeude hat seine eigene. Die Kosten und die
// Voraussetzungen stehen im Seitenkontext unter unit_managers.units.
const READ_TRAIN = wrap(`
  var gd = window.game_data;
  if (!gd || !gd.village) return { ok: false, error: 'Keine Spieldaten auf der Seite' };
  var form = document.querySelector('#train_form');
  if (!form) {
    return { ok: false, error: 'Kein Rekrutierungsformular, das Gebaeude fehlt vermutlich' };
  }
  var action = form.getAttribute('action') || '';
  if (action.indexOf('action=train') === -1) {
    return { ok: false, error: 'Unerwartetes Formular auf der Seite' };
  }

  var costs = (window.unit_managers && window.unit_managers.units) ? window.unit_managers.units : {};
  var units = {};
  var inputs = form.querySelectorAll('input.recruit_unit, input[type="text"][name]');
  Array.prototype.forEach.call(inputs, function (input) {
    var name = input.name;
    if (!name || name === 'h') return;
    var present = null;
    var total = null;
    var row = input.closest('tr');
    if (row) {
      var cells = row.querySelectorAll('td');
      for (var i = 0; i < cells.length; i++) {
        var match = cells[i].textContent.replace(/\\s+/g, '').match(/^(\\d+)\\/(\\d+)$/);
        if (match) { present = Number(match[1]); total = Number(match[2]); break; }
      }
    }
    var max = null;
    var maxLink = document.getElementById(input.id + '_a');
    if (maxLink) {
      var m2 = maxLink.textContent.match(/\\((\\d+)\\)/);
      if (m2) max = Number(m2[1]);
    }
    var cost = costs[name] || null;
    units[name] = {
      present: present,
      total: total,
      max: max,
      disabled: Boolean(input.disabled),
      pop: cost ? Number(cost.pop) : null,
      cost: cost ? { wood: Number(cost.wood), stone: Number(cost.stone), iron: Number(cost.iron) } : null
    };
  });

  // Die laufenden Auftraege tragen keine eigene Kennung. Verlaesslich ist die
  // Zahl der Abbruchknoepfe in der Ausbildungsliste.
  var queue = [];
  var cancels = document.querySelectorAll('.trainqueue_wrap a.btn-cancel, #trainqueue_wrap a.btn-cancel');
  Array.prototype.forEach.call(cancels, function (link) {
    var row = link.closest('tr');
    var label = row ? row.querySelector('td') : null;
    queue.push(label ? label.textContent.replace(/\\s+/g, ' ').trim() : 'Auftrag');
  });

  return {
    ok: true,
    villageId: String(gd.village.id),
    building: gd.screen,
    units: units,
    queue: queue,
    queueLength: queue.length,
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
  var form = document.querySelector('#train_form');
  if (!form) return { ok: false, error: 'Kein Rekrutierungsformular gefunden' };
  var action = form.getAttribute('action') || '';
  if (action.indexOf('action=train') === -1) {
    return { ok: false, error: 'Sicherung: unerwartetes Formular, es wird nichts abgeschickt' };
  }
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
  var button = form.querySelector('.btn-recruit') || form.querySelector('input[type="submit"]');
  if (!button) return { ok: false, error: 'Kein Absendeknopf gefunden' };
  button.click();
  return { ok: true, ordered: written };
`);

// Liest eine Dorfuebersicht vollstaendig aus: Gebaeudestufen, Rohstoffe,
// Bauernhof und den Truppenbestand. Geprueft gegen die Dorfuebersicht der
// Spielversion 8.435. Ein einziger Seitenaufruf je Dorf genuegt damit.
const SCAN_VILLAGE = wrap(`
  var gd = window.game_data;
  if (!gd || !gd.village) return { ok: false, error: 'Keine Spieldaten auf der Seite' };

  var levels = {};
  var src = gd.village.buildings || {};
  Object.keys(src).forEach(function (key) { levels[key] = Number(src[key]); });

  // Die Truppenanzeige fuehrt zwei Bloecke: alle Einheiten des Dorfes und
  // jene, die gerade daheim stehen. Einheiten ohne Bestand fehlen ganz.
  var readUnits = function (selector) {
    var out = {};
    var nodes = document.querySelectorAll(selector);
    Array.prototype.forEach.call(nodes, function (node) {
      var unit = node.getAttribute('data-count');
      if (!unit) return;
      out[unit] = Number(String(node.textContent).replace(/[^0-9]/g, '')) || 0;
    });
    return out;
  };

  return {
    ok: true,
    id: String(gd.village.id),
    name: gd.village.name,
    coords: gd.village.x + '|' + gd.village.y,
    points: Number(gd.village.points || 0),
    levels: levels,
    units: readUnits('#unit_overview_table tr.all_unit strong[data-count]'),
    unitsHome: readUnits('#unit_overview_table tr.home_unit strong[data-count]'),
    resources: {
      wood: Math.floor(gd.village.wood),
      stone: Math.floor(gd.village.stone),
      iron: Math.floor(gd.village.iron),
      storage: Number(gd.village.storage_max)
    },
    pop: Number(gd.village.pop),
    popMax: Number(gd.village.pop_max),
    incomings: gd.player ? Number(gd.player.incomings || 0) : 0
  };
`);

// Fingerabdruck der Gebaeudeseite. Er aendert sich genau dann, wenn ein
// Auftrag tatsaechlich in der Bauschleife gelandet ist. Rohstoffe bleiben
// bewusst aussen vor, sie wachsen ohnehin laufend weiter.
const buildFingerprint = (key) => wrap(`
  var key = ${JSON.stringify(key)};
  var row = document.getElementById('main_buildrow_' + key);
  var link = row ? row.querySelector('a.btn-build[data-level-next]') : null;
  var queue = document.querySelector('#buildqueue');
  var info = (window.BuildingMain && window.BuildingMain.buildings) ? window.BuildingMain.buildings[key] : null;
  return {
    ok: true,
    queueRows: queue ? queue.querySelectorAll('tr').length : 0,
    queueText: queue ? queue.textContent.replace(/\\s+/g, ' ').trim().slice(0, 400) : '',
    nextLevel: link ? Number(link.getAttribute('data-level-next')) : null,
    hidden: link ? Boolean(link.style && link.style.display === 'none') : true,
    orders: info && info.order ? Number(info.order) : 0
  };
`);

// Fingerabdruck der Rekrutierungsseite. Nach einem angenommenen Auftrag leert
// das Spiel die Eingabefelder und ergaenzt die Ausbildungsliste.
const TRAIN_FINGERPRINT = wrap(`
  var box = document.querySelector('.trainqueue_wrap');
  var form = document.querySelector('#train_form');
  var values = '';
  if (form) {
    var inputs = form.querySelectorAll('input.recruit_unit, input[type="text"][name]');
    Array.prototype.forEach.call(inputs, function (input) {
      if (input.name && input.name !== 'h') values += input.name + '=' + input.value + ';';
    });
  }
  return {
    ok: true,
    queueEntries: box ? box.querySelectorAll('a.btn-cancel').length : 0,
    queueText: box ? box.textContent.replace(/\\s+/g, ' ').trim().slice(0, 400) : '',
    values: values
  };
`);

// Liefert die rohe Seite, damit Auswahlpfade gegen die echte Welt geprueft werden koennen.
const CAPTURE = wrap(`
  return { ok: true, url: location.href, html: document.documentElement.outerHTML };
`);

module.exports = {
  PROBE, LIST_VILLAGES, READ_BUILD, READ_TRAIN, SCAN_VILLAGE, CAPTURE,
  clickBuild, canBuild, submitTrain, buildFingerprint, TRAIN_FINGERPRINT
};
