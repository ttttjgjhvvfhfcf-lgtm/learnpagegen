# learnpagegen — Lernseiten im „MET-Stil“ erzeugen

Dieses Repo erzeugt **Lernseiten**: je Fach/Thema *eine* in sich geschlossene HTML-Datei (CSS + JS inline, kein Framework, kein Build).
Vorbild ist `reference/MET-Lernseite.html` („MET — Elektroinstallation & Sicherheit“, Klasse „MET 2Md“; österreichischer Kontext:
ÖVE/ÖNORM, AUVA, Notruf 144). Sprache der Seiten: **Deutsch (Österreich), du-Form**. Quellen sind meist Fotos von Mindmaps/Arbeitsblättern,
PDFs oder Notizen des Nutzers; daraus entstehen strukturierte Erklär-Abschnitte plus ein Karteikarten-Lernmodus.

## Dateien

| Pfad | Zweck |
|---|---|
| `template/lernseite-vorlage.html` | **Ausgangspunkt jeder neuen Seite.** Lauffähig, zeigt jede Komponente; Demo-Inhalt trägt `data-demo` / `demo: true`. |
| `tools/qa.cjs` | Browser-QA (Playwright + Chromium, in der Cloud-Umgebung vorinstalliert — **kein** `playwright install`). |
| `tools/embed-images.py` | Bettet Bilder als `data:`-URI ein → einzelne, weitergebbare Datei (braucht Pillow). |
| `reference/MET-Lernseite.html` | Original des Nutzers: Stilvorbild und Maß für Inhaltsdichte. **Nicht kopieren** (bekannte Fehler, s. u.); Bilder fehlen (`../MET/*.jpg`). |
| `pages/` | Fertige Seiten: `pages/<KÜRZEL>-Lernseite.html`, Bilder in `pages/<KÜRZEL>/`. |

## Ablauf für eine neue Seite

1. **Klären** (nur Fehlendes, eine Runde): Fach/Kürzel · Klasse (Toolbar-Label) · Titel · Material (Fotos, PDFs, Text) · Palette (Standard `amber`, sonst `blue|green|violet`) · Schwerpunkt (z. B. Test).
2. **Material komplett sichten** (Bilder wirklich ansehen, PDFs lesen). Abschnittsliste in Unterrichtsreihenfolge ableiten. Maßstab der Referenz: 21 Abschnitte, ~95 Karteikarten, 13 SVG-Diagramme, 18 Tabellen.
3. `mkdir -p pages && cp template/lernseite-vorlage.html pages/<KÜRZEL>-Lernseite.html`
4. **Kopf anpassen:** `<title>`, `data-slug` (klein, Schlüssel für localStorage), `data-palette`, Badge/H1/Subtitle/Motto, Toolbar-Label, `#learn-title`.
5. **Abschnitte bauen** (Komponenten unten); alle Demo-Abschnitte löschen/ersetzen. „Weitere Lernmaterialien“ ausfüllen oder löschen, Lernziele-Karte behalten.
6. **Karteikarten** in `window.FLASHCARDS` (Regeln unten).
7. **QA:** `node tools/qa.cjs pages/<…>.html --final` bis grün. Danach Screenshots in `qa-out/<name>/` ansehen (mind. `01-desktop-hell`, `03-desktop-dunkel`, `20-mobil-hell`, `11-desktop-lernmodus-hinten`).
8. **Inhalt gegenprüfen** (Abschnitt „Inhaltliche Sorgfalt“).
9. **Weitergabe als Einzeldatei:** `python3 tools/embed-images.py pages/<…>.html` → `<…>.eingebettet.html` (die Quelle behält relative Pfade und bleibt klein/editierbar; die eingebetteten Kopien sind in `.gitignore`).
10. Committen/Pushen nur auf Wunsch des Nutzers. Veröffentlichung als Artifact nur auf Wunsch (eingebettete Kopie nehmen; das Farb-Attribut heißt bewusst `data-palette`, weil der Artifact-Vertrag `data-theme="light|dark"` für hell/dunkel vorsieht).

## Aufbau einer Seite

`header.hero` (Badge, H1 „KÜRZEL — Titel“, Untertitel, Motto) → `.toolbar` (Label, 🎓 Lernmodus, 📑 Inhalt [nur mobil], 🌙/☀️) → `.page-layout` mit `#toc` (Seitenleiste) + `main.main-content`.
**TOC, Scroll-Spy, Lesefortschritt, Dark-Mode (gespeichert, folgt sonst dem System), Lightbox und Lernmodus laufen aus der Vorlage** — dafür nichts anfassen, nur Inhalt liefern.
TOC-Einträge entstehen automatisch aus jeder `<section id>` mit `.section-header` (Kurzname über `data-toc`, Icon aus `.section-icon`). Reihenfolge der Sektionen = Reihenfolge im TOC.

