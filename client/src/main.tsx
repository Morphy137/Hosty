import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { DaemonGate } from './components/common/DaemonGate'
import { TooltipProvider } from './components/ui/Tooltip'
import { ToastProvider } from './components/ui/Toast'
import { MotionConfig } from 'motion/react'

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
