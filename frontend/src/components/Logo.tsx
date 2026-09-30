interface LogoProps {
  /** `theme` follows the light/dark theme; `light` is for always-dark surfaces such as the footer. */
  tone?: 'theme' | 'light'
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number
  /** Show the "Training Hub" line under the wordmark. */
  subtitle?: boolean
}

/** FinGen mark: a tiny roadmap (spine, three nodes, one branch) next to the wordmark. */
export default function Logo({ tone = 'theme', size = 30, subtitle = true }: LogoProps) {
  const themed = tone === 'theme'
  const markBg = themed ? 'var(--color-accent)' : '#ffffff'
  const markFg = themed ? 'var(--color-accent-contrast)' : '#001aff'
  const text = themed ? 'var(--color-heading)' : '#ffffff'
  const sub = themed ? 'var(--color-text-muted)' : 'rgba(255,255,255,.6)'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="7" fill={markBg} />
        <path d="M11 7v18" stroke={markFg} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M11 16c4 0 6-3.5 10-3.5" stroke={markFg} strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="11" cy="8" r="2.6" fill={markFg} />
        <circle cx="11" cy="16" r="2.6" fill={markFg} />
        <circle cx="11" cy="24" r="2.6" fill="none" stroke={markFg} strokeWidth="1.8" />
        <circle cx="22.5" cy="12.5" r="2.6" fill={markFg} />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
        <span style={{ fontSize: size * 0.6, fontWeight: 700, color: text, letterSpacing: '-.01em' }}>FinGen</span>
        {subtitle && (
          <span
            style={{
              fontSize: Math.max(9, size * 0.3),
              fontWeight: 700,
              color: sub,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              marginTop: size * 0.08,
            }}
          >
            Training Hub
          </span>
        )}
      </span>
    </span>
  )
}