Abschnitt: `<section id="…" data-toc="Kurzname">` → `.section-header` (`.section-icon` Emoji · `.section-title` · `.section-subtitle` mit Norm/Umfang) → `.card` → [`.card-head > .card-title`] → **`.card-body`**.
Typischer Inhalt eines Abschnitts: `.lead` (fette Einleitungszeile) → ggf. Fotos des Nutzers (`.gallery`) → 2–4 Kacheln → Tabelle und/oder Diagramm → **ein** Merksatz (`.highlight-box`) am Ende.

## Komponenten (alle mit Beispiel in der Vorlage)

| Klasse | Verwendung |
|---|---|
| `.content-grid` (+ `.cols-2/3/4`) mit `.content-box` | 2–4 Kacheln, Titel `h3` mit Emoji. Akzent: `.tone-orange\|red\|blue\|green\|purple\|sky\|brown`; `.edge-top` = Akzent oben statt links. Am Ende optional `.pill`. |
| `.highlight-box` (+ `.is-danger\|is-ok\|is-info`) | Merksatz / Warnung / „gut zu wissen“. **Titel nur als `<span class="hb-title">`**, nie als `<strong>`. |
| `.pill` (+ `.is-ok\|is-info\|is-danger\|is-purple`) | kurzer Hinweis am Ende einer Kachel |
| `.formula` + `.formula-legend`, `.example` | Formel (Mono) mit Einheiten; Rechenbeispiel mit Zahlen und Ergebnis |
| `.tbl-wrap > table.tbl` (+ `.tone-blue\|green\|red`, `.wide`; `td.c`, `tr.hl`, `tr.danger`) | alle Tabellen (Zebra, Kopf in Palettenfarbe) |
| `figure.diagram > svg` | Inline-SVG auf heller Fläche (bleibt in beiden Modi lesbar) → feste helle Farben, `viewBox`, Text nie am Rand abschneiden (QA-Screenshot prüfen), SVG-IDs (z. B. `marker`) mit eindeutigem Präfix |
| `.gallery > .gallery-item > img` | Fotos/Mindmaps des Nutzers; Klick = Lightbox; `alt` Pflicht |
| `.tile-grid > .swatch` | Farbfelder (`style="--sw:#hex"`), z. B. Leiterfarben |
| `.card.goals` | Abschluss: Lernziele (je Hauptthema ein Punkt) |

Regeln: **immer `.card > .card-body`** (der Innenabstand sitzt dort — auch bei Cards im Grid) · keine Inline-Styles außer `--sw` · keine hartcodierten Farben im HTML (Dark-Mode funktioniert nur über die Variablen) · Bedeutungsfarben seitenweit gleich: rot = Gefahr/Kurzschluss/Stop, blau = Info/Neutral/Wasser, grün = OK/Standard/Schutzleiter, orange/gelb = Warnung/thermisch, lila = Sonderfall.

## Schreibstil der Inhalte

- Pro Abschnitt: Emoji-Icon, kurzer Titel, Untertitel; Stichpunkte ≤ ~12 Wörter, Schlüsselbegriffe `<strong>`.
- Zahlen deutsch: Dezimalkomma (1,5 mm²), Punkt als Tausender (100.000 Ω), Leerzeichen vor Einheit; `·` für Malnehmen, `→` für Folgerung, Einheiten in `[ ]`; Normen in Klammern („DIN EN 60529“).
- Rechenbeispiele immer mit konkreten Zahlen **und** Ergebnis; Merkregeln als Merksatz („Braun/Schwarz/Grau = Phase …“).

## Karteikarten (`window.FLASHCARDS = [{ cat, q, a }, …]`)

- 3–5 pro Abschnitt (Referenz: 95 in 18 Kategorien). `cat` = Kurzname des Abschnitts (1–2 Wörter), `q` ganze Frage.
- `a`: erste Zeile = direkte Antwort, danach `→`-Zeilen; bei Rechnerischem Formel + Zahlenbeispiel; 2–7 Zeilen (QA warnt ab 9).
- Fragetypen mischen: „Was bedeutet …?“, „Welche … gibt es?“, „Wie berechnet man …?“, „Was ist der Unterschied zwischen A und B?“, „Warum …?“, Merksatz.
- Nur Text (kein HTML), `\n` für Zeilenumbruch, typografische Anführungszeichen „…“ (nie `'` oder `"` im Text); Indizes als `I_N` / `R_ges` oder Unicode (₁ ₂ ² ³).
- Werte müssen mit den Abschnitten übereinstimmen.

