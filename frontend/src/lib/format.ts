/** Formatting helpers for knowledge pages (dates from ServiceNow and the sync, file sizes). */

/** Accepts ISO 8601 or ServiceNow's "YYYY-MM-DD HH:MM:SS" (UTC). */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) return 'Never'
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "5 minutes ago", "3 hours ago", "2 days ago". */
export function timeAgo(value: string | null | undefined, now = Date.now()): string {
  const date = parseDate(value)
  if (!date) return 'never'
  const minutes = Math.max(0, Math.round((now - date.getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} days ago`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`
}
