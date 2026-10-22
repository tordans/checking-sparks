# Vorsorge-Vorlagen Deutschland (Stand Oktober 2026)

Allgemeine Regeln für gesetzlich Versicherte in Deutschland. Dient als Startwert für eine App (Vorlagen für Termin-Erinnerungen), **keine medizinische Beratung**. Maßgeblich sind immer die aktuellen Richtlinien (G-BA, STIKO) und die ärztliche Beratung.

Markierung `(?)` = nicht oder nur über Sekundärquellen verifiziert, vor Verwendung prüfen.

## Legende Status

- `Kasse`: GKV-Regelleistung (Krankenkasse zahlt bei Anspruch)
- `Kasse (abhängig)`: Satzungsleistung einzelner Krankenkassen, kein allgemeiner Anspruch
- `STIKO`: öffentlich empfohlene Impfung (STIKO-Empfehlung, RKI)
- `IGeL`: Individuelle Gesundheitsleistung, Selbstzahlung (ggf. mit IGeL-Monitor-Bewertung)
- `Selbst`: Selbstuntersuchung oder Selbstmessung, kein Arzttermin nötig

Spalten: Alter in Jahren, sofern nicht anders angegeben. Intervall in Monaten. `Geschlecht`: alle / m / w.

## Erwachsene

