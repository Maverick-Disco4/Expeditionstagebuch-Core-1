# Expeditionstagebuch Core 1.2

Saubere PWA-Version für mehrere Expeditionen.

## Neu in Core 1.2
- Etappen bearbeiten
- Etappen sortieren mit ↑/↓ und Drag & Drop
- Etappen duplizieren
- Etappen löschen
- Trip importieren/exportieren
- Backup importieren/exportieren
- Kartenmodul mit geplanter Route
- Straßenroute normal über OSRM/OpenStreetMap
- Option „Straßenroute ohne Autobahn“ über OpenRouteService API-Key
- Routencache mit Cache-leeren
- GPS-Grundtracking mit Display-Wachhalten
- gefahrene Tracks bleiben pro Expedition gespeichert
- Journal/POI- und Reisekassen-Grundfunktionen aus Core 1.1

## Dateien für GitHub Pages
- index.html
- app.js
- styles.css
- trips.json
- manifest.webmanifest
- sw.js
- README.md

## Core 1.3 – Etappen-Minikarten
- Jede Etappe zeigt eine eigene Minikarte.
- Pro Etappe kann die echte Straßenroute zum nächsten Etappenziel geladen werden.
- Etappenrouten werden lokal gecached.
- Minikarten zeigen Start, Ziel und entweder echte Route oder gestrichelte Luftlinie.
- Etappen-Metakarten zeigen echte Routing-km und Routingzeit, sobald berechnet.

## Core 1.4 – Karten im Querformat
- Etappen-Minikarten werden größer dargestellt.
- Im Querformat nutzt die Karte deutlich mehr Bildschirmhöhe.
- Hauptkarte wird im Querformat ebenfalls vergrößert.
- Nach Drehen des Smartphones werden alle Leaflet-Karten neu gerendert.
- Routen werden nach Rotation wieder passend zentriert.
- Start/Ziel beziehungsweise Straßenroute bleiben im sichtbaren Bereich.

## Core 1.5 – Korrektes Etappenmodell
- Jede Etappe hat eigenen Start und eigenes Ziel.
- Jede Etappe hat eigene Start- und Zielkoordinaten.
- Minikarten berechnen jetzt die Route der jeweiligen Etappe, nicht mehr die Verbindung zum nächsten Etappenziel.
- Bad Zwischenahn → Morvan wird nun als eigene Route berechnet.
- Große Expeditionskarte nutzt Startpunkt der ersten Etappe plus Zielpunkte aller Etappen.
- Alte Daten werden beim Laden automatisch in das neue Modell überführt.

## Core 1.6 – Stabilitätsfix Etappenrouten
- Jede Etappe wird beim Laden robust auf Start-/Zielkoordinaten geprüft.
- Alte Routencaches aus 1.3/1.5 werden ignoriert beziehungsweise gelöscht.
- Erfolgreich berechnete Routen werden direkt in der Etappe gespeichert.
- Minikarten zeichnen gespeicherte Routen, danach Cache, danach Luftlinie.
- Button „Alle Routen berechnen“ ergänzt.
- Statusanzeige und Fortschritt für Sammelberechnung.
- Routingfehler werden pro Etappe sichtbar statt still zu scheitern.
- Minikarten werden auf Android robuster neu gezeichnet.

## Core 1.6a – Rundtage und identische Koordinaten
- Identische Start-/Zielkoordinaten werden erkannt.
- Rundtage/Aufenthaltstage werden als solche markiert.
- Bekannte Problemziele wie Dierre, Chenonceau/Chenonceaux und Chambord werden bei identischen Koordinaten automatisch korrigiert.
- „Alle Routen berechnen“ prüft Rundtage und berechnet echte Etappen.
