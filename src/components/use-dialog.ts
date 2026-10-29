import { useState } from 'react'

/**
 * Open state for a dialog plus a key that changes on every open, so the form inside starts
 * fresh each time (`<Form key={dialog.key} />`).
 */
export function useDialog() {
  const [state, setState] = useState({ open: false, key: 0 })
  return {
    open: state.open,
    key: state.key,
    show: () => setState((s) => ({ open: true, key: s.key + 1 })),
    close: () => setState((s) => ({ ...s, open: false })),
  }
}
