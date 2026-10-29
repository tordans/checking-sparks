import { Text } from './catalyst/text'

/**
 * SLOT: push notifications (docs/architecture.md, "PWA and push").
 * A later change replaces this placeholder with subscribe/unsubscribe, a test push and the
 * "Zum Home-Bildschirm hinzufügen" hint for iOS. It is rendered in /einstellungen.
 */
export function PushSettings() {
  return <Text>Benachrichtigungen kommen bald.</Text>
}
