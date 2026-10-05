interface LogoProps {
  /** `theme` follows the light/dark theme; `light` is for always-dark surfaces such as the footer. */
  tone?: 'theme' | 'light'
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number
  /** Show the "Training Hub" line under the wordmark. */
  subtitle?: boolean
}

/**
 * FinGen mark: a path that rises from the stem of an "F" into an arrow, with a branch ending in a node.
 * The tile stays Electric Blue on every surface; only the wordmark follows the tone.
 * The same drawing is in public/favicon.svg and public/apple-touch-icon.png; keep them in step.
 */
export default function Logo({ tone = 'theme', size = 30, subtitle = true }: LogoProps) {
  const themed = tone === 'theme'
  const text = themed ? 'var(--color-heading)' : '#ffffff'
  const sub = themed ? 'var(--color-heading)' : 'rgba(255,255,255,.75)'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.32 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="7.5" fill="var(--brand-mark)" />
        <g fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 25.5V18c0-4.6 3-7 7-7c3 0 5-1.6 7-3.6" />
          <path d="M19.2 7.4h4.3v4.3" />
          <path d="M9.5 22.5c0-3.3 2.4-5.2 5.6-5.2h3.4" />
        </g>
        <circle cx="21" cy="17.3" r="2.6" fill="#ffffff" />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
        <span style={{ fontSize: size * 0.66, fontWeight: 700, color: text, letterSpacing: '-.025em' }}>FinGen</span>
        {subtitle && (
          <span
            style={{
              fontSize: Math.max(9, size * 0.26),
              fontWeight: 600,
              color: sub,
              letterSpacing: '.24em',
              textTransform: 'uppercase',
              marginTop: size * 0.1,
            }}
          >
            Training Hub
          </span>
        )}
      </span>
    </span>
  )
}
