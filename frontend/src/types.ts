export interface LearningPath {
  id: number
  slug: string
  title: string
  description: string
}

export type NodeStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export interface Subtopic {
  id: string
  title: string
  summary: string
}

export interface RunbookRef {
  id: number
  slug: string
  title: string
  category: string
}

/** Mirrors services/classification.py; the server filters by it, the UI only labels. */
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted'

export interface Runbook extends RunbookRef {
  version: string
  updated: string
  description: string
  preconditions: string[]
  steps: string[]
  escalation_triggers: string[]
  node_ids: number[]
  source: 'local' | 'servicenow'
  /** ServiceNow runbooks: the knowledge article holding the body (read only). */
  kb_article_id: number | null
  classification: Classification
}

export interface Prerequisite {
  id: number
  title: string
  path_id: number
  status: NodeStatus
}

export interface NodeSummary {
  id: number
  slug: string
  title: string
  description: string
  dependencies: number[]
  status: NodeStatus
  completed: boolean
  locked: boolean
  /** Titles of prerequisites still blocking this node. */
  locked_by: string[]
  prerequisites: Prerequisite[]
  subtopics: Subtopic[]
  runbooks: RunbookRef[]
}

export interface NodeDetail extends NodeSummary {
  content: string
  sample_question?: string
}

export interface AssessmentResult {
  node_id: number
  score: number
  category: string
  feedback: string
  key_points: string[]
}

export interface ScenarioQuestion {
  node_id: number
  node_title: string
  context: string
  options: string[]
}

export interface ScenarioResult {
  node_id: number
  chosen_option: number
  correct_option: number
  is_correct: boolean
  explanation: string
}

export interface PathProgress {
  path_id: number
  title: string
  completed: number
  total: number
  pct: number
}

export interface ProgressOverview {
  user_id: number
  user_name: string
  paths: PathProgress[]
  overall_pct: number
}

export interface AdminUserPath {
  path_id: number
  title: string
  completed: number
  total: number
  pct: number
}

export interface AdminUser {
  id: number
  name: string
  email: string
  role: 'admin' | 'learner'
  max_classification: Classification
  last_active: string | null
  paths: AdminUserPath[]
  overall_pct: number
}

export interface AuthUser {
  id: number
  name: string
  email: string
  role: 'admin' | 'learner'
}

export interface ChatResponse {
  answer: string
  source_node_ids: number[]
  source_article_id: number | null
}

export interface AnalyticsSummary {
  path_id: number
  /** Average number of nodes completed per learner. */
  completed_nodes: number
  total_nodes: number
  /** Completion rate across all learners, 0 to 100. */
  completion_rate: number
  average_score: number | null
  learners: number
}

export interface AssessmentQuestion {
  node_id: number
  question: string
}

export interface PathProgressCounts {
  completed: number
  in_progress: number
  skipped: number
  total: number
  completion_rate: number
}

export interface SearchResult {
  kind: 'path' | 'node' | 'subtopic' | 'runbook' | 'article' | 'application' | 'document'
  id: string
  title: string
  subtitle: string
  /** App route to open, for example /roadmaps/1?node=3 or /runbooks?open=4. */
  url: string
}

export interface ContinueNode {
  node_id: number
  title: string
  path_id: number
  path_title: string
  status: NodeStatus
  reason: 'in_progress' | 'next' | 'start'
}

export interface ProgressSummary {
  streak_days: number
  last_active: string | null
  continue_node: ContinueNode | null
}

export interface CertificateStatus {
  eligible: boolean
  user_name: string
  awarded_on: string | null
  average_score: number | null
  assessed_nodes: number
  min_average_score: number
  paths: { path_id: number; title: string; completed: number; total: number }[]
  /** Plain language list of what is still needed; empty when eligible. */
  missing: string[]
}

export interface WeakTopic {
  node_id: number
  title: string
  path_id: number
  path_title: string
  average_score: number
  attempts: number
  learners: number
  scenario_attempts: number
  scenario_correct_rate: number | null
}

