import { useEffect, useState } from 'react'

function SystemIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

const MODES = ['system', 'light', 'dark']
const LABEL = { system: 'Theme: system (switch to light)', light: 'Theme: light (switch to dark)', dark: 'Theme: dark (switch to system)' }
const ICON = { system: SystemIcon, light: SunIcon, dark: MoonIcon }

function apply(mode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export default function ThemeToggle() {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('theme') || 'system' } catch { return 'system' }
  })

  useEffect(() => {
    apply(mode)
    if (mode !== 'system') return
    // Follow OS preference live while in system mode.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  function cycle() {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
    setMode(next)
    try {
      if (next === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', next)
    } catch {}
  }

  const Icon = ICON[mode]
  return (
    <button
      onClick={cycle}
      aria-label={LABEL[mode]}
      title={LABEL[mode]}
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100"
    >
      <Icon />
    </button>
  )
}
