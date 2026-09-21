# Analyse Die Staemme CH

Stand 21. September 2026. Grundlage sind die offiziellen Regeln auf staemme.ch,
das offizielle Wiki und die oeffentlich abrufbaren Weltdaten der Welt 97.

## 1. Regeln

Paragraf 6 der globalen Regeln haelt fest:

> Bots, Tools, Skripte und andere Mittel, die automatisierte Aktionen
> bereitstellen oder replizieren und / oder den Zugriff auf Premium Funktionen
> ermoeglichen, sind verboten, sofern diese nicht ausdruecklich erlaubt sind.

Erlaubt sind nur Skripte aus der offiziellen Bibliothek. Die Strafe ist eine
dauerhafte Sperre des Welt Accounts und moeglicherweise des Master Accounts.
Zusaetzlich schuetzt hCaptcha die Seiten, und im Spiel erscheint zufaellig der
Botschutz, der alle Aktionen blockiert, bis ein Mensch bestaetigt.

## 2. Beispielwelt

Die folgenden Werte stammen aus einer bestimmten Welt und dienen als Beispiel.
Die App bindet sich an keine Welt, sie uebernimmt die Adresse beim Anmelden aus
dem Spielfenster und liest die Weltdaten bei Bedarf selbst.

### Welt 96 Schweiz

Abgefragt ueber `https://ch96.staemme.ch/interface.php?func=get_config`. Das ist
die gespielte Welt. Eine fruehere Fassung dieser Datei nannte Welt 97, deren
Werte weichen deutlich ab.

| Einstellung | Wert auf ch96 |
|---|---|
| Weltgeschwindigkeit | 1 |
| Einheitengeschwindigkeit | 1 |
| Moral | 3 |
| Bogenschuetzen | ja |
| Kirche | nein |
| Wachturm | nein |
| Raubzuege | aktiv |
| Paladin | Stufe 3, mit Faehigkeitsbuechern |
| Adelsgeschlecht | Goldmuenzen, automatische Praegung im Spiel vorhanden |
| Muenzkosten | 28000 Holz, 30000 Lehm, 25000 Eisen |
| Nachtbonus | 22:00 bis 07:00, Verteidigungsfaktor 2 |
| Kartengroesse | 1000 |
| Gratis Premium | bei 500 und 15000 Punkten |
| Gratis Accountmanager | bei 10, 25, 100, 250, 500 und 1000 Doerfern |

## 3. Funktionsumfang des offiziellen Accountmanagers

| Teil | Verhalten laut Wiki |
|---|---|
| Dorfmanager | Bauvorlagen mit fester Bauschleife, Zuweisung je Dorf, Pausieren, optionaler Abriss ueberschuessiger Stufen ab Zustimmung 100 und Hauptgebaeude 15 |
| Truppenmanager | Zielbestand je Dorf, Pakete zu 50 in der Kaserne, 20 im Stall, 10 in der Werkstatt, hoechstens zwei Auftraege je Gebaeude, Puffer fuer Rohstoffe und Bauernhof, Abschaltung bei Angriff oder vollem Bauernhof, gleichmaessiger Fortschritt ueber alle Einheiten |
| Marktmanager | bis zu 50 Handelsrouten mit Wochentag und gewuenschter Ankunftszeit |
| Forschungsmanager | Reihenfolge der Schmiedeforschung ueber Vorlagen, Pausieren je Dorf |
| Farmassistent | Vorlagen A und B, Variante C fuellt die Tragekapazitaet passend zu den erwarteten Rohstoffen, Farmen aus Karte, Bericht und Tabelle |

Diese App bildet bewusst zuerst Dorfmanager und Truppenmanager nach.

## 3a. Befunde aus der echten Sitzung auf Welt 96

Geprueft an einem Seitenabzug der Gebaeudeansicht von Dorf 2201.

1. Die gespielte Welt ist **ch96**, nicht ch97. Grundadresse
   `https://ch96.staemme.ch`. Spielversion 8.435.
2. Premium ist auf diesem Konto **nicht aktiv**. Die Seite meldet
   `features.Premium.active = false` und
   `features.AccountManager.possible = false`. Der offizielle Accountmanager
   ist damit derzeit gar nicht buchbar, auch nicht als Gratisstufe.
3. Die Gebaeudeansicht traegt im Seitenkontext das Objekt
   `BuildingMain.buildings`. Es enthaelt je Gebaeude Stufe, naechste Stufe,
   Kosten, Bauzeit, Einwohnerbedarf, Voraussetzungen, die Anzahl laufender
   Auftraege unter `order` und im Feld `error` den Grund, warum gerade nicht
   gebaut werden kann. Das ist die verlaesslichste Quelle, viel besser als
   ein Auslesen der Tabelle.
4. Jede Gebaeudezeile heisst `tr#main_buildrow_<schluessel>`. Der Ausbauknopf
   ist `a.btn.btn-build` mit der Kennung `main_buildlink_<schluessel>_<stufe>`
   und dem Merkmal `data-level-next`.
