import { useState } from 'react'
import { today } from '@/domain/dates'
import { merge } from '@/domain/merge'
import { parseDoc } from '@/domain/model'
import { dispatch, store } from '@/sync/store'
import { Button } from './catalyst/button'
import { Text } from './catalyst/text'

function exportDoc() {
  const blob = new Blob([JSON.stringify(store.getDoc(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `checking-sparks-${today()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Merges a backup file into the local data (the newer record wins). Returns an error text. */
async function importFile(file: File): Promise<string | null> {
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    return 'Die Datei ist kein gültiges JSON.'
  }
  const parsed = parseDoc(raw)
  if (!parsed.success) return 'Die Datei ist keine Checking-Sparks-Sicherung.'
  dispatch((doc) => merge(doc, parsed.data))
  return null
}

export function DataTransfer() {
  const [result, setResult] = useState<{ error: string | null } | null>(null)

  return (
    <div className="space-y-4">
      <Text>
        Die Sicherung enthält alle Daten unverschlüsselt. Bewahre sie sicher auf, z. B. in iCloud
        Drive.
      </Text>
      <div className="flex flex-wrap gap-2">
        <Button outline onClick={exportDoc}>
          Exportieren
        </Button>
        <label className="relative inline-flex">
          <input
            type="file"
            accept="application/json,.json"
            className="peer sr-only"
            onChange={async (event) => {
              const input = event.currentTarget
              const file = input.files?.[0]
              input.value = ''
              if (file) setResult({ error: await importFile(file) })
            }}
          />
          <span className="inline-flex items-center rounded-lg border border-zinc-950/10 px-3.5 py-2.5 text-base/6 font-semibold text-zinc-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-500 hover:bg-zinc-950/2.5 sm:px-3 sm:py-1.5 sm:text-sm/6 dark:border-white/15 dark:text-white dark:hover:bg-white/5">
            Importieren…
          </span>
        </label>
      </div>
      {result?.error && <Text className="text-red-600! dark:text-red-500!">{result.error}</Text>}
      {result && !result.error && (
        <Text>Sicherung importiert und mit deinen Daten zusammengeführt.</Text>
      )}
    </div>
  )
}
