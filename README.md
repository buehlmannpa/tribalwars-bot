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
npm run dist       # erzeugt release/Staemme Manager-0.1.0.dmg
```

Die App ist nicht bei Apple beglaubigt. Beim ersten Start meldet macOS deshalb
einen unbekannten Entwickler. Abhilfe: im Finder mit der rechten Maustaste auf
die App klicken und Oeffnen waehlen, oder einmalig

```bash
xattr -dr com.apple.quarantine "/Applications/Staemme Manager.app"
```

## Ablauf im Betrieb

1. App per Doppelklick starten. Es oeffnen sich das Dashboard und das Spielfenster.
2. Im Spielfenster bei der Welt anmelden. Die Anmeldung bleibt gespeichert.
3. Im Dashboard auf Doerfer einlesen klicken.
4. Unter Vorlagen die gewuenschten Plaene anlegen. Danach in der Dorfliste die
   Doerfer ankreuzen und ueber die Leiste oben den Bau und den Truppenplan
   zuweisen, wahlweise fuer ein einzelnes Dorf oder fuer viele auf einmal.
5. Unter Einstellungen den Takt pruefen und danach auf Automatik starten klicken.

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

## Offener Punkt zu den Auswahlpfaden

Die Schnipsel in `src/main/pageScripts.js` sprechen die Spielseite ueber ihre
Bezeichner an, zum Beispiel `main_buildlink_wood_11` oder `#train_form`. Diese
Bezeichner stammen aus der oeffentlich bekannten Struktur des Spiels und sind
noch nicht gegen eine angemeldete Sitzung geprueft worden. Nutze im Dashboard
unter Einstellungen den Seitenabzug auf der Gebaeude und der Rekrutierungsseite.
Mit diesen beiden Dateien lassen sich die Auswahlpfade in einem Zug bestaetigen
oder korrigieren.

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
