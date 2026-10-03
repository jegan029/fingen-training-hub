/** Short L2 support habits shown on the sign in page, one at a time. Plain language, no dashes. */
export const TIPS = [
  'Note the exact incident window before you pull any logs. Without it, the logs are noise.',
  'Check the service health dashboard first. One red service upstream explains most of the alerts below it.',
  'When a settlement batch stalls, check the cutoff time before you rerun it.',
  'A duplicate transaction error usually means a client retry, not a double payment. Confirm before you reverse anything.',
  'Reproduce the issue in UAT before you change any production configuration.',
  'Quote the knowledge article number in your ticket notes so the next engineer can follow your steps.',
  'Open every escalation with one sentence on customer impact.',
]
