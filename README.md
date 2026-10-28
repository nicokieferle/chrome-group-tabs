# Tabgruppen · Once

Persönlicher MIT-lizenzierter Fork von [loilo/auto-group-tabs](https://github.com/loilo/auto-group-tabs), ursprünglich auf Version 0.0.24 (`c354e34`) aufgebaut. Diese Erweiterung ordnet **neue, ungruppierte Tabs einmalig** einer nativen Chrome-Gruppe zu. Bereits vorhandene oder geerbte Gruppen haben immer Vorrang vor URL-Regeln. Danach bleiben Navigation und manuelles Verschieben ohne automatische Neuzuordnung.

## Einstellungen ab Version 0.2.0

Version **0.3.0** ergänzt namenlose Gruppen, manuelle Gruppen ohne URL-Regel, „Dauerhaft offen halten“ und ein neues Tabgruppen-Icon für Toolbar, Einstellungen und Start-Tabs.

### Manuelle und dauerhaft offene Gruppen

- **Name optional:** Ein leeres Namensfeld erzeugt eine native Chrome-Gruppe ohne Text, nur mit dem Farbpunkt. „Ohne Namen“ ist lediglich die Beschriftung in der Erweiterung.
- **Gruppe ohne Regel:** Mit „+ Gruppe ohne Regel“ eine manuelle Gruppe anlegen. Sie fängt keine URLs ab. „Neue Tabs automatisch zuordnen“ kann pro Gruppe separat ein- oder ausgeschaltet werden. Automatische Gruppen benötigen weiterhin mindestens ein gültiges URL-Muster.
- **Dauerhaft offen halten:** Die Gruppe erhält einen eigenen Start-Tab, damit sie auch ohne weitere Seiten offen bleibt. Er wird bei Bedarf ersetzt bzw. die Gruppe nach dem Schließen neu geöffnet, solange Chrome ein normales Fenster offen hat. Es werden keine zusätzlichen Browserfenster erzeugt. Das Ausschalten der Option oder das Entfernen der Konfiguration beendet das Offenhalten, ohne die vorhandenen Tabs zu schließen. Neue manuelle Gruppen haben diese Option zunächst eingeschaltet.
- **Öffnen:** Nach dem Speichern lässt sich jede Gruppe in Einstellungen oder Popup mit „Gruppe öffnen“ bzw. „Öffnen“ öffnen. Eine bereits offene Gruppe wird wiederverwendet und in den Vordergrund geholt. Änderungen im Entwurf werden erst nach dem Speichern verwendet.
- **Stabile Identität:** Der eigene Start-Tab trägt die Konfigurations-ID. Dadurch lassen sich auch mehrere namenlose Gruppen derselben Farbe nach einem vollständigen Chrome-Neustart eindeutig wiederfinden. Weitere Fenster erzeugen keine Kopien. Normale und private Gruppen bleiben getrennt; eine private Gruppe wird nur auf ausdrückliche Anforderung geöffnet.
- **Manuelle Änderungen:** Bereits zugeordnete Nutzer-Tabs werden weiterhin nie automatisch umsortiert. Wird der Start-Tab selbst manuell entgruppiert, respektiert die Erweiterung das und wartet, bis er wieder einer Gruppe zugeordnet oder geschlossen wird. Manuell umbenannte Gruppen behalten ihren nativen Namen. Name und Farbe in den Einstellungen gelten beim Anlegen einer neuen Gruppe.

Der Start-Tab bietet ein Adressfeld: Eine eingegebene Adresse öffnet sich im selben Tab und bleibt in dieser Gruppe. Suchbegriffe öffnen eine Google-Suche. Bei aktivem Offenhalten ergänzt die Erweiterung anschließend wieder einen Start-Tab. Bis zu einer solchen Nutzeraktion sendet die Oberfläche keine externen Netzwerkanfragen.

Gruppen, Konfigurations-IDs und Sicherungen aus älteren Versionen bleiben erhalten. Das bestehende Backupformat akzeptiert nun auch leere Gruppennamen und leere Matcher-Listen; `options.keepOpen` ist optional und bei alten Regeln ausgeschaltet.

### Bisherige Korrekturen

Version **0.2.3** schützt bereits zugeordnete Tabs konsequent. Ein ChatGPT-Tab in **Coding** bleibt in Coding, auch wenn eine passende GPT-Regel und eine eigene GPT-Gruppe vorhanden sind. Das gilt auch bei geerbter oder verzögert gemeldeter Gruppenzugehörigkeit und beim Aufwachen des Hintergrundprozesses. Sobald eine Gruppierung beobachtet wird, endet die automatische Erstzuordnung. Alte offene Entscheidungen, die bereits gruppierte Tabs akzeptiert hatten, werden verworfen.

Version **0.2.2** verhindert zusätzliche Gruppenkopien durch neue Fenster. Leere Tabs warten auf den ersten Seitenaufruf. Jede Regel bindet sich innerhalb der Browsersitzung an eine feste native Gruppen-ID, getrennt für normale und private Fenster. Die Fensteroption steuert das Verschieben zur Zielgruppe; sie legt keine weiteren Gruppen pro Fenster mehr an. Bereits vorhandene doppelte Gruppen werden nicht automatisch zusammengeführt.

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

1. Neue, ungruppierte ChatGPT-Tabs (`https://chatgpt.com/*`, `https://chat.openai.com/*`) kommen in **GPT**. Die GPT-Standardregel darf diese Tabs dafür auch in ein anderes normales Fenster verschieben. Ein Tab, der bereits in Coding, Default oder einer anderen Gruppe liegt, bleibt dort. Auch neue Tabs mit geerbter Gruppenzugehörigkeit werden nicht umsortiert.
2. Alle anderen neuen, ungruppierten Seiten werden **Default** zugeordnet. Die Default-Standardregel lässt Tabs in ihrem Fenster. Liegt die feste Default-Gruppe in einem anderen Fenster, bleibt der Tab ohne neue Zuordnung hier; es entsteht keine zweite Default-Gruppe. Für eine gemeinsame Default-Gruppe samt Tab-Verschiebung „Bestehende Gruppe auch in anderen Fenstern“ wählen und speichern.
3. Leere Tabs (`chrome://newtab/`, `about:blank` oder noch ohne Adresse) erzeugen keine Gruppe und werden nicht in ein anderes Fenster verschoben. Sie warten auch über das Einschlafen des Hintergrundprozesses hinweg auf den ersten Seitenaufruf.
4. URL und Titel werden nach dem ersten Laden geprüft, sobald sie kurz stabil sind; bei dauerhaftem Laden spätestens zwölf Sekunden nach der ersten Zieladresse. Danach wird der Tab nicht erneut einsortiert. Spätere Navigation und manuelles Verschieben bleiben unverändert.

Eine Titel-Ausnahme greift, wenn der **erste Tabtitel** einen eingetragenen Begriff enthält, unabhängig von Groß-/Kleinschreibung. Dann wird die nächste Regel geprüft. Es geht nicht um Lesezeichen- oder Gruppennamen. Ein Titel, den die Website später ändert, wird nicht erneut geprüft.

Jede Regel verwendet eine feste Zielgruppe pro normalem bzw. privatem Kontext. Beim ersten Zuordnen wird eine vorhandene Gruppe anhand ihres Namens gewählt, bevorzugt mit der konfigurierten Farbe. Danach bleibt ihre ID maßgeblich, auch nach manuellem Umbenennen, Farbwechsel, Verschieben der Gruppe oder Einschlafen des Hintergrundprozesses. Eine gleichnamige Gruppe im Quellfenster ersetzt diese Bindung nicht. Fehlt die Zielgruppe, wird eine passende vorhandene Gruppe gewählt oder eine neue angelegt. Eine ausdrücklich geänderte Zielgruppenbezeichnung in der Regel löst die alte Bindung.

Fensterübergreifende Zuordnung verschiebt einen passenden neuen Tab bei Bedarf zur festen Zielgruppe. „Im Fenster bleiben (keine Gruppenkopie)“ lässt den Tab ohne neue Zuordnung, wenn die Zielgruppe anderswo liegt. Normale und private Fenster werden nicht vermischt. Angeheftete Tabs, Split-Views und Popup-Fenster bleiben unverändert. Eine vorhandene Gruppe behält ihre Farbe; die konfigurierte Farbe gilt beim Anlegen einer neuen Gruppe. Bestehende Duplikate und manuelle Gruppierungen bleiben erhalten.

## Neustartschutz

Chrome meldet auch wiederhergestellte Tabs über `tabs.onCreated`. Der Hintergrund schützt deshalb die Startphase, bis drei Sekunden lang kein weiterer Tab erstellt wurde. Während dieser Phase selbst neu geöffnete Tabs bleiben ebenfalls unverändert. Bereits verworfene oder nicht geladene Wiederherstellungstabs bleiben auch bei späteren Meldungen geschützt.

Tab- und Gruppen-IDs gelten nur innerhalb einer Browsersitzung. Nach einem vollständigen Neustart bleibt die von Chrome wiederhergestellte Gruppierung maßgeblich; alte numerische IDs und Zielgruppen-Bindungen werden nicht weiterverwendet. Gruppen mit eigenem Start-Tab werden über dessen Konfigurations-ID wiedererkannt. Andere neue Zuordnungen finden die Zielgruppe anhand des konfigurierten Namens, bei namenlosen Gruppen anhand von Farbe und freier Bindung. Ein ungewöhnlich spät wiederhergestellter, bereits geladener Tab ist von einem tatsächlich neuen Tab nicht sicher unterscheidbar. Die Pause ist keine dauerhafte Identitätsgarantie. Nutzer-Seiten werden weder dupliziert noch aus eigenen Kopien wiederhergestellt; nur ausdrücklich dauerhaft offene Gruppen erhalten bei Bedarf einen neuen eigenen Start-Tab.

## Installation und Update

1. ZIP entpacken und dauerhaft aufbewahren. Eine installierte Original-Erweiterung vorher deaktivieren.
2. Unter `chrome://extensions` den Entwicklermodus aktivieren.
3. „Entpackte Erweiterung laden“ wählen und **den Ordner `extension-chromium`** auswählen; darin liegt `manifest.json`.

**Update einer bestehenden Installation:** Chrome geöffnet lassen. Die Dateien aus `extension-chromium` des neuen ZIPs in den bisher geladenen `extension-chromium`-Ordner kopieren und ersetzen. Bei derselben Erweiterung unter `chrome://extensions` auf **Neu laden** klicken. Keine zweite Installation anlegen: So bleiben die vorhandenen Regeln erhalten. Danach kurz warten, bis der Startschutz vorbei ist.

## Berechtigungen und Daten

Unverändert: `tabs`, `tabGroups`, `storage`. Keine zusätzlichen Berechtigungen, Host-Freigaben oder Content-Skripte. Die neue Oberfläche verwendet keine externen Dienste, Schriftserver oder Netzwerkanfragen. Regeln liegen weiterhin komprimiert in Chrome-Sync; der Sitzungsstatus enthält Tab-IDs, Zielgruppen-IDs mit konfigurierten Gruppennamen und den Startschutz, keine URLs oder Seitentitel. Die vorhandene MIT-Lizenz bleibt erhalten.

## Entwicklung und Prüfung

Node.js 24 und `npm ci`. `npm run dev` startet die lokale Oberfläche auf Port 6655; `/?context=options` öffnet die Einstellungsseite, `/?context=popup` das Popup. Ohne Erweiterung wird für die Entwicklung `localStorage` verwendet.

- `npm run test:unit`: Zuordnung, Neustartschutz, Übernahme alter Regeln, Import/Export, Vorschau und Speicherfehler.
- `npm run test:types` und `npm run test:lint`: Typen und Lint.
- `npx playwright install chromium`, anschließend `npm run test:browser`: Oberfläche, Speichern und Wiederladen, Ausnahmen, Priorität, Import, Popup und schmale Fenster.
- `npm run build:chromium`: vollständige Prüfungen und Chrome-Build.

Der Chrome-Build liegt anschließend in `extension-chromium`. Ein Merge oder eine Veröffentlichung im Chrome Web Store sind eigene Schritte.

In eingeschränkten Testumgebungen kann Playwright über `PW_CHROMIUM_EXECUTABLE_PATH` einen bereits vorhandenen Chromium-Browser verwenden. `PW_CHROMIUM_ARGS` nimmt bei Bedarf ein JSON-Array zusätzlicher Startargumente auf. Diese Optionen betreffen ausschließlich den Testbrowser, nicht die ausgelieferte Erweiterung.
