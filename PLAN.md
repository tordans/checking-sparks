# Checking Sparks – Plan (Entwurf, 2026-10-21)

Familien-Werkzeug für wiederkehrende Arzttermine (Vorsorge).
Grundlage: [docs/research.md](docs/research.md).

Status: **Entwurf**, Grundsatzentscheidungen vom 2026-10-21 eingetragen (Abschnitt 9).

## 1. Bauen oder nutzen?

**Entscheidung: selbst bauen, nur Vorsorge.**

- Vorsorge mit eigenen Zyklen, zwei Zeitfenstern, Status und mehreren Personen gibt es nicht.
  Erinnerungsdienste der Kassen (z. B. TK-VorsorgePlaner) erinnern nur; sie bleiben ein
  sinnvolles zweites Sicherheitsnetz.
- Impfnachweise selbst gehören in ePA / Impfpass. Das Tool merkt sich nur Fälligkeiten.
- Symptomtagebücher sind **nicht im Umfang** (Abschnitt 4).

## 2. Personen und Familie

- `Person`: Name, Geburtsdatum (für altersabhängige Vorsorge wie U-/J-Untersuchungen,
  Check-up ab 35, Hautkrebs-Screening), optional Geschlecht für Vorlagen.
- Alle Erwachsenen sehen und bearbeiten alle Personen. Kinder werden von Erwachsenen verwaltet.
  Keine Rollen, keine Rechte – Vertrauensmodell Familie.
- Zyklen, Termine und Tagebücher hängen immer an genau einer Person.
- Umschalten der Person oben in der App; die Person steht auch in jeder Deep-Link-URL.

## 3. Vorsorge (Kernfunktion)

### Begriffe

- **Vorsorge-Art** (pro Person): z. B. „Grippeimpfung“, „Prostata-Früherkennung“, „Zahnarzt“.
  Felder: Titel, Arzt/Praxis (Freitext, Telefon), Zyklus, Buchungsvorlauf, Durchführungsfenster,
  Notiz, aktiv/pausiert.
- **Zyklus**: „alle N Monate/Jahre“. Zwei Verankerungen:
  - *ab letztem Termin* (Standard): nächstes Fenster = letzter erledigter Termin + Intervall
    (Zahnarzt, Check-up alle 3 Jahre).
  - *saisonal / fester Zeitraum*: jedes Jahr z. B. Oktober–November (Grippeimpfung).
- **Fälligkeit** (berechnet, eine pro Zyklus):
  - *Buchungsfenster*: ab wann ich den Termin buchen soll (z. B. 8 Wochen vor dem Durchführungsfenster).
  - *Durchführungsfenster*: Zeitraum, in dem der Termin stattfinden muss.
- **Status einer Fälligkeit**: `offen` → `gebucht (Datum)` → `erledigt (Datum)`
  oder jederzeit `übersprungen (Grund)`. Erinnerungen enden bei `gebucht`, ein neuer Hinweis kommt
  am Termin selbst („Hat der Termin stattgefunden?“).
- Übersprungen: der nächste Zyklus rechnet ab dem Ende des übersprungenen Fensters.

### Ansichten

1. **Jetzt zu tun** (Startseite, alle Personen): „buchen“ (Buchungsfenster läuft),
   „überfällig“, „Termin steht an“, „bestätigen, ob erledigt“.
2. **Pro Person**: Liste aller Vorsorge-Arten mit nächster Fälligkeit und Verlauf.
3. **Vorlagen**: Katalog mit Standardvorsorge (gesetzliche Früherkennung, STIKO-Impfungen,
   U/J-Untersuchungen) nach Alter/Geschlecht. Übernehmen und anpassen statt alles neu tippen.
   Die Vorlagen sind Startwerte, keine medizinische Beratung.

## 4. Nicht im Umfang: Symptomtagebücher

Tägliche Symptom- oder Medikamententagebücher gehören nicht in diese App; dafür gibt es
spezialisierte Apps. Datenmodell und Benachrichtigungen sind aber so angelegt, dass ein
Tageseintrag pro Person später nachrüstbar wäre.

## 5. Erinnerungen

| Anlass | Wann | Ziel (Deep Link) |
| --- | --- | --- |
| Buchungsfenster beginnt | einmal, dann wöchentlich bis „gebucht“ | `/person/:id/vorsorge/:art` |
| Durchführungsfenster endet bald, noch nicht gebucht | 2 Wochen vorher | dito |
| Termin am nächsten Tag | Vorabend | dito |
| Nach dem Termin | Folgetag: „erledigt?“ | dito, Dialog „erledigt“ |

**Entschieden: Web Push.** Der Cronjob auf dem Webspace verschickt die Nachrichten an alle
registrierten Geräte der Erwachsenen (Abo pro Gerät, nicht pro Person). Jede Nachricht nennt
Person und Vorsorge im Klartext („Kind: U9 bis 15.03. buchen“) und öffnet die passende Stelle.

Datenschutz der Nachricht: Web-Push-Inhalte sind nach RFC 8291 Ende-zu-Ende verschlüsselt
(Schlüssel nur im Browser des Geräts). Apples bzw. Googles Push-Dienst sieht nur Metadaten
(Zeitpunkt, Gerät, Größe), nicht den Text. Lesbar ist der Text auf dem Sperrbildschirm und im
Erinnerungsplan auf dem Webspace (Abschnitt 6).
Auf dem iPhone muss die App dafür zum Home-Bildschirm hinzugefügt werden.
Kalender-Export (`.ics`) für einen konkreten gebuchten Termin ist ein kleines Extra für später.

