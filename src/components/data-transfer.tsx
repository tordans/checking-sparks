import { useState } from 'react'
import { today } from '@/domain/dates'
import { merge } from '@/domain/merge'
import { parseDoc } from '@/domain/model'
import { describeCounts, previewImport } from '@/lib/import-preview'
import type { ImportPreview } from '@/lib/import-preview'
import { dispatch, store } from '@/sync/store'
import { Button } from './catalyst/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from './catalyst/dialog'
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

async function readImport(file: File): Promise<ImportPreview | string> {
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    return 'Die Datei ist kein gültiges JSON.'
  }
  const parsed = parseDoc(raw)
  if (!parsed.success) return 'Die Datei ist keine Checking-Sparks-Sicherung.'
  return previewImport(store.getDoc(), parsed.data)
}

export function DataTransfer() {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const added = preview ? describeCounts(preview.added) : ''
  const updated = preview ? describeCounts(preview.updated) : ''
  const removed = preview ? describeCounts(preview.removed) : ''
  const nothing = preview && !added && !updated && !removed && !preview.settingsChanged

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
              if (!file) return
              setDone(false)
              const result = await readImport(file)
              if (typeof result === 'string') {
                setError(result)
              } else {
                setError(null)
                setPreview(result)
              }
            }}
          />
          <span className="inline-flex items-center rounded-lg border border-zinc-950/10 px-3.5 py-2.5 text-base/6 font-semibold text-zinc-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-500 hover:bg-zinc-950/2.5 sm:px-3 sm:py-1.5 sm:text-sm/6 dark:border-white/15 dark:text-white dark:hover:bg-white/5">
            Importieren…
          </span>
        </label>
      </div>
      {error && <Text className="text-red-600! dark:text-red-500!">{error}</Text>}
      {done && <Text>Import zusammengeführt.</Text>}

      <Dialog open={preview !== null} onClose={() => setPreview(null)} size="md">
        <DialogTitle>Sicherung importieren</DialogTitle>
        <DialogBody className="space-y-2">
          {nothing ? (
            <Text>Die Datei enthält nichts Neues.</Text>
          ) : (
            <>
              <Text>
                Die Datei wird mit deinen Daten zusammengeführt; jeweils das Neuere gewinnt.
              </Text>
              <ul className="list-disc space-y-1 pl-5 text-base/6 text-zinc-700 sm:text-sm/6 dark:text-zinc-300">
                {added && <li>Neu: {added}</li>}
                {updated && <li>Aktualisiert: {updated}</li>}
                {removed && <li>Entfernt (in der Datei gelöscht): {removed}</li>}
                {preview?.settingsChanged && <li>Einstellungen werden übernommen.</li>}
              </ul>
            </>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setPreview(null)}>
            Abbrechen
          </Button>
          {!nothing && (
            <Button
              onClick={() => {
                if (preview) dispatch((doc) => merge(doc, preview.merged))
                setPreview(null)
                setDone(true)
              }}
            >
              Zusammenführen
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </div>
  )
}
