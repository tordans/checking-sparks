import { Alert, AlertActions, AlertDescription, AlertTitle } from './catalyst/alert'
import { Button } from './catalyst/button'

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  destructive = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel: string
  destructive?: boolean
}) {
  return (
    <Alert open={open} onClose={onClose}>
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      <AlertActions>
        <Button plain onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          color={destructive ? 'red' : 'dark/zinc'}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </AlertActions>
    </Alert>
  )
}
