# Staemme Manager

Lokale macOS App, die in Die Staemme Doerfer nach Bauplan ausbaut und Truppen
nach Vorlage rekrutiert. Sie arbeitet mit jeder Welt und jedem Konto, alles
laeuft auf deinem Rechner, nichts wird an einen fremden Dienst gesendet.

## Wichtiger Hinweis vorab

Paragraf 6 der offiziellen Spielregeln verbietet Bots, Skripte und Werkzeuge,
die automatisierte Aktionen bereitstellen oder Premium Funktionen nachbilden.
Der offizielle Accountmanager ist genau so eine Premium Funktion. Wer diese App
einsetzt, riskiert eine dauerhafte Sperre des Welt Accounts und des Master
Accounts. Der Entscheid liegt bei dir.

## Was die App kann

1. Eigenes Spielfenster mit dauerhaft gespeicherter Anmeldung, du kannst darin
   jederzeit selbst spielen und eingreifen. Es laesst sich schliessen, dann
   arbeitet es unsichtbar weiter, und mit dem Knopf Spielfenster holst du es
   zurueck.
2. Die Welt wird beim ersten Anmelden automatisch aus dem Spielfenster
   uebernommen, egal ob Schweiz, Deutschland oder eine andere Landesfassung.
3. **Welt einlesen** mit einem Knopf: die App liest die Dorfliste und danach
   jedes Dorf einmal aus, also Gebaeudestufen, Rohstoffe, Speicher, Bauernhof
   und Truppenbestand, getrennt nach daheim und gesamt. Das Ergebnis steht
   unter Weltuebersicht.
4. Beliebig viele Bau und Truppenplaene anlegen, duplizieren und bearbeiten,
   danach in der Dorfliste mehreren Doerfern auf einmal zuweisen.
5. Bauplaene abarbeiten, inklusive der Auftraege, die bereits in der
   Bauschleife stehen.
6. Truppenvorlagen abarbeiten, in Paketen, mit Rohstoffpuffer und Bauernhof
   Puffer, Vorrang gegenueber dem Bauplan einstellbar.
7. Modus nur beobachten, in dem die App alles liest und protokolliert, aber
   nichts im Spiel anruehrt.
8. Sicherungen: Erkennung von Botschutz und abgelaufener Sitzung mit sofortigem
   Halt und Mitteilung, zufaellige Abstaende, Aktionslimite pro Stunde,
   optionale Nachtpause, Ueberspringen bei eingehenden Angriffen.
9. Seitenabzug auf die Platte, um Auswahlpfade gegen eine Welt zu pruefen.

Noch nicht enthalten sind Rohstoffausgleich, Muenzpraegung, Farmen, Raubzuege
und Angriffsplanung.

## Installation

Die fertige Datei entsteht im Ablauf unter `.github/workflows/build-macos.yml`
auf einem Mac Rechner bei GitHub. Unter Actions den Lauf oeffnen, ganz nach
unten scrollen und unter Artifacts `staemme-manager-dmg` herunterladen.

Oder selbst bauen:

```bash
npm install
npm start          # zum Ausprobieren ohne Verpackung
npm run dist:arm   # Apple Silicon
npm run dist:intel # Intel
```

### Erster Start unter macOS

Die App ist nicht bei Apple beglaubigt. Alles, was aus dem Netz geladen wurde,
bekommt von macOS eine Quarantaenemarkierung, und ohne Beglaubigung meldet das
System dann **die App sei beschaedigt**. Sie ist es nicht, die Markierung muss
einmalig entfernt werden:

```bash
xattr -dr com.apple.quarantine "/Applications/Staemme Manager.app"
```

Danach startet die App normal. Wer den Weg ueber den Finder bevorzugt, kann es
mit der rechten Maustaste und Oeffnen versuchen, bei der Meldung beschaedigt
hilft aber nur der Befehl oben.

## Erster Lauf, Schritt fuer Schritt

