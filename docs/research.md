# Recherche (Stand 2026-10-21)

Erstellt von Haiku-Recherche-Agenten, bewertet von Opus. Angaben aus Websuchen sind teils
unbestätigt (markiert mit „?“) und vor der Umsetzung an den Quellen zu prüfen.

## 1. Bestehende Software

| Bereich | Kandidat | Was passt | Was fehlt | Fit |
| --- | --- | --- | --- | --- |
| Vorsorge | **TK-VorsorgePlaner** („Meine TK“) | Erinnert an Früherkennung, laut TK auch Impfungen und mitversicherte Kinder; Basis sind Abrechnungsdaten | Keine eigenen Zyklen, kein „gebucht am / übersprungen“, kein Buchungs- vs. Durchführungsfenster, kein Export (?) | teilweise |
| Vorsorge | ePA / e-Impfpass | Impfdaten künftig zentral | Erinnerungen nicht verfügbar | schlecht |
| Impfungen | impf.app / ImpfPassDE (Plus) | Familienprofile, Erinnerung an fällige Impfungen, PDF-Export | Keine Vorsorgetermine | gut nur für Impfungen |
| Kinder | Mobil-KK „MOBIL ME“, „Meine pädiatrische Praxis“ | U/J-Erinnerungen | Kassen- bzw. praxisgebunden | schlecht |
| Generisch | Apple Health (Teilen mit bis zu 5 Personen), Bearable, Daylio | Teilen, Export | Kein Vorsorge-Modul | teilweise |

**Fazit:** Das Kernstück – Vorsorge mit eigenen Zyklen, zwei Zeitfenstern (buchen / durchführen),
Status (gebucht, erledigt, übersprungen) und mehreren Personen – deckt keine Software ab.

Sinnvoll als Ergänzung, nicht als Ersatz: Erinnerungsdienste der Krankenkassen
(z. B. TK-VorsorgePlaner) als zweites Sicherheitsnetz, impf.app oder ePA für den eigentlichen
Impfnachweis.

Quellen: tk.de (VorsorgePlaner, Erinnerungsservice), App Store (impf.app),
mobil-krankenkasse.de, bundesgesundheitsministerium.de (e-Impfpass).

## 2. Schwesterprojekt `../vacation-planner`

- Zustand komprimiert in der URL (lz-string, Zod-Validierung), localStorage nur als Komfort.
- `docs/central-storage-plan.md` (Vorschlag, nicht gebaut): PHP-API auf all-inkl-Webspace,
  ein JSON-Dokument pro Plan, Versionierung per `If-Match` (409 bei Konflikt), Schlüssel im
  URL-Fragment, Deploy per FTPS über GitHub Actions.
- Stack: Bun, Vite, React 19, TanStack Router, Zod, date-fns, Tailwind 4, oxlint, oxfmt, Knip,
  Vitest. Übertragbar.
- Zu Google Drive, Sheets, iCloud oder WebDAV gibt es dort keine Recherche.

## 3. Speicher und Sync

| Option | Einzelgerät | Familie / mehrere Geräte | Bewertung |
| --- | --- | --- | --- |
| localStorage / IndexedDB | ja; Safari löscht nach 7 Tagen ohne Nutzung, Home-Screen-PWA hat eigenen Zähler, `storage.persist()` hilft | nein | nur als Cache |
| URL-Hash (lz-string) | nur kleine Daten | nein | ungeeignet (Gesundheitsdaten landen in Verlauf/Chats) |
| iOS-Dateien-App / iCloud Drive | File System Access API fehlt in Safari; nur manuell über `<input type=file>` und Teilen-Menü | nur manuell | als Export/Backup |
| Google Sheet über Apps Script oder OAuth | ja | ja, append-only-Zeilen vermeiden Konflikte | möglich; OAuth-Testmodus mit 7-Tage-Tokens, Apps Script ohne CORS-Preflight |
| **Eigener Webspace (PHP + JSON/MariaDB)** | ja | ja, `If-Match`-Versionierung | gut, Konzept aus vacation-planner wiederverwendbar |
| Nextcloud / WebDAV | ja | ja | CORS umständlich |

## 4. Benachrichtigungen

- **Web Push** funktioniert auf iPhone (Home-Screen-PWA, seit iOS 16.4) und macOS (Safari/Chrome),
  braucht aber zwingend einen Server (VAPID), der die Push-Nachricht verschickt.
- **Geplante lokale Benachrichtigungen ohne Server** gibt es im Web nicht (Notification Triggers
  API wurde nie ausgeliefert).
- **Kalender:** abonnierte Kalender (webcal) ignorieren Alarme oft und aktualisieren unzuverlässig.
  Einmalig importierte `.ics`-Termine mit Alarm sind verlässlicher (?).
- **Apple Kurzbefehle:** Zeitbasierte Automatisierung kann ohne Rückfrage laufen und eine URL
  öffnen (?), ist aber eine manuelle Einrichtung pro Gerät.
- **Deep Links** in eine bestimmte Formularstelle sind mit Hash- oder Pfad-Routing problemlos.

**Opus-Bewertung:** Wer echte Benachrichtigungen auf iPhone *und* Mac will, braucht einen kleinen
Server. Der eigene Webspace löst damit Sync *und* Push in einem Schritt: PHP-Endpunkt plus
Cronjob, der täglich fällige Erinnerungen per Web Push verschickt (z. B. `minishlink/web-push`).
