import { createRoute } from '@tanstack/react-router'
import { Card } from '@/components/card'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Page } from '@/components/page'
import { rootRoute } from './root'

const SOURCE_URL = 'https://github.com/tordans/checking-sparks/blob/main/docs/privacy.md'

/** `/datenschutz`: short version of docs/privacy.md. */
export const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/datenschutz',
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <Page>
      <Heading>Datenschutz</Heading>
      <Text>
        Diese App gehört einer Familie. Es gibt keine Konten, kein Tracking, keine Cookies und keine
        Inhalte von Drittanbietern.
      </Text>

      <Card className="space-y-2">
        <Subheading>Verschlüsselt</Subheading>
        <Text>
          Personen, Geburtsdaten, Vorsorgen, Praxen, Notizen und der Verlauf werden im Browser mit
          eurer Familien-Passphrase verschlüsselt, bevor sie an den Server gehen (AES-GCM). Ohne
          Passphrase kann sie niemand lesen, auch nicht der Betreiber oder der Hoster.
        </Text>
      </Card>

      <Card className="space-y-2">
        <Subheading>Lesbar auf dem Server</Subheading>
        <Text>
          Damit Erinnerungen pünktlich kommen, liegt ein Erinnerungsplan im Klartext auf dem Server:
          Zeitpunkt und Text wie „Lena: Zahnarzt buchen“, am Vorabend eines Termins auch die Praxis.
          Dazu die Push-Adressen eurer Geräte. Gesendete Erinnerungen werden nach 30 Tagen gelöscht.
          Der Hoster protokolliert Zugriffe (IP-Adresse, Zeit) nach seinen eigenen Regeln.
        </Text>
      </Card>

      <Card className="space-y-2">
        <Subheading>Auf deinem Gerät</Subheading>
        <Text>
          Die entschlüsselten Daten liegen im Browser, damit die App offline funktioniert. Mit
          „Passphrase merken“ speichert der Browser nur einen nicht auslesbaren Schlüssel, nie die
          Passphrase. „Gerät trennen“ in den Einstellungen entfernt die Verbindung zum Server.
        </Text>
      </Card>

      <Card className="space-y-2">
        <Subheading>Benachrichtigungen</Subheading>
        <Text>
          Push-Nachrichten laufen verschlüsselt über den Dienst deines Browsers (Apple, Google,
          Mozilla oder Microsoft). Der sieht nur, wann eine Nachricht an welches Gerät geht. Der
          Text steht auf dem Sperrbildschirm.
        </Text>
      </Card>

      <Card className="space-y-2">
        <Subheading>Wichtig</Subheading>
        <Text>
          Wer Kopplungslink und Passphrase hat, sieht alle Daten. Eine verlorene Passphrase lässt
          sich nicht zurücksetzen; exportiere deshalb ab und zu eine Sicherung. Die Exportdatei ist
          unverschlüsselt.
        </Text>
      </Card>

      <Text>
        Ausführlich:{' '}
        <a href={SOURCE_URL} className="underline">
          docs/privacy.md
        </a>
      </Text>
    </Page>
  )
}
