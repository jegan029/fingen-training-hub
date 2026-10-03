import { File, FileImage, FileSpreadsheet, FileText, Presentation, type LucideIcon } from 'lucide-react'
import styles from './knowledge.module.css'

type FileKind = 'image' | 'sheet' | 'slides' | 'text' | 'other'

const ICONS: Record<FileKind, LucideIcon> = {
  image: FileImage,
  sheet: FileSpreadsheet,
  slides: Presentation,
  text: FileText,
  other: File,
}

function kindOf(contentType: string): FileKind {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.includes('spreadsheet')) return 'sheet'
  if (contentType.includes('presentation')) return 'slides'
  if (contentType === 'application/pdf' || contentType.includes('word') || contentType.startsWith('text/'))
    return 'text'
  return 'other'
}

export default function FileIcon({ contentType, size = 18 }: { contentType: string; size?: number }) {
  const Icon = ICONS[kindOf(contentType)]
  return <Icon size={size} className={styles.fileIcon} aria-hidden="true" />
}
