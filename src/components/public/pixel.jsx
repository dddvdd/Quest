// Tiny pixel-art accent icons. Decorative only — used sparingly as a
// signature visual language on public pages. shape-rendering="crispEdges"
// keeps the hard pixel look; currentColor lets them inherit text color.

const base = {
  shapeRendering: 'crispEdges',
  'aria-hidden': true,
}

export function PixelStar({ className = 'w-3 h-3' }) {
  return (
    <svg viewBox="0 0 7 7" className={className} fill="currentColor" {...base}>
      <rect x="3" y="0" width="1" height="2" />
      <rect x="2" y="2" width="3" height="3" />
      <rect x="3" y="5" width="1" height="2" />
      <rect x="0" y="3" width="2" height="1" />
      <rect x="5" y="3" width="2" height="1" />
    </svg>
  )
}

export function PixelUser({ className = 'w-3 h-3' }) {
  return (
    <svg viewBox="0 0 7 8" className={className} fill="currentColor" {...base}>
      <rect x="2" y="0" width="3" height="3" />
      <rect x="1" y="3" width="5" height="1" />
      <rect x="0" y="4" width="7" height="4" />
      <rect x="2" y="4" width="3" height="1" fill="#ffffff" opacity="0.35" />
    </svg>
  )
}

export function PixelArrow({ className = 'w-3 h-3' }) {
  return (
    <svg viewBox="0 0 6 7" className={className} fill="currentColor" {...base}>
      <rect x="0" y="0" width="1" height="1" />
      <rect x="1" y="1" width="1" height="1" />
      <rect x="2" y="2" width="1" height="3" />
      <rect x="1" y="5" width="1" height="1" />
      <rect x="0" y="6" width="1" height="1" />
    </svg>
  )
}

export function PixelBriefcase({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 9 8" className={className} fill="currentColor" {...base}>
      <rect x="3" y="0" width="3" height="1" />
      <rect x="2" y="1" width="1" height="1" />
      <rect x="6" y="1" width="1" height="1" />
      <rect x="0" y="2" width="9" height="6" />
      <rect x="4" y="4" width="1" height="1" fill="#ffffff" opacity="0.85" />
    </svg>
  )
}

export function PixelPin({ className = 'w-3 h-3' }) {
  return (
    <svg viewBox="0 0 5 7" className={className} fill="currentColor" {...base}>
      <rect x="1" y="0" width="3" height="1" />
      <rect x="0" y="1" width="5" height="3" />
      <rect x="1" y="4" width="3" height="1" />
      <rect x="2" y="5" width="1" height="2" />
      <rect x="2" y="2" width="1" height="1" fill="#ffffff" opacity="0.85" />
    </svg>
  )
}

export function PixelCal({ className = 'w-3 h-3' }) {
  return (
    <svg viewBox="0 0 8 8" className={className} fill="currentColor" {...base}>
      <rect x="0" y="1" width="8" height="7" />
      <rect x="1" y="0" width="1" height="2" />
      <rect x="6" y="0" width="1" height="2" />
      <rect x="1" y="3" width="6" height="1" fill="#ffffff" opacity="0.35" />
      <rect x="1" y="5" width="2" height="1" fill="#ffffff" opacity="0.85" />
    </svg>
  )
}

export function PixelClock({ className = 'w-3 h-3' }) {
  return (
    <svg viewBox="0 0 7 7" className={className} fill="currentColor" {...base}>
      <rect x="2" y="0" width="3" height="1" />
      <rect x="1" y="1" width="5" height="1" />
      <rect x="0" y="2" width="7" height="4" />
      <rect x="1" y="6" width="5" height="1" />
      <rect x="3" y="2" width="1" height="2" fill="#ffffff" opacity="0.9" />
      <rect x="4" y="3" width="1" height="1" fill="#ffffff" opacity="0.9" />
    </svg>
  )
}

export function PixelDivider({ className = '' }) {
  return (
    <div className={`flex items-center gap-1 text-slate-300 ${className}`} aria-hidden>
      {[0, 1, 2, 3, 4].map(i => (
        <svg key={i} viewBox="0 0 3 3" className="w-1.5 h-1.5" fill="currentColor" {...base}>
          {i % 2 === 0
            ? <><rect x="0" y="0" width="1" height="1" /><rect x="1" y="1" width="1" height="1" /><rect x="2" y="2" width="1" height="1" /></>
            : <><rect x="2" y="0" width="1" height="1" /><rect x="1" y="1" width="1" height="1" /><rect x="0" y="2" width="1" height="1" /></>}
        </svg>
      ))}
    </div>
  )
}
