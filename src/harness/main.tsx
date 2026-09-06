/** Entry for the visual harness. Never part of a deployed bundle. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { VisualHarness } from './VisualHarness'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VisualHarness />
  </StrictMode>,
)