Beim ersten Start ist der Modus **nur beobachten** eingeschaltet. Die App liest
dann alle Seiten und schreibt ins Protokoll, was sie tun wuerde, klickt aber
nichts im Spiel.

1. App starten. Es oeffnen sich das Dashboard und das Spielfenster.
2. Im Spielfenster deine Welt waehlen und anmelden. Die Anmeldung bleibt
   gespeichert, die Welt wird uebernommen und oben im Dashboard angezeigt.
3. Auf **Welt einlesen** klicken. Die App oeffnet jedes Dorf einmal und
   sammelt alles ein. Der Fortschritt steht neben dem Knopf und im Protokoll,
   das Ergebnis unter Weltuebersicht. Das Spielfenster darfst du dabei
   schliessen, es arbeitet im Hintergrund weiter.
4. Unter Vorlagen die gewuenschten Plaene anlegen oder die mitgelieferten
   verwenden. Danach in der Dorfliste die Doerfer ankreuzen und ueber die
   Leiste oben den Bau und den Truppenplan zuweisen.
5. Auf **Automatik starten** klicken. Die Kennzeichnung oben zeigt beobachtet.
6. Eine halbe Stunde laufen lassen und das Protokoll lesen.
7. Sieht das stimmig aus, unter Einstellungen den Haken bei nur beobachten
   entfernen. Ab da handelt die App selbstaendig.

Zum Anhalten genuegt der Knopf Anhalten oder Befehlstaste und Punkt.

## Einstellungen, die du kennen solltest

| Einstellung | Bedeutung |
|---|---|
| Nur beobachten | Es wird nichts im Spiel geklickt |
| Vorrang bei Rohstoffen | Bauplan zuerst, Truppen zuerst oder abwechselnd |
| Bauschleife fuellen bis | Ohne Premium nimmt das Spiel hoechstens zwei Auftraege |
| Kleinste Bestellmenge | Unterhalb davon wartet die Rekrutierung auf Rohstoffe |
| Rohstoffpuffer | Diese Mengen bleiben dem Bauplan vorbehalten |
| Bauernhof Puffer | So viele Plaetze bleiben frei |
| Pause minimal und maximal | Zufaelliger Abstand zwischen zwei Durchlaeufen |
| Aktionen pro Stunde | Obergrenze fuer alles, was die App im Spiel ausloest |
| Nachtpause | Zeitfenster, in dem nichts geschieht |

Ohne Premium fehlt im Spiel die Ausmusterung, und die Bauschleife ist auf zwei
Auftraege begrenzt. Die App richtet sich danach.

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
| `build/afterPack.js` | Signatur ohne Zertifikat, damit macOS die App startet |
| `tools/simulate.js` | Trockenlauf gegen ein nachgebildetes Dorf |
| `tools/demo.html` | Anklickbare Fassung der Logik fuer den Browser |
| `docs/ANALYSE.md` | Analyse des Spiels und des Seitenaufbaus |

## Stand der Pruefung

Die Schnipsel in `src/main/pageScripts.js` sind gegen wortgetreue Auszuege
echter Spielseiten der Version 8.435 geprueft. Die Auszuege liegen unter
`test/fixtures`, die Tests fuehren die Skripte mit jsdom dagegen aus.

| Ansicht | Stand |
|---|---|
| Gebaeude, `screen=main` | geprueft |
| Dorfliste, `screen=overview_villages` | geprueft |
| Dorfuebersicht, `screen=overview` | geprueft |
| Kaserne, Stall, Werkstatt | geprueft |
| Botschutz | noch offen, es fehlt ein Abzug im gesperrten Zustand |

Noch nicht gegen eine laufende Sitzung geprueft ist das Zusammenspiel im
Betrieb, also Anmeldung, Navigation und das tatsaechliche Absenden.

## Testen ohne Mac

```bash
npm test                              # Einheitstests der Logik
node tools/simulate.js 600            # Trockenlauf, Vorrang Bauplan
node tools/simulate.js 600 troops     # Trockenlauf, Vorrang Truppen
```