## Inhaltliche Sorgfalt

Das sind Lernseiten für Prüfungen, bei Elektro zusätzlich sicherheitsrelevant.
- Fakten zuerst aus dem **Material des Nutzers**. Eigene Ergänzungen nur, wenn sicher; bei Zahlen/Normen im Zweifel weglassen oder dem Nutzer in der Antwort als „bitte prüfen“ auflisten.
- **Konsistenz:** derselbe Wert überall gleich (Abschnitt, Tabelle, Diagramm, Karte). Das Original widerspricht sich z. B. bei den Außenleiterfarben (Tabelle „Aderfarben“: Schwarz = L1, Grau = L2, Braun = L3; Karteikarten: Braun/Schwarz/Grau; üblich: L1 braun, L2 schwarz, L3 grau).
- Tippfehler/Satzbau lesen (Original: „Bimetallouslöser“, „Nicht selbstansaugend bei Verschmutzung empfindlich“). Warnungen nie abschwächen, Werte nie raten.

## QA

`node tools/qa.cjs <seite.html> [--final] [--palette blue|green|violet] [--full] [--out <ordner>]` (dauert ~30–90 s; Screenshots standardmäßig in `qa-out/<name>/`, nicht committen).
Prüft: JS-Fehler · doppelte IDs · `.card` ohne `.card-body` · `<strong>` in Boxen · TOC = Sektionen · Scroll-Spy in **jeder** Sektion · Bilder laden/`alt` · Karteikarten-Daten · Lernmodus komplett durchspielen · Dark-Mode (+ Neuladen) · Mobil 390 px ohne horizontales Scrollen · mobiles Inhaltsverzeichnis · mobiler Lernmodus.
`--final` macht Vorlagenreste (`data-demo`, „KÜRZEL“, `data-slug="kuerzel"`, `demo: true`, Standard-Titel) zu Fehlern. Exit-Code 1 bei Fehlern. Jeder Schritt wird einzeln abgefangen; bei „Timeout“-Meldungen im mobilen Lernmodus zuerst den Overflow-Fehler beheben.
Die QA beurteilt nicht, ob etwas gut aussieht (abgeschnittene SVG-Texte, Farbkontraste, Umbrüche): Screenshots immer selbst ansehen.

## Bekannte Fehler der Referenz (in der Vorlage behoben — nicht wieder einbauen)

1. 34 von 48 `.card` ohne `.card-body` → kein Innenabstand. 2. `.highlight-box strong{display:block}` zerhackt Sätze in Merksatz-Boxen. 3. TOC-Reihenfolge ≠ Seitenreihenfolge → Scroll-Spy markiert in 7 von 21 Sektionen den falschen Eintrag.
4. Mobil 709 px breit bei 390 px (Ursache: `.page-layout{align-items:flex-start}` bleibt bei `flex-direction:column` aktiv; `align-items:stretch` allein behebt es). 5. Inhaltsspalte nur ~635 px (`main{max-width:900px}` umschloss TOC + Inhalt). 6. `--text-muted` nie definiert, `.learn-category` ohne Basis-CSS (Kategorie-Badge ungestylt), `toast()` ungenutzt.
7. 747 Inline-Styles → Dark-Mode nur mit `!important`-Overrides. 8. Karteikarte mit fester Höhe 260 px (längste Antwort füllt sie bis zum Rand). 9. Bilder als `../MET/…` → in weitergegebener Datei alle kaputt. 10. Kleiner Text/Buttons in `#d97706` (Kontrast 3,2:1) → Vorlage nutzt `--primary-strong`.

## Aus der Referenz portieren

Die 95 Original-Karteikarten (`{cat,q,a}`) laufen 1:1 in der Vorlage. HTML-Abschnitte der Referenz rendern in der neuen CSS, brauchen aber: `<strong>Titel</strong>` in `.highlight-box` → `<span class="hb-title">` · `.card` mit direktem `h3`/Tabelle → in `.card-body` packen · Inline-Tabellen → `.tbl-wrap > .tbl` · `onclick="openLightbox/scrollToSection"` weglassen (macht die Vorlage selbst) · `var(--text-muted)` → `var(--muted)` · hartcodierte Pastellfarben → `.pill` / `.tone-*` / `.is-*`.

## Ideen (nicht umgesetzt — nur auf Wunsch)

„Schwer“-Karten am Ende wiederholen (die Referenz zählt sie nur) · Lernfortschritt in localStorage · Kategorie-Filter im Lernmodus · Druckansicht · Suchfeld.
