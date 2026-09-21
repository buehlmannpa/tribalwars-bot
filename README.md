# Staemme Manager

Lokale macOS App, die Doerfer in Die Staemme CH nach Bauplan ausbaut und Truppen
nach Vorlage rekrutiert. Alles laeuft auf deinem Laptop, nichts wird an einen
fremden Dienst gesendet.

## Wichtiger Hinweis vorab

Paragraf 6 der offiziellen Spielregeln auf staemme.ch verbietet Bots, Skripte
und Werkzeuge, die automatisierte Aktionen bereitstellen oder Premium Funktionen
nachbilden. Der offizielle Accountmanager ist genau so eine Premium Funktion.
Wer diese App einsetzt, riskiert eine dauerhafte Sperre des Welt Accounts und
des Master Accounts. Der Entscheid liegt bei dir.

## Was die App heute kann

1. Eigenes Spielfenster mit dauerhaft gespeicherter Anmeldung, du kannst darin
   jederzeit selbst spielen und eingreifen.
2. Doerfer aus der Produktionsuebersicht einlesen.
3. Beliebig viele Bau und Truppenplaene anlegen, duplizieren und bearbeiten,
   danach in der Dorfliste mehreren Doerfern auf einmal zuweisen.
4. Bauvorlagen je Dorf abarbeiten, inklusive der Auftraege, die bereits in der
   Bauschleife stehen.
5. Truppenvorlagen je Dorf abarbeiten, in Paketen, mit Rohstoffpuffer und
   Bauernhof Puffer, Vorrang gegenueber dem Bauplan einstellbar.
6. Sicherungen: Erkennung von Botschutz und abgelaufener Sitzung mit sofortigem
   Halt und Mitteilung, zufaellige Abstaende, Aktionslimite pro Stunde,
   optionale Nachtpause, Ueberspringen bei eingehenden Angriffen.
7. Seitenabzug auf die Platte, um Auswahlpfade gegen die echte Welt zu pruefen.

Noch nicht enthalten sind Rohstoffausgleich, Muenzpraegung, Farmen, Raubzuege
und Angriffsplanung.

## Bauen auf dem Mac

```bash
npm install
npm start          # zum Ausprobieren ohne Verpackung
npm run dist:arm   # erzeugt release/Staemme Manager-0.1.0-arm64.dmg
```

Gebaut wird fuer Apple Silicon. Alternativ laesst sich die Datei ueber den
Ablauf unter `.github/workflows/build-macos.yml` auf einem Mac Rechner bei
GitHub erzeugen und dort herunterladen.

Die App ist nicht bei Apple beglaubigt. Beim ersten Start meldet macOS deshalb
einen unbekannten Entwickler. Abhilfe: im Finder mit der rechten Maustaste auf
die App klicken und Oeffnen waehlen, oder einmalig

```bash
xattr -dr com.apple.quarantine "/Applications/Staemme Manager.app"
```

## Erster Lauf, Schritt fuer Schritt

Beim ersten Start ist der Modus **nur beobachten** eingeschaltet. Die App liest
dann alle Seiten und schreibt ins Protokoll, was sie tun wuerde, klickt aber
nichts im Spiel. So laesst sich der Betrieb gefahrlos pruefen.

1. App per Doppelklick starten. Es oeffnen sich das Dashboard und das
   Spielfenster.
2. Im Spielfenster bei Welt 96 anmelden. Die Anmeldung bleibt gespeichert.
3. Im Dashboard auf **Status pruefen** klicken. Im Protokoll muss angemeldet
   stehen, in der Kopfzeile erscheint ohne Premium.
4. Auf **Doerfer einlesen** klicken. Die sechs Doerfer sind bereits mit
   Vorlagen hinterlegt, das Einlesen frischt nur Namen und Koordinaten auf.
5. Auf **Automatik starten** klicken. Die Kennzeichnung oben zeigt beobachtet.
6. Eine halbe Stunde laufen lassen und das Protokoll lesen. Dort steht je Dorf,
   welches Gebaeude die App ausbauen und welche Einheiten sie bestellen wuerde,
   und warum sie gegebenenfalls wartet.
7. Sieht das stimmig aus, unter Einstellungen den Haken bei nur beobachten
   entfernen. Ab da handelt die App selbstaendig.

Zum Anhalten genuegt der Knopf Anhalten oder Befehlstaste und Punkt.

## Voreingestellte Zuweisung

| Dorf | Koordinaten | Bauplan | Truppen |
|---|---|---|---|
| -001- | 545 zu 520 | Defensiv | Defensiv voll |
| -002- | 545 zu 521 | Defensiv | Defensiv voll |
| -003- | 546 zu 522 | Offensiv | Offensiv voll |
| -004- | 547 zu 520 | Defensiv | Defensiv voll |
| -005- | 543 zu 520 | Defensiv | Defensiv voll |
| -006- | 543 zu 521 | Offensiv | Offensiv voll |

Die Plaene lassen sich im Dashboard frei aendern und neu zuweisen.

## Tests

```bash
npm test
```

## Aufbau

| Datei | Zweck |
|---|---|
| `src/main/main.js` | Start, Fenster, Schnittstelle zur Oberflaeche |
| `src/main/bridge.js` | Spielfenster, Navigation, Ausfuehrung in der Seite |
| `src/main/pageScripts.js` | Die Schnipsel, die in der Spielseite laufen |
| `src/main/scheduler.js` | Takt, Sicherungen, Auswahl des naechsten Dorfes |
| `src/main/jobs/buildJob.js` | Dorfmanager, Bauplan |
| `src/main/jobs/trainJob.js` | Truppenmanager, Rekrutierung |
| `src/shared/templates.js` | Mitgelieferte Vorlagen |
| `src/renderer/` | Dashboard |
| `docs/ANALYSE.md` | Analyse des Spiels und der Schweizer Welt |

## Stand der Pruefung gegen die echte Welt

Die Schnipsel in `src/main/pageScripts.js` sind gegen wortgetreue Auszuege der
Seiten von Welt 96 geprueft. Die Auszuege liegen unter `test/fixtures`, die
Tests fuehren die Skripte mit jsdom dagegen aus.

| Ansicht | Stand |
|---|---|
| Gebaeude, `screen=main` | geprueft |
| Dorfliste, `screen=overview_villages` | geprueft |
| Kaserne, Stall, Werkstatt | geprueft |
| Botschutz | noch offen, es fehlt ein Abzug im gesperrten Zustand |

Noch nicht gegen eine laufende Sitzung geprueft ist das Zusammenspiel im
Betrieb, also Anmeldung, Navigation und das tatsaechliche Absenden.

## Testen ohne Mac

Zwei Wege, um die Entscheidungen zu pruefen, bevor die App je eine echte Welt
beruehrt:

```bash
npm test                      # Einheitstests der Logik
node tools/simulate.js 600            # Trockenlauf, Vorrang Bauplan
node tools/simulate.js 600 troops     # Trockenlauf, Vorrang Truppen
```

Der Trockenlauf bildet ein Dorf mit Rohstoffwachstum, Bauzeiten und
Bauernhofplaetzen nach und laesst Dorfmanager und Truppenmanager darauf
arbeiten. Zusaetzlich liegt in `tools/demo.html` eine anklickbare Fassung fuer
den Browser mit derselben Entscheidungslogik.
