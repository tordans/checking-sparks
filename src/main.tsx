import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerServiceWorker } from '@/push/service-worker'
import { router } from '@/router'
import { startSync } from '@/sync/sync'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root was not found')
}

startSync()
registerServiceWorker((path) => router.history.push(path))

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
