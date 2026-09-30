import type {
  AdminUser,
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
    throw new ApiError(res.status, message)
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
