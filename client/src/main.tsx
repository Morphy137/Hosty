import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { DaemonGate } from './components/common/DaemonGate'
import { TooltipProvider } from './components/ui/Tooltip'
import { ToastProvider } from './components/ui/Toast'
import { MotionConfig } from 'motion/react'
import { isTauriRuntime, openExternalUrl } from './config/daemon'

// The WebView's native menu (Back / Refresh / Print / Share) is not meant for an app UI.
// Editable fields keep it so paste/spell-check still work; dev builds keep it for Inspect.
if (!import.meta.env.DEV) {
  document.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, [contenteditable="true"], [data-allow-native-menu]')) return
    event.preventDefault()
  })
}

// External links open in the system browser instead of silently doing nothing inside the desktop webview.
document.addEventListener('click', (event) => {
  const anchor = (event.target as HTMLElement | null)?.closest('a[href]')
  const href = anchor?.getAttribute('href') ?? ''
  if (!anchor || !/^https?:\/\//i.test(href) || !isTauriRuntime()) return
  event.preventDefault()
  void openExternalUrl(href)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <ToastProvider>
          <DaemonGate>
            <App />
          </DaemonGate>
        </ToastProvider>
      </TooltipProvider>
    </MotionConfig>
  </StrictMode>,
)
