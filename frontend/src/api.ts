import type {
  AccessLogEntry,
  PublicStats,
  AdminUser,
  ApplicationDetail,
  ApplicationSummary,
  ArticleDetail,
  ArticlePage,
  ArticleQuery,
  Classification,
  KnowledgeStatus,
  ServiceNowStatus,
  SyncMode,
  SyncRun,
  SyncStarted,
  AnalyticsSummary,
  AssessmentQuestion,
  AssessmentResult,
  AuthUser,
  CertificateStatus,
  ChatResponse,
  LearningPath,
  NodeDetail,
  NodeStatus,
  NodeStatusResult,
  NodeSummary,
  ProgressOverview,
  ProgressSummary,
  Runbook,
  ScenarioQuestion,
  ScenarioResult,
  SearchResult,
  WeakTopic,
} from './types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Seconds to wait before retrying, from the Retry-After header on a 429. */
    public retryAfter?: number,
  ) {
    super(message)
  }
}

// Called when the server says the session is missing or expired, so the UI can return to login.
let unauthorizedHandler: (() => void) | null = null
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      // Required by the backend CSRF check on state-changing requests.
      'X-Requested-With': 'fetch',
      ...options.headers,
    },
  })
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler?.()
    let message = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') message = body.detail
    } catch {
      /* non-JSON error body */
    }
    const retryAfter = Number(res.headers.get('Retry-After'))
    throw new ApiError(res.status, message, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  return request<AuthUser>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

/** Aggregate counts for the sign in page; public, no session needed. */
export async function fetchPublicStats(): Promise<PublicStats> {
  return request<PublicStats>('/public/stats')
}

export async function fetchMe(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me')
}

export async function logoutUser(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' })
}

export async function fetchRoadmaps() {
  return request<LearningPath[]>('/roadmaps/')
}

export async function fetchRoadmapNodes(pathId: number) {
  return request<NodeSummary[]>(`/roadmaps/${pathId}`)
}

export async function fetchNodeDetail(nodeId: number) {
  return request<NodeDetail>(`/roadmaps/node/${nodeId}`)
}

export async function completeNode(nodeId: number) {
  return request<NodeStatusResult>('/progress/complete', {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId }),
  })
}

export async function setNodeStatus(nodeId: number, status: NodeStatus) {
  return request<NodeStatusResult>(`/progress/node/${nodeId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export async function fetchRunbooks() {
  return request<Runbook[]>('/runbooks/')
}

export async function fetchRunbook(runbookId: number) {
  return request<Runbook>(`/runbooks/${runbookId}`)
}

export async function fetchAssessmentQuestion(nodeId: number) {
  return request<AssessmentQuestion>(`/assessments/node/${nodeId}`)
}

export async function submitAssessment(nodeId: number, answer: string) {
  return request<AssessmentResult>(`/assessments/node/${nodeId}/evaluate`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  })
}

export async function fetchScenarioQuestion(nodeId: number) {
  return request<ScenarioQuestion>(`/assessments/node/${nodeId}/scenario`)
}

export async function submitScenario(nodeId: number, chosenOption: number) {
  return request<ScenarioResult>(`/assessments/node/${nodeId}/scenario/evaluate`, {
    method: 'POST',
    body: JSON.stringify({ chosen_option: chosenOption }),
  })
}

export async function fetchProgressOverview() {
  return request<ProgressOverview>('/progress/overview')
}

export async function chatQuery(pathId: number, message: string) {
  return request<ChatResponse>('/chat/query', {
    method: 'POST',
    body: JSON.stringify({ path_id: pathId, message }),
  })
}

export async function fetchAnalytics(pathId: number) {
  return request<AnalyticsSummary>(`/analytics/path/${pathId}`)
}

export async function fetchAdminUsers() {
  return request<AdminUser[]>('/admin/users')
}

export async function fetchWeakestTopics(limit = 10) {
  return request<WeakTopic[]>(`/admin/weakest-topics?limit=${limit}`)
}

export async function searchAll(query: string) {
  return request<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`)
}

export async function fetchProgressSummary() {
  return request<ProgressSummary>('/progress/summary')
}

export async function fetchCertificate() {
  return request<CertificateStatus>('/certificate')
}

/* ── ServiceNow knowledge ───────────────────────────────── */

export async function chatAboutArticle(articleId: number, message: string) {
  return request<ChatResponse>('/chat/query', {
    method: 'POST',
    body: JSON.stringify({ article_id: articleId, message }),
  })
}

/** Query string from defined, non empty values only. */
function queryString(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export async function fetchArticles(query: ArticleQuery = {}) {
  return request<ArticlePage>(`/knowledge/articles${queryString(query)}`)
}

export async function fetchArticle(articleId: number) {
  return request<ArticleDetail>(`/knowledge/articles/${articleId}`)
}

export async function lookupArticle(kbNumber: string) {
  return request<{ id: number }>(`/knowledge/articles/by-number/${encodeURIComponent(kbNumber)}`)
}

export async function fetchApplications() {
  return request<ApplicationSummary[]>('/knowledge/applications')
}

export async function fetchApplication(applicationId: number) {
  return request<ApplicationDetail>(`/knowledge/applications/${applicationId}`)
}

/** Same origin URL that streams a document after the server side access check. */
export function documentDownloadUrl(documentId: number): string {
  return `${BASE_URL}/knowledge/documents/${documentId}/download`
}

export async function fetchKnowledgeStatus() {
  return request<KnowledgeStatus>('/knowledge/status')
}

export async function fetchServiceNowStatus() {
  return request<ServiceNowStatus>('/admin/servicenow/status')
}

export async function startServiceNowSync(mode: SyncMode) {
  return request<SyncStarted>(`/admin/servicenow/sync?mode=${mode}`, { method: 'POST' })
}

export async function fetchSyncRuns(limit = 20) {
  return request<SyncRun[]>(`/admin/servicenow/runs?limit=${limit}`)
}

export async function fetchSyncRun(runId: number) {
  return request<SyncRun>(`/admin/servicenow/runs/${runId}`)
}

export async function fetchAccessLog(limit = 50) {
  return request<AccessLogEntry[]>(`/admin/servicenow/audit?limit=${limit}`)
}

export async function setUserClearance(userId: number, level: Classification) {
  return request<{ id: number; max_classification: Classification }>(`/admin/users/${userId}/clearance`, {
    method: 'PUT',
    body: JSON.stringify({ max_classification: level }),
  })
}