| ID | Name | Fachrichtung | Geschlecht | Alter von–bis | Intervall (Monate) | Saison | Status | Hinweis |
|---|---|---|---|---|---|---|---|---|
| check-up-18 | Gesundheits-Check-up (18–34) | Hausarzt/Internist | alle | 18–34 | (einmalig) | | Kasse | Einmalig; Labor nur bei Risikoprofil |
| check-up-35 | Gesundheits-Check-up (ab 35) | Hausarzt/Internist | alle | 35– | 36 | | Kasse | Blutdruck, Urin, Blutzucker, Cholesterin; Hepatitis B/C einmalig. G-BA berät seit 15.10.2026 über Alter, Intervall und Fokus (nicht beschlossen) |
| bauchaorta | Bauchaorten-Ultraschall | Hausarzt/Internist | m | 65–65 | (einmalig) | | Kasse | Optional, Teil des Check-ups (?) |
| blutdruck-selbst | Blutdruck-Selbstmessung | Selbst | alle | 18– | | | Selbst | Kein Termin; Werte mit Arzt besprechen |
| erw-blutbild | Erweitertes Blutbild | Hausarzt | alle | 18– | | | IGeL (?) | Nicht Teil des Check-ups; ohne Beschwerden kein Routinenutzen belegt (?) |
| prostata-dru | Prostata-Tastuntersuchung | Urologe/Hausarzt | m | 45– | 12 | | Kasse | Jährlich ab 45 (Anspruch laut GKV) |
| psa | PSA-Test | Urologe/Hausarzt | m | 45– | | | IGeL | IGeL-Monitor: tendenziell negativ (Update 2017). Leitlinien-Entwurf 2025 (?) prüfen |
| hautkrebs | Hautkrebs-Screening | Hautarzt/Hausarzt | alle | 35– | 24 | | Kasse | Ganzkörper-Check. G-BA prüft die Regelung bis Ende 2027 (Stand 15.10.2026) |
| darmkrebs-stuhl | Darmkrebs-Stuhltest (iFOBT) | Hausarzt | alle | 50– | 24 | | Kasse | Alternative zur Darmspiegelung. Positiv: immer Koloskopie |
| darmspiegelung | Darmspiegelung (Koloskopie) | Gastroenterologe | alle | 50– | 120 | | Kasse | Zwei Untersuchungen im Abstand von 10 Jahren. Danach alternativ Stuhltest |
| zervix-20 | Gebärmutterhalskrebs-Abstrich | Gynäkologie | w | 20–34 | 12 | | Kasse | Jährlicher Pap-Abstrich |
| zervix-35 | Gebärmutterhalskrebs-Ko-Test | Gynäkologie | w | 35– | 36 | | Kasse | HPV-Test plus Pap, alle 3 Jahre (statt jährlichem Pap) |
| gyn-untersuchung | Gynäkologische Tastuntersuchung | Gynäkologie | w | 20– | 12 | | Kasse (?) | Jährlich (?) |
| mammo | Mammographie-Screening | Screening-Einheit (Radiologie) | w | 50–75 | 24 | | Kasse | Einladung durch Programm. 70–75 seit 07/2024. 45–49 beschlossen, Start voraussichtlich 2027 (?) |
| brust-selbst | Brust-Selbstabtasten | Selbst | w | 20– | | | Selbst | Ersetzt keine Mammographie oder Ärztliche Untersuchung |
| brust-us | Brust-Ultraschall | Gynäkologie | w | 40– (?) | | | IGeL | IGeL-Monitor (06/2025): unklar. Altersgrenze nicht verifiziert |
| schilddruese-us | Schilddrüsen-Ultraschall | Hausarzt/Internist | alle | 18– | | | IGeL | IGeL-Monitor (08/2024): tendenziell negativ |
| ruhe-ekg | Ruhe-EKG | Hausarzt/Kardiologe | alle | 18– | | | IGeL (?) | Ohne Beschwerden keine Routineleistung (?) |
| belastungs-ekg | Belastungs-EKG | Kardiologe | alle | 18– | | | IGeL | IGeL-Monitor: tendenziell negativ (Datum nicht geprüft) |
| carotis | Ultraschall Halsschlagadern | Hausarzt/Gefäßmedizin | alle | 50– | | | IGeL | IGeL-Monitor: tendenziell negativ (ohne Beschwerden) |
| glaukom | Glaukom-Früherkennung (Augeninnendruck, Augenspiegelung) | Augenarzt | alle | 40– (?) | | | IGeL | IGeL-Monitor: tendenziell negativ. Neue Bewertung 15.02.2026 laut Dateiname (?) |
| osteo | Osteoporose-Risiko-Check | Hausarzt | w | 50– (?) | | | IGeL (?) | Knochendichte-Messung nur bei Indikation (?) |
| td | Tetanus/Diphtherie-Auffrischung (Td/Tdap) | Hausarzt | alle | 18– | 120 | | STIKO | Auffrischung alle 10 Jahre; Keuchhusten (Tdap) einmalig im Erwachsenenalter |
| grippe | Grippeimpfung | Hausarzt | alle | 60– | 12 | Okt–Dez | STIKO | Ab 60 jährlich; auch für Risikogruppen (?) |
| covid | COVID-19-Impfung | Hausarzt | alle | 75– (?) | 12 | Herbst (?) | STIKO (?) | STIKO 2026: Standard ab 75 (EpBull 28/2026, Sekundärquelle). Vorher ab 60 |
| pneumokokken | Pneumokokken-Impfung | Hausarzt | alle | 60– | | | STIKO | Einzeldosis (20-valent) laut Sekundärquelle; Quellen widersprüchlich (?) |
| zoster | Gürtelrose (Herpes zoster) | Hausarzt | alle | 60– | | | STIKO | 2 Dosen im Abstand 2–6 Monaten. Ab 18 bei Immunschwäche (?) |
| rsv | RSV-Impfung | Hausarzt | alle | 75– | | | STIKO | Standard ab 75. 60–74 mit Grunderkrankung oder Pflegeheim (Indikation) |
| fsme | FSME-Impfung | Hausarzt/Reisemedizin | alle | 0– | 60 (?) | | STIKO | Nur bei Zeckenexposition in Risikogebieten. Grundimmunisierung 3 Dosen, Auffrischung alle 3–5 Jahre (?) |
| zahn-kontrolle | Zahnärztliche Kontrolluntersuchung | Zahnarzt | alle | 18– | 6 | | Kasse | Anspruch 1× pro Halbjahr. Bonusheft erhöht Zuschuss für Zahnersatz |
| zahn-zahnstein | Zahnsteinentfernung | Zahnarzt | alle | 18– | 12 | | Kasse | 1× pro Jahr |
| zahn-psi | Parodontal-Screening (PSI) | Zahnarzt | alle | 35– (?) | 24 | | Kasse | Alle 2 Jahre (Altersgrenze (?)) |
| zahn-pzr | Professionelle Zahnreinigung (PZR) | Zahnarzt/Prophylaxe | alle | 18– | 6 | | IGeL (?) | In der Regel Selbstzahlung (?) |