## 6. Speicher und Sync

Anforderungen: mehrere Geräte (2 iPhones, Laptops), zwei Erwachsene, keine dauerhafte Bindung
an einen Anbieter, jederzeit vollständiger Export.

**Entschieden: eigener Webspace** mit Ende-zu-Ende-Verschlüsselung, Konzept aus
`vacation-planner/docs/central-storage-plan.md`.

- Statische App + ein PHP-Endpunkt; die Daten liegen als ein JSON-Dokument pro Familie
  (oder SQLite/MariaDB-Zeile), Versionierung per `If-Match`, bei Konflikt neu laden und
  Änderungen auf Datensatz-Ebene zusammenführen (jeder Datensatz hat `id` + `updatedAt`).
- Zugang über einen geheimen Familienschlüssel im URL-Fragment (einmal pro Gerät öffnen,
  danach in localStorage). Kein Konto, kein Login.
- Ende-zu-Ende-Verschlüsselung: Der Server sieht nur einen verschlüsselten Blob
  (Web Crypto: AES-GCM, Schlüssel per PBKDF2 aus der Familien-Passphrase, einmal pro Gerät
  eingeben). Passphrase verloren = Daten verloren → regelmäßiger JSON-Export als Backup.
- Konflikte: Weil der Server nicht hineinsehen kann, führt der Client zusammen. Bei `409` lädt
  er die neue Version, entschlüsselt, führt Datensätze nach `id`/`updatedAt` zusammen und
  speichert erneut.
- Cronjob auf dem Webspace verschickt Web Push. Weil der Server die Daten nicht lesen kann,
  legt die App bei jedem Speichern zusätzlich einen unverschlüsselten **Erinnerungsplan** ab:
  Datum, Deep-Link-Pfad und Nachrichtentext (Vorname + Vorsorge + Aktion). Entschieden: Das ist
  in Ordnung, weil daraus nur allgemein übliche Vorsorgetermine hervorgehen. Notizen, Ärzte und
  Verlauf bleiben verschlüsselt.
- localStorage/IndexedDB als Offline-Cache; Import/Export als JSON-Datei (Backup in iCloud Drive
  über das Teilen-Menü).

Verworfen: Google Sheet (Google-Bindung, kein Push), nur lokal (kein Sync zwischen euch).

## 7. Technik

- Gleicher Stack wie vacation-planner: Bun, Vite, React 19, TanStack Router, Zod, date-fns,
  Tailwind 4, oxlint, oxfmt, Knip, Vitest. Keine weiteren Laufzeit-Abhängigkeiten ohne Grund.
- PWA (Manifest + Service Worker) – nötig für Home-Screen-Installation, Web Push und Offline.
- Routing über Pfade, damit Deep Links aus Benachrichtigungen genau ins Formular führen.
- Datenmodell versioniert (`schemaVersion`) mit Migrationen; Zod für Import und Server-Antworten.
- Datums-Logik (Zyklen, Fenster, Status) als reine Funktionen mit vielen Tests – das ist der
  fehleranfällige Teil.
- Gesundheitsdaten nie in Query-Strings oder Logs; Server-Logs ohne Request-Body.

## 8. Phasen

1. **Grundgerüst**: Repo-Setup, Datenmodell, Zyklus-Logik mit Tests, Personen, Vorsorge-Arten,
   „Jetzt zu tun“, lokal gespeichert, JSON-Export/-Import.
2. **Sync**: PHP-Endpunkt, Verschlüsselung, Zusammenführen, Deploy auf den Webspace.
3. **Erinnerungen**: PWA, Web Push + Cron, Deep Links.
4. **Vorlagen-Katalog** für Erwachsene und Kinder.

## 9. Entscheidungen und offene Fragen

Entschieden am 2026-10-21:

- Speicher: eigener Webspace (PHP), kein Google, kein reines Lokal-Modell.
- Erinnerungen: Web Push über Cronjob auf dem Webspace.
- Umfang: nur Vorsorge; keine Symptomtagebücher.
- Datenschutz: Ende-zu-Ende-Verschlüsselung mit Familien-Passphrase; Erinnerungsplan und
  Push-Texte dürfen Person und Vorsorge im Klartext nennen.
- Webspace: all-inkl (Privat+), wie in `vacation-planner/docs/central-storage-plan.md`:
  PHP 8.4, MariaDB, FTPS-Deploy, kein SSH.
- Vorsorge-Vorlagen: [docs/vorsorge-vorlagen.md](docs/vorsorge-vorlagen.md), geprüft gegen
  G-BA, STIKO und IGeL-Monitor.

Noch offen:

- Cronjobs bei all-inkl im Tarif prüfen (KAS → Tools → Cronjobs ruft eine URL auf); der Cron
  wäre dann ein geschützter HTTP-Endpunkt `POST /api/push/run`.
- Hero-Subline und Support-Zeile für Checking Sparks.

## 10. Name und Domain

**Entschieden (2026-10-29): Checking Sparks – `check.ingsparks.de`.**

- Domain-Regel der ingsparks-Familie: `<stamm>.ingsparks.de` liest sich als „<Stamm>ing Sparks“
  und benennt die Aufgabe. Check-up ist die Aufgabe, „abhaken“ der zweite Sinn.
- Wortmarke „Checking Sparks“ in einem Gewicht; Tab-Titel = Produktname.
- Subdomain im all-inkl-KAS anlegen, Zielverzeichnis `check/public/`, Let's Encrypt aktivieren.
- Plan B (verworfen): Booking Sparks – `book.ingsparks.de`, klingt nach Buchungsplattform.
