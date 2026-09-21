'use strict';

// Diese Tests pruefen die Sicherungen der Angriffsskripte. Der Versammlungs
// platz liegt hier nur nachgebaut vor, die Uebereinstimmung mit der echten
// Seite ist damit ausdruecklich nicht geprueft.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const scripts = require('../src/main/pageScripts');

const UNIT_KEYS = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult'];
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

function openPlace(html) {
  const dom = new JSDOM(html || fixture('place-synthetic.html'), {
    runScripts: 'outside-only',
    virtualConsole: new VirtualConsole()
  });
  const clicks = [];
  dom.window.document.addEventListener('click', (event) => {
    event.preventDefault();
    clicks.push(event.target.id || event.target.name);
  });
  return { window: dom.window, document: dom.window.document, clicks, run: (s) => dom.window.eval(s) };
}

test('prepareAttack traegt Ziel und Truppen ein und loest aus', () => {
  const { run, document, clicks } = openPlace();
  const result = run(scripts.prepareAttack(546, 515, { light: 10, spy: 1 }, UNIT_KEYS));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.target, '546|515');
  assert.strictEqual(document.querySelector('[name="x"]').value, '546');
  assert.strictEqual(document.querySelector('[name="light"]').value, '10');
  assert.strictEqual(document.querySelector('[name="spy"]').value, '1');
  assert.deepStrictEqual(clicks, ['target_attack']);
});

test('prepareAttack leert Felder, die nicht gewollt sind', () => {
  const { run, document } = openPlace();
  document.querySelector('[name="spear"]').value = '9999';
  const result = run(scripts.prepareAttack(546, 515, { light: 10 }, UNIT_KEYS));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(document.querySelector('[name="spear"]').value, '');
});

test('prepareAttack bricht ab, wenn ein Eingabefeld fehlt', () => {
  const { run, clicks } = openPlace();
  const result = run(scripts.prepareAttack(546, 515, { ram: 5 }, UNIT_KEYS));
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Kein Eingabefeld/);
  assert.strictEqual(clicks.length, 0);
});

test('prepareAttack bricht ab, wenn es den Versammlungsplatz nicht gibt', () => {
  const { run, clicks } = openPlace('<div>irgendeine andere Seite</div>');
  const result = run(scripts.prepareAttack(546, 515, { light: 10 }, UNIT_KEYS));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(clicks.length, 0);
});

test('prepareAttack bricht ab, wenn sich das Ziel nicht setzen laesst', () => {
  const html = fixture('place-synthetic.html').replace(/name="x"/, 'name="xx"').replace(/name="y"/, 'name="yy"');
  const { run, clicks } = openPlace(html);
  const result = run(scripts.prepareAttack(546, 515, { light: 10 }, UNIT_KEYS));
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Ziel/);
  assert.strictEqual(clicks.length, 0);
});

test('confirmAttack bestaetigt nur, wenn das gemeinte Ziel dasteht', () => {
  const html = '<form action="/game.php?screen=place&try=confirm"><p>Angriff auf 546|515</p>'
    + '<input id="troop_confirm_submit" type="submit" value="OK"></form>';
  const { run, clicks } = openPlace(html);
  const result = run(scripts.confirmAttack(546, 515));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(clicks, ['troop_confirm_submit']);
});

test('confirmAttack bricht ab, wenn ein anderes Ziel dasteht', () => {
  const html = '<form action="/game.php?screen=place&try=confirm"><p>Angriff auf 600|600</p>'
    + '<input id="troop_confirm_submit" type="submit" value="OK"></form>';
  const { run, clicks } = openPlace(html);
  const result = run(scripts.confirmAttack(546, 515));
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Sicherung/);
  assert.strictEqual(clicks.length, 0);
});

test('COMMAND_COUNT liest die Zahl der ausgehenden Befehle', () => {
  const { run } = openPlace('<div id="commands_outgoings" data-commands="3"></div>');
  const result = run(scripts.COMMAND_COUNT);
  assert.strictEqual(result.commands, 3);
});
