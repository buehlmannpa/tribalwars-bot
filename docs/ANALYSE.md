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

## 2. Welt 97 Schweiz

Abgefragt ueber `https://ch97.staemme.ch/interface.php?func=get_config`.

| Einstellung | Wert |
|---|---|
| Weltgeschwindigkeit | 1.6 |
| Einheitengeschwindigkeit | 0.625 |
| Moral | 3 |
| Bogenschuetzen | nein |
| Kirche | nein |
| Wachturm | ja |
| Raubzuege | aktiv |
| Adelsgeschlecht | Goldmuenzen, automatische Praegung im Spiel vorhanden |
| Muenzkosten | 28000 Holz, 30000 Lehm, 25000 Eisen |
| Nachtbonus | 23:00 bis 08:00, Verteidigungsfaktor 3 |
| Sitter | erlaubt, hoechstens 3 |
| Befehlsabstand | 150 Millisekunden, Ankunft auf Millisekunden genau |
| Kartengroesse | 1000, Start bei 500 zu 500 |
| Gratis Premium | bei 500 und 15000 Punkten |
| Gratis Accountmanager | bei 10, 25, 100, 250, 500 und 1000 Doerfern |

Wichtig: Die automatische Muenzpraegung ist bereits eine Funktion des Spiels,
sie muss nicht nachgebaut werden. Ebenso gibt es den Accountmanager auf dieser
Welt bei Meilensteinen befristet gratis.

## 3. Funktionsumfang des offiziellen Accountmanagers

| Teil | Verhalten laut Wiki |
|---|---|
| Dorfmanager | Bauvorlagen mit fester Bauschleife, Zuweisung je Dorf, Pausieren, optionaler Abriss ueberschuessiger Stufen ab Zustimmung 100 und Hauptgebaeude 15 |
| Truppenmanager | Zielbestand je Dorf, Pakete zu 50 in der Kaserne, 20 im Stall, 10 in der Werkstatt, hoechstens zwei Auftraege je Gebaeude, Puffer fuer Rohstoffe und Bauernhof, Abschaltung bei Angriff oder vollem Bauernhof, gleichmaessiger Fortschritt ueber alle Einheiten |
| Marktmanager | bis zu 50 Handelsrouten mit Wochentag und gewuenschter Ankunftszeit |
| Forschungsmanager | Reihenfolge der Schmiedeforschung ueber Vorlagen, Pausieren je Dorf |
| Farmassistent | Vorlagen A und B, Variante C fuellt die Tragekapazitaet passend zu den erwarteten Rohstoffen, Farmen aus Karte, Bericht und Tabelle |

Diese App bildet bewusst zuerst Dorfmanager und Truppenmanager nach.

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