export interface NodeStatusResult {
  node_id: number
  status: NodeStatus
  progress: PathProgressCounts
}

/* ── ServiceNow knowledge (mirrors the knowledge schemas in schemas.py) ── */

export type ArticleKind = 'runbook' | 'sop' | 'other'

export interface ApplicationRef {
  id: number
  app_number: string
  name: string
}

export interface ArticleSummary {
  id: number
  kb_number: string
  title: string
  summary: string
  classification: Classification
  kind: ArticleKind
  category: string | null
  knowledge_base: string | null
  version: string | null
  /** When the article last changed in ServiceNow (instance time, YYYY-MM-DD HH:MM:SS). */
  source_updated_at: string | null
  /** When the Training Hub last synced it (ISO 8601, UTC). */
  synced_at: string | null
  applications: ApplicationRef[]
  source: 'servicenow'
}

export interface Facet {
  value: string
  label: string
  count: number
}

export interface ArticleFacets {
  classifications: Facet[]
  kinds: Facet[]
  categories: Facet[]
  applications: Facet[]
}

export interface ArticlePage {
  items: ArticleSummary[]
  total: number
  page: number
  page_size: number
  facets: ArticleFacets
}

export interface ArticleQuery {
  q?: string
  classification?: Classification
  app_number?: string
  application_id?: number
  article_type?: ArticleKind
  category?: string
  node_id?: number
  sort?: 'updated' | 'title'
  order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface DocumentRef {
  id: number
  file_name: string
  content_type: string
  size_bytes: number
  article_id: number
  kb_number: string
  article_title: string
}

export interface LinkedArticle {
  id: number
  kb_number: string
  title: string
}

export interface RelatedNode {
  id: number
  title: string
  path_id: number
  path_title: string
}

export interface ArticleDetail extends ArticleSummary {
  body_markdown: string
  source_url: string | null
  /** False when the AI Tutor refuses this classification (server side LLM ceiling). */
  llm_allowed: boolean
  documents: DocumentRef[]
  linked_articles: LinkedArticle[]
  related_nodes: RelatedNode[]
}

export interface ApplicationCounts {
  runbooks: number
  sops: number
  other: number
  documents: number
}

export interface ApplicationSummary {
  id: number
  app_number: string
  name: string
  description: string
  counts: ApplicationCounts
}

export interface ApplicationDetail extends ApplicationSummary {
  runbooks: ArticleSummary[]
  sops: ArticleSummary[]
  other: ArticleSummary[]
  documents: DocumentRef[]
}

export interface KnowledgeStatus {
  enabled: boolean
  stale: boolean
  unreachable: boolean
  last_success_at: string | null
}

export type SyncMode = 'incremental' | 'full'

export interface SyncRun {
  id: number
  started_at: string
  finished_at: string | null
  mode: SyncMode
  trigger: string
  status: 'running' | 'success' | 'partial' | 'failed'
  articles_seen: number
  articles_created: number
  articles_updated: number
  articles_unchanged: number
  articles_retired: number
  articles_failed: number
  documents_downloaded: number
  documents_rejected: number
  error_summary: string | null
}

export interface SyncStarted {
  run_id: number
  mode: SyncMode
  status: 'running'
}

export interface ServiceNowStatus {
  enabled: boolean
  mock_mode: boolean
  auth_mode: string
  instance_host: string | null
  scheduler_running: boolean
  sync_interval_minutes: number
  running: boolean
  last_run: SyncRun | null
  last_success_at: string | null
  next_incremental: string | null
  next_full: string | null
  counts: {
    articles_active: number
    articles_inactive: number
    by_classification: Partial<Record<Classification, number>>
    applications: number
    documents: number
  }
}

export interface AccessLogEntry {
  id: number
  at: string
  action: 'view' | 'download'
  user_name: string
  user_email: string
  article_id: number
  kb_number: string
  classification: Classification
  /** Null when the article is above the viewing admin's own clearance. */
  title: string | null
  document_name: string | null
}