## Kinder und Jugendliche

Für U- und J-Untersuchungen: Alter = Zeitfenster, Intervall leer.

| ID | Name | Fachrichtung | Geschlecht | Alter von–bis | Intervall (Monate) | Saison | Status | Hinweis |
|---|---|---|---|---|---|---|---|---|
| u1 | U1 | Kinderarzt/Geburtsklinik | alle | 1.–4. Lebensstunde | | | Kasse | Direkt nach Geburt |
| u2 | U2 | Kinderarzt | alle | 3.–10. Lebenstag (?) | | | Kasse | |
| u3 | U3 | Kinderarzt | alle | 4.–5. Lebenswoche (?) | | | Kasse | |
| u4 | U4 | Kinderarzt | alle | 3.–4. Lebensmonat | | | Kasse | |
| u5 | U5 | Kinderarzt | alle | 6.–7. Lebensmonat (?) | | | Kasse | |
| u6 | U6 | Kinderarzt | alle | 10.–12. Lebensmonat (?) | | | Kasse | |
| u7 | U7 | Kinderarzt | alle | 21.–24. Lebensmonat | | | Kasse | |
| u7a | U7a | Kinderarzt | alle | 34.–36. Lebensmonat (?) | | | Kasse | |
| u8 | U8 | Kinderarzt | alle | 46.–48. Lebensmonat (?) | | | Kasse | |
| u9 | U9 | Kinderarzt | alle | 60.–64. Lebensmonat (?) | | | Kasse | Vor Schulbeginn |
| u10 | U10 | Kinderarzt | alle | 7.–8. Lebensjahr (?) | | | Kasse (abhängig) | Kein allgemeiner Anspruch; Zusatzleistung einzelner Kassen |
| u11 | U11 | Kinderarzt | alle | 9.–10. Lebensjahr (?) | | | Kasse (abhängig) | Wie U10 |
| j1 | J1 (Jugendgesundheitsuntersuchung) | Kinderarzt/Hausarzt | alle | 12.–14. Lebensjahr | | | Kasse | |
| j2 | J2 | Kinderarzt/Hausarzt | alle | 16.–17. Lebensjahr (?) | | | Kasse (abhängig) | Quellen nennen 16–17 bzw. 16–18 Jahre |
| zahn-fu | Kinderzahn-Früherkennung (FU) | Kinderzahnarzt | alle | ab 6. Lebensmonat bis 6. Lebensjahr (?) | | | Kasse | Mehrere FU-Termine (Anzahl und Fenster (?)) |
| imp-grund | Grundimmunisierung Säuglinge (6-fach, Pneumokokken, Rotavirus (?)) | Kinderarzt | alle | ab 2. Lebensmonat | | | STIKO | Mehrere Dosen im 1. Lebensjahr, Details laut Impfkalender (?) |
| imp-mmr | Masern, Mumps, Röteln, Windpocken (MMR/V) | Kinderarzt | alle | 11.–14. Lebensmonat; 2. Dosis (?) | | | STIKO | Masern/Windpocken am selben Termin oder 4 Wochen Abstand |
| imp-auffr-5 | Auffrischung Vorschulalter (DTaP-IPV, MMR/V) | Kinderarzt | alle | 5–6 Jahre (?) | | | STIKO | |
| imp-td-9 | Td/Tdap-Auffrischung | Kinderarzt/Hausarzt | alle | 9–16 Jahre | | | STIKO | Einmalige Auffrischung in diesem Fenster |
| imp-hpv | HPV-Impfung | Kinderarzt/Hausarzt | alle | 9–14 Jahre | | | STIKO | Grundimmunisierung mit 2 Dosen (?) |
| imp-men | Meningokokken ACWY | Kinderarzt/Hausarzt | alle | 12–14 Jahre | | | STIKO | Nachholbar bis 25. Geburtstag (neu 2026) |
| imp-pneumo | Pneumokokken (Risikogruppen) | Kinderarzt | alle | 2–17 Jahre | | | STIKO | Nur bei erhöhtem Risiko, 20-valent |

