# Tabgruppen · Once

Persönlicher MIT-lizenzierter Fork von [loilo/auto-group-tabs](https://github.com/loilo/auto-group-tabs), ursprünglich auf Version 0.0.24 (`c354e34`) aufgebaut. Diese Erweiterung ordnet **neue Tabs einmalig** einer nativen Chrome-Gruppe zu. Danach bleiben Navigation und manuelles Verschieben ohne automatische Neuzuordnung.

## Einstellungen ab Version 0.2.0

Version **0.2.1** korrigiert zusätzlich die Zuordnung des Tabs, der einen schlafenden Hintergrundprozess aufweckt. Dieser neue Tab darf beim Aufwachen nicht versehentlich als bereits verarbeiteter Bestand geschützt werden. Der Neustartschutz bleibt unverändert.

Popup und Einstellungsseite wurden für den Once-Ablauf neu aufgebaut. Die Oberfläche ist durchgehend deutsch. Die frühere Regelerstellung im Popup, „Exakt“, verschachtelte Originaldialoge und „Neu laden erzwingen“ werden nicht mehr verwendet. Die vorhandenen Komponenten des Originals gehören nicht mehr zum Oberflächen-Einstiegspunkt.

- **Popup:** Übersicht der gespeicherten Regeln und Schaltfläche „Einstellungen öffnen“.
- **Eigene Einstellungsseite:** Gruppenname, Farbe neuer Gruppen, URL-Muster, Titel-Ausnahmen und Fensterzuordnung werden direkt an der jeweiligen Regel bearbeitet.
- **Reihenfolge:** Die erste passende Regel gewinnt. Pfeiltasten an jeder Karte verschieben Regeln nach oben oder unten. Eine Auffangregel mit `*` steht üblicherweise zuletzt; andernfalls erscheint ein Hinweis.
- **Explizites Speichern:** Bearbeitung, Import, Löschen und Einsetzen der Standardregeln verändern zunächst nur den Entwurf. „Änderungen speichern“ übernimmt ihn. „Änderungen verwerfen“ lädt den gespeicherten Stand.
- **Vorschau:** Eine Adresse und ein Tabtitel zeigen die Zuordnung gemäß dem Entwurf. Dafür wird derselbe Matcher wie im Hintergrund verwendet; kein Tab wird verschoben.
- **Sicherung:** Exportiert wird der gespeicherte Stand als versionierte JSON-Datei. Der Import akzeptiert diese Datei sowie die Array-Exporte früherer Versionen.

Bereits gespeicherte Gruppen, IDs, Farben, Muster, Titel-Ausnahmen und Fensteroptionen werden aus dem bisherigen Speicherformat übernommen. Es gibt keine automatische Migration beim bloßen Öffnen der Einstellungen. Die nicht mehr verwendete Option `strict` wird bei einem ausdrücklichen Speichervorgang auf `false` gesetzt.

Änderungen aus einem zweiten Fenster überschreiben keinen offenen Entwurf automatisch. Vor dem Speichern wird der zuletzt gelesene Stand erneut verglichen. Ein erkannter Konflikt verlangt das bewusste Neuladen. Dies ist keine atomare Transaktion zwischen exakt gleichzeitigen Speichervorgängen.

## Standardverhalten

1. Neue ChatGPT-Tabs (`https://chatgpt.com/*`, `https://chat.openai.com/*`) kommen in **GPT**. Eine bestehende Gruppe wird anhand ihres Namens verwendet; die GPT-Standardregel darf sie auch in einem anderen normalen Fenster finden.
2. Alle anderen neuen Tabs, auch leere Tabs, kommen in **Default** im jeweiligen Fenster.
3. URL und Titel werden nach dem ersten Laden geprüft, sobald sie kurz stabil sind; bei dauerhaftem Laden spätestens nach zwölf Sekunden.
4. Danach wird der Tab nicht erneut einsortiert. Auch ein zunächst leerer Tab in Default bleibt dort, wenn später ChatGPT darin geöffnet wird.

Eine Titel-Ausnahme greift, wenn der **erste Tabtitel** einen eingetragenen Begriff enthält, unabhängig von Groß-/Kleinschreibung. Dann wird die nächste Regel geprüft. Es geht nicht um Lesezeichen- oder Gruppennamen. Ein Titel, den die Website später ändert, wird nicht erneut geprüft.

Fensterübergreifende Zuordnung verschiebt einen passenden neuen Tab bei Bedarf zur vorhandenen Gruppe. Normale und private Fenster werden nicht vermischt. Angeheftete Tabs, Split-Views und Popup-Fenster bleiben unverändert. Eine vorhandene Gruppe behält ihre Farbe; die konfigurierte Farbe gilt beim Anlegen einer neuen Gruppe.

## Neustartschutz

Chrome meldet auch wiederhergestellte Tabs über `tabs.onCreated`. Der Hintergrund schützt deshalb die Startphase, bis drei Sekunden lang kein weiterer Tab erstellt wurde. Während dieser Phase selbst neu geöffnete Tabs bleiben ebenfalls unverändert. Bereits verworfene oder nicht geladene Wiederherstellungstabs bleiben auch bei späteren Meldungen geschützt.

Tab- und Gruppen-IDs gelten nur innerhalb einer Browsersitzung. Nach einem vollständigen Neustart bleibt die von Chrome wiederhergestellte Gruppierung maßgeblich; alte numerische IDs werden nicht weiterverwendet. Ein ungewöhnlich spät wiederhergestellter, bereits geladener Tab ist von einem tatsächlich neuen Tab nicht sicher unterscheidbar. Die Pause ist keine dauerhafte Identitätsgarantie. Es werden keine Gruppen oder Tabs aus eigenen Kopien wiederhergestellt.

## Installation und Update

1. ZIP entpacken und dauerhaft aufbewahren. Eine installierte Original-Erweiterung vorher deaktivieren.
2. Unter `chrome://extensions` den Entwicklermodus aktivieren.
3. „Entpackte Erweiterung laden“ wählen und **den Ordner `extension-chromium`** auswählen; darin liegt `manifest.json`.

**Update einer bestehenden Installation:** Chrome geöffnet lassen. Die Dateien aus `extension-chromium` des neuen ZIPs in den bisher geladenen `extension-chromium`-Ordner kopieren und ersetzen. Bei derselben Erweiterung unter `chrome://extensions` auf **Neu laden** klicken. Keine zweite Installation anlegen: So bleiben die vorhandenen Regeln erhalten. Danach kurz warten, bis der Startschutz vorbei ist.

## Berechtigungen und Daten

Unverändert: `tabs`, `tabGroups`, `storage`. Keine zusätzlichen Berechtigungen, Host-Freigaben oder Content-Skripte. Die neue Oberfläche verwendet keine externen Dienste, Schriftserver oder Netzwerkanfragen. Regeln liegen weiterhin komprimiert in Chrome-Sync; der Sitzungsstatus enthält Tab-IDs und den Startschutz, keine URLs oder Titel. Die vorhandene MIT-Lizenz bleibt erhalten.

## Entwicklung und Prüfung

Node.js 24 und `npm ci`. `npm run dev` startet die lokale Oberfläche auf Port 6655; `/?context=options` öffnet die Einstellungsseite, `/?context=popup` das Popup. Ohne Erweiterung wird für die Entwicklung `localStorage` verwendet.

- `npm run test:unit`: Zuordnung, Neustartschutz, Übernahme alter Regeln, Import/Export, Vorschau und Speicherfehler.
- `npm run test:types` und `npm run test:lint`: Typen und Lint.
- `npx playwright install chromium`, anschließend `npm run test:browser`: Oberfläche, Speichern und Wiederladen, Ausnahmen, Priorität, Import, Popup und schmale Fenster.
- `npm run build:chromium`: vollständige Prüfungen und Chrome-Build.

Der Chrome-Build liegt anschließend in `extension-chromium`. Ein Merge oder eine Veröffentlichung im Chrome Web Store sind eigene Schritte.

In eingeschränkten Testumgebungen kann Playwright über `PW_CHROMIUM_EXECUTABLE_PATH` einen bereits vorhandenen Chromium-Browser verwenden. `PW_CHROMIUM_ARGS` nimmt bei Bedarf ein JSON-Array zusätzlicher Startargumente auf. Diese Optionen betreffen ausschließlich den Testbrowser, nicht die ausgelieferte Erweiterung.
