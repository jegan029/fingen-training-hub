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

export interface Runbook extends RunbookRef {
  version: string
  updated: string
  description: string
  preconditions: string[]
  steps: string[]
  escalation_triggers: string[]
  node_ids: number[]
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
  kind: 'path' | 'node' | 'subtopic' | 'runbook'
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