## Korrekturen gegenüber der Ausgangsliste

- Check-up: Ab 35 alle 3 Jahre (bestätigt). Zwischen 18 und 34 nur einmalig. G-BA-Beratung über Alter, Intervall und Fokus läuft seit 15.10.2026, noch nicht beschlossen.
- Hautkrebs-Screening: Ab 35 alle 2 Jahre (Kasse). Die Regelung wird vom G-BA bis Ende 2027 überprüft.
- Prostata-Tastuntersuchung: Ab 45 jährlich als Kassenleistung (bestätigt).
- PSA-Test: Keine Kassenleistung ohne Verdacht, sondern IGeL. IGeL-Monitor: tendenziell negativ.
- Darmkrebs: Stuhltest ab 50 alle 2 Jahre (nicht jährlich 50–54, alte Informationsblätter). Koloskopie ab 50 für Männer und Frauen gleich, zweimal im Abstand von 10 Jahren (Regel seit 01.04.2025 laut G-BA-Meldung (?)).
- Gebärmutterhalskrebs: 20–34 jährlich Pap. Ab 35 Ko-Test (HPV plus Pap) alle 3 Jahre, nicht jährlich.
- Mammographie: 50–75 alle 2 Jahre (70–75 seit 2024). Erweiterung auf 45–49 beschlossen, Start voraussichtlich 2027 (?).
- Zahnvorsorge: Kontrolle 1× pro Halbjahr als Kassenanspruch. Zahnsteinentfernung 1× pro Jahr. PZR meist nicht Kassenleistung (?).
- Schilddrüsen-Ultraschall, Ruhe-/Belastungs-EKG, Halsschlagader-Ultraschall, Glaukom-Früherkennung, Brust-Ultraschall: IGeL, keine Kassenleistung ohne Beschwerden.
- Erweitertes Blutbild: IGeL, nicht Teil des Check-ups.
- Tdap: Auffrischung alle 10 Jahre (Td oder Tdap).
- Grippe: STIKO-Standard ab 60 plus Risikogruppen. Sonst freiwillig.
- COVID-19: STIKO 2026 Standard ab 75 (zuvor ab 60). Sekundärquelle, bitte prüfen.
- FSME: Nur bei Zeckenexposition in Risikogebieten, keine allgemeine Impfung.
- Pneumokokken und Gürtelrose: STIKO-Standard ab 60. Pneumokokken-Dosierung widersprüchlich (?).
- RSV: Standard ab 75, 60–74 nur mit Indikation.
- Bauchaorten-Ultraschall: Männer ab 65, einmalig.
- Brust-Selbstabtasten und Blutdruck-Selbstmessung sind Selbstchecks, keine Termine.
- Kinder: U10, U11, J2 sind nicht allgemeine Kassenleistung (Kasse abhängig). Die U1–U9 und J1 sind Regelleistung.

## Quellen

