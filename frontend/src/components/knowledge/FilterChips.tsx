import styles from './knowledge.module.css'

export interface ChipOption {
  value: string
  label: string
  count?: number
}

interface FilterChipsProps {
  /** Accessible name of the group, for example "Classification". */
  label: string
  options: ChipOption[]
  selected: string | null
  /** Called with the value, or null when the selected chip is pressed again (or "All"). */
  onChange: (value: string | null) => void
}

/** A single choice filter as toggle buttons (aria-pressed), with an "All" chip first. */
export default function FilterChips({ label, options, selected, onChange }: FilterChipsProps) {
  return (
    <div className={styles.chips} role="group" aria-label={label}>
      <button type="button" className={styles.chip} aria-pressed={selected === null} onClick={() => onChange(null)}>
        All
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={styles.chip}
          aria-pressed={selected === o.value}
          onClick={() => onChange(selected === o.value ? null : o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className={styles.chipCount}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
