// In-app copy of src/assets/images/CREDITS.md; keep the two in sync.
export interface ImageCredit {
  usedFor: string
  author: string
  source: string
  sourceUrl: string
  licence: string
  licenceUrl?: string
}

const PEXELS = 'https://www.pexels.com/license/'

export const IMAGE_CREDITS: ImageCredit[] = [
  {
    usedFor: 'Platform Core',
    author: 'Christina Morillo',
    source: 'Pexels',
    sourceUrl: 'https://www.pexels.com/photo/engineer-holding-laptop-1181316/',
    licence: 'Pexels License',
    licenceUrl: PEXELS,
  },
  {
    usedFor: 'L2 Support Operations',
    author: 'Mizuno K',
    source: 'Pexels',
    sourceUrl:
      'https://www.pexels.com/photo/office-worker-using-a-laptop-with-his-colleague-standing-behind-and-pointing-at-the-screen-12902877/',
    licence: 'Pexels License',
    licenceUrl: PEXELS,
  },
  {
    usedFor: 'Assessments',
    author: 'Christina Morillo',
    source: 'Pexels',
    sourceUrl: 'https://www.pexels.com/photo/man-wearing-blue-dress-shirt-facing-whiteboard-1181343/',
    licence: 'Pexels License',
    licenceUrl: PEXELS,
  },
  {
    usedFor: 'Analytics',
    author: 'Lukas Blazek',
    source: 'Pexels',
    sourceUrl: 'https://www.pexels.com/photo/close-up-photo-of-gray-laptop-577210/',
    licence: 'Pexels License',
    licenceUrl: PEXELS,
  },
  {
    usedFor: 'Sign in page',
    author: 'Caleb Oquendo',
    source: 'Pexels',
    sourceUrl: 'https://www.pexels.com/photo/woman-in-control-room-monitoring-screens-39071423/',
    licence: 'Pexels License',
    licenceUrl: PEXELS,
  },
  {
    usedFor: 'Home hero, Transaction and Data Flows, AI Tutor',
    author: 'FinGen Training Hub',
    source: 'Original illustrations',
    sourceUrl: '',
    licence: 'Project licence',
  },
]