- G-BA, Darmkrebs-Früherkennung: https://www.g-ba.de/themen/methodenbewertung/erwachsene/krebsfrueherkennung/darmkrebs-screening/
- G-BA, Gesundheitsuntersuchungen (Check-up): https://www.g-ba.de/themen/methodenbewertung/erwachsene/gesundheitsuntersuchungen/
- G-BA, Gebärmutterhalskrebs-Früherkennung: https://www.g-ba.de/themen/methodenbewertung/erwachsene/krebsfrueherkennung/gebaermutterhalskrebs-screening/
- G-BA, Versicherteninformation Gebärmutterhalskrebs ab 35: https://www.g-ba.de/downloads/83-691-780/oKFE-RL_2023-01-26_Anlage-VI-B_Versicherteninformation-Gebaermutterhalskrebs-Frauen-ab-35-Jahre.pdf
- G-BA, Pressemitteilung Hautkrebs-Screening und Check-up (15.10.2026): https://www.g-ba.de/presse/pressemitteilungen-meldungen/1357/
- Ärzteblatt, Check-up 35 (Änderungen 2018): https://www.aerzteblatt.de/themen/praevention/aenderungen-beim-check-up-35-beschlossen-24c4204d-fa0f-4938-ae36-14bc730c086d
- KBV, Mammographie-Screening ab 45 (15.10.2026): https://www.kbv.de/praxis/tools-und-services/praxisnachrichten/2026/10-15/mammographie-screening-ab-august-auch-fuer-frauen-ab-45-jahre
- IGeL-Monitor, PSA-Test (Evidenz kompakt): https://igel-monitor.de/fileadmin/user_upload/PSA-Test__Evidenz_kompakt.pdf
- IGeL-Monitor, Glaukom-Früherkennung (PM 15.02.2026): https://igel-monitor.de/fileadmin/user_upload/150226_PM_Glaukomuntersuchung.pdf
- Ärzteblatt, IGeL-Monitor Schilddrüse (08/2024): https://www.aerzteblatt.de/nachrichten/153300/Zwei-Schilddruesen-Vorsorgeuntersuchungen-als-tendenziell-negativ-bewertet
- Ärzteblatt, IGeL-Monitor Brust-Ultraschall/MRT (06/2025): https://www.aerzteblatt.de/themen/igel/krebspravention-igel-monitor-bewertet-nutzen-von-ultraschall-oder-mrt-der-brust-mit-unklar-d7ae34fc-cbfc-4586-b0d6-9ef947ea2351
- MD Bund, IGeL-Pressemitteilung Ultraschall Halsschlagadern: https://md-bund.de/fileadmin/uploads/media/downloads/16_11_18_PM_IGeL_US__Halsschlagadern_01.pdf
- IGeL-Monitor (Übersicht, EKG-Bewertung nicht direkt abgerufen): https://igel-monitor.de
- RKI, STIKO-Impfkalender 2026: https://www.rki.de/impfkalender
- Pharmazeutische Zeitung, Impfkalender 2026: https://www.pharmazeutische-zeitung.de/impfkalender-2026-veroeffentlicht-162226/
- DGAUM, COVID-19-Impfung Änderungen 2026 (Sekundärquelle): https://dgaum.de/wp-content/uploads/2026/07/20260727_Info-COVID-Impfung-Aenderungen.pdf
- apotheke adhoc, Überblick Totimpfstoffe (09/2026, Sekundärquelle): https://www.apotheke-adhoc.de/fileadmin/user_upload/redaktion/service-downloads/ueberblick_totimpfstoffe.pdf
- Verbraucherzentrale, Welche Zahnvorsorge zahlt die Krankenkasse?: https://www.verbraucherzentrale.de/wissen/gesundheit-pflege/krankenversicherung/welche-zahnvorsorge-zahlt-die-krankenkasse-12913
- Verbraucherzentrale, Früherkennung: https://verbraucherzentrale.de/wissen/gesundheit-pflege/krankenversicherung/frueherkennung-diese-vorsorgeuntersuchungen-stehen-ihnen-zu-10429
- AOK, U1 bis U9: https://www.aok.de/pp/bv/u1-bis-u9/
- Deutscher Bundestag, Drucksache 19/18814 (U10/U11/J2 Kassenleistung): https://dserver.bundestag.de/btd/19/188/1918814.pdf
- gesund.bund.de und G-BA Kinder-Richtlinie: nicht abrufbar, Kinder-Zeitfenster daher teilweise (?)