5. **Wichtig**: Fehlen Rohstoffe, wird der Ausbauknopf nicht gesperrt, sondern
   mit `style="display:none"` ausgeblendet. An seiner Stelle steht ein
   Hinweis mit dem Zeitpunkt. Eine Pruefung auf eine Sperrklasse geht also ins
   Leere, es zaehlt allein die Sichtbarkeit.
6. **Wichtig**: Daneben liegt immer ein zweiter Knopf
   `main_buildlink_<schluessel>_cheap` mit der Beschriftung minus zwanzig
   Prozent. Dieser kostet dreissig Premiumpunkte je Klick. Die App darf ihn
   unter keinen Umstaenden treffen.
7. Ist ein Gebaeude fertig, fehlt der Knopf ganz und die Zeile enthaelt nur
   den Hinweis, dass das Gebaeude vollstaendig ausgebaut ist.

## 3b. Befunde zur Dorfliste und zur Rekrutierung

Geprueft an Seitenabzuegen der Dorfuebersicht sowie von Kaserne, Stall und
Werkstatt.

1. Die Dorfuebersicht liegt unter
   `screen=overview_villages&mode=prod` in der Tabelle `#production_table`.
   **Die Zeilen tragen keine Kennung.** Die Dorfnummer steht am Feld `data-id`
   der Schnellbearbeitung `span.quickedit-vn`, Name und Koordinaten in der
   Beschriftung `span.quickedit-label` daneben.
2. **Es gibt keine gemeinsame Rekrutierungsseite.** Der Eintrag in der
   Schnellleiste zeigt zwar auf `screen=train`, die tatsaechlichen Seiten sind
   `screen=barracks`, `screen=stable` und `screen=garage`. Jede hat ihr eigenes
   Formular `#train_form` mit der Aktion `action=train&mode=train`.
3. Je Einheit gibt es ein Eingabefeld `input.recruit_unit` mit der Kennung
   `<einheit>_0` und daneben einen Verweis `<einheit>_0_a`, dessen Beschriftung
   in Klammern die gerade bezahlbare Hoechstzahl nennt.
4. Der Bestand steht in der Spalte Im Dorf durch Insgesamt, also zum Beispiel
   `45/3264`. Die erste Zahl gilt fuer das Dorf, die zweite fuer das Konto.
5. Kosten, Einwohnerbedarf und der Stand der Forschung liegen im Seitenkontext
   unter `unit_managers.units`.
6. **Laufende Ausbildungen tragen keine Kennung.** Die Zeilen haben die Klasse
   `lit`, verlaesslich zaehlbar sind die Abbruchknoepfe `a.btn-cancel` im
   Bereich `.trainqueue_wrap`.
7. Nicht erforschte Einheiten stehen in einer eigenen Tabelle ohne Eingabefeld.

## 4. Technische Oberflaeche

1. Das Spiel ist serverseitig gerendertes PHP. Jede Ansicht haengt an
   `game.php?village=<id>&screen=<name>`.
2. Wichtige Ansichten: `main` Gebaeude, `train` Rekrutierung, `snob` Adelshof
   und Muenzen, `market` Handel, `place` Versammlungsplatz, `scavenge`
   Raubzuege, `am_farm` Farmassistent, `overview_villages` Sammelansichten,
   `report` Berichte.
3. Im Seitenkontext liegt das Objekt `game_data` mit Dorf, Rohstoffen, Speicher,
   Bauernhof, Spieler und dem Sicherheitsmerkmal fuer Formulare.
4. Ohne Anmeldung oeffentlich abrufbar und damit fuer Berechnungen nutzbar:
   `interface.php?func=get_config`, `func=get_unit_info`,
   `func=get_building_info` sowie `map/village.txt`, `map/player.txt`,
   `map/ally.txt` und `map/conquer.txt`.
5. Ohne gueltige Sitzung leitet `game.php` auf `page/session-expired` um. Das
   ist die einfachste und sicherste Erkennung fuer eine abgelaufene Anmeldung.

## 5. Entscheide fuer diese App

| Frage | Entscheid |
|---|---|
| Eingriffstiefe | Vollautomatik im Hintergrund, jederzeit von Hand uebersteuerbar |
| Sitzung | eigenes Fenster in der App mit dauerhaft gespeicherter Anmeldung |
| Module Version 1 | Bauplan je Dorf und Truppen nach Vorlage |
| Laufzeit | rund um die Uhr, Nachtpause vorhanden aber ausgeschaltet |

## 6. Naechste Schritte

1. Auswahlpfade gegen eine angemeldete Sitzung bestaetigen, dazu dient der
   Seitenabzug im Dashboard.
2. Rohstoffausgleich zwischen Doerfern nach dem Vorbild des Marktmanagers.
3. Raubzuege, da sie auf dieser Welt aktiv sind und wenig Aufmerksamkeit binden.
4. Farmen nach Vorlagen A, B und C.
5. Angriffsplanung mit Laufzeitberechnung aus `get_unit_info` und der Karte.
