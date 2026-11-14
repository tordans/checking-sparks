# Datenschutz: was wo liegt und wer was sehen kann

Technische Beschreibung für Nutzer:innen und Self-Hoster. Stand: November 2026, gilt für den Code in
diesem Repository. Keine Rechtsberatung; wer eine eigene Instanz öffentlich betreibt, ist selbst
für Datenschutzerklärung und ggf. Impressum verantwortlich. Die App zeigt eine Kurzfassung unter
`/datenschutz`.

## Grundsätze

- Eine Instanz gehört genau einer Familie. Es gibt keine Konten, keine Registrierung, kein Tracking,
  keine Werbung, keine Cookies und keine Inhalte von Drittanbietern (Schrift, Icons und Code werden
  vom eigenen Server geladen; die Content-Security-Policy erlaubt nur die eigene Domain).
- Gesundheitsdaten verlassen das Gerät nur verschlüsselt, mit einer Ausnahme: dem Erinnerungsplan
  (siehe unten).
- Ohne Server-Kopplung bleibt alles auf dem Gerät.

## Auf dem Gerät (Browser)

| Was | Wo | Hinweis |
| --- | --- | --- |
| Familiendokument im Klartext: Personen (Name, Geburtsdatum, Geschlecht, Farbe), Vorsorgen (Titel, Praxis, Telefon, Notiz, Zyklus), Termine, Verlauf, Einstellungen | `localStorage` (`checking-sparks:doc:v1`) | damit die App offline und ohne Passphrase-Eingabe bei jedem Start funktioniert |
| Familienschlüssel (Zugang zum Server) | `localStorage` (`checking-sparks:server:v1`) | kommt aus dem Kopplungslink |
| Abgeleiteter Datenschlüssel, nur bei „Passphrase auf diesem Gerät merken“ | IndexedDB (`checking-sparks`) | nicht auslesbar (non-extractable CryptoKey); die Passphrase selbst wird nie gespeichert |
| App-Dateien | Service-Worker-Cache | keine Daten |

Wer Zugriff auf das entsperrte Gerät bzw. Browserprofil hat, sieht die Daten. „Gerät trennen“ in den
Einstellungen löscht Familienschlüssel und gemerkten Datenschlüssel; die lokalen Daten bleiben, bis
die Website-Daten im Browser gelöscht werden.

## Auf dem Server (Webspace)

| Was | Form | Lesbar für |
| --- | --- | --- |
| Familiendokument (alles aus der Tabelle oben) | **Ende-zu-Ende verschlüsselt**: AES-GCM 256, Schlüssel per PBKDF2-SHA-256 (600 000 Runden) aus der Familien-Passphrase, im Browser erzeugt | niemanden ohne Passphrase, auch nicht Hoster oder Betreiber |
| Erinnerungsplan: Zeitpunkt, Titel, Text, Link je geplanter Erinnerung, z. B. „Lena: Zahnarzt buchen“ / „Termin bis 31.03. machen.“, am Vorabend eines Termins der Praxisname | **Klartext** | Betreiber, Hoster, wer die Datenbank ausliest |
| Push-Abos: Push-Adresse des Geräts beim Push-Dienst, dessen öffentliche Schlüssel, Gerätename | Klartext | dito |
| Familien-, Cron- und Deploy-Schlüssel | nur als SHA-256-Hash in der Konfiguration | – |
| Fehlerprotokoll `logs/api.log` | kurze Fehlermeldungen ohne Anfrage-Inhalte | Betreiber |
| Zugriffsprotokolle des Webservers (IP-Adresse, Zeit, URL, Browser) | beim Hoster | Hoster, nach dessen Regeln |

Der Erinnerungsplan muss lesbar sein, weil der Server sonst nicht wüsste, wann er welche Nachricht
schickt. Er enthält Vornamen und Vorsorge-Titel, also die Information „Person X hat Vorsorge Y
fällig“. Geburtsdaten, Notizen, Telefonnummern und der Verlauf stehen nicht darin. Gesendete
Erinnerungen werden nach 30 Tagen gelöscht.

Die Cron-URL enthält den Cron-Schlüssel und taucht in den Zugriffsprotokollen auf; mit ihm lassen
sich nur bereits fällige Erinnerungen auslösen.

## Push-Dienste

Benachrichtigungen laufen über den Push-Dienst des Browsers bzw. Betriebssystems (Apple, Google,
Mozilla oder Microsoft). Der Inhalt ist nach RFC 8291 verschlüsselt; der Push-Dienst sieht nur
Metadaten (Zeitpunkt, Zielgerät, Größe). Der Text erscheint auf dem Sperrbildschirm.

## Weitergabe und Sicherheit

- Wer den Kopplungslink **und** die Passphrase hat, sieht und ändert alle Daten. Beides nur über
  private Kanäle weitergeben.
- Der Familienschlüssel allein erlaubt nur, den verschlüsselten Block zu laden oder zu überschreiben
  (letzteres würde Daten zerstören, nicht offenlegen) und Push-Abos anzulegen.
- **Passphrase verloren = Daten verloren.** Sie lässt sich nicht zurücksetzen. Regelmäßig unter
  Einstellungen als JSON exportieren; die Exportdatei ist **unverschlüsselt**.

## Löschen

- Einzelne Personen, Vorsorgen und Einträge: in der App; sie verschwinden beim nächsten Abgleich vom
  Server (gelöschte Einträge bleiben als Löschmarke ohne Inhalt bis zu 180 Tage im Dokument).
- Ein Gerät: Einstellungen → „Gerät trennen“, Benachrichtigungen dort vorher deaktivieren, danach
  Website-Daten im Browser löschen.
- Alles: Betreiber löscht die Datenbanktabellen bzw. die Instanz.
