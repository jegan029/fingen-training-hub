import type { ArticleKind, Classification } from '../types'

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
}

export const CLASSIFICATION_HINT: Record<Classification, string> = {
  public: 'Public: can be shared outside the company.',
  internal: 'Internal: for staff only.',
  confidential: 'Confidential: limited audience; never sent to the AI Tutor.',
  restricted: 'Restricted: named people only; never sent to the AI Tutor.',
}

export const CLASSIFICATION_ORDER: Classification[] = ['public', 'internal', 'confidential', 'restricted']

export const KIND_LABEL: Record<ArticleKind, string> = {
  runbook: 'Runbook',
  sop: 'SOP',
  other: 'Article',
}

export function isClassification(value: string | null): value is Classification {
  return value !== null && (CLASSIFICATION_ORDER as string[]).includes(value)
}
