from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from .services.classification import Level

MAX_CHAT_MESSAGE = 2000
MAX_ANSWER = 4000


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AuthUser(BaseModel):
    id: int
    name: str
    email: str
    role: str


class PublicStats(BaseModel):
    """Aggregate counts for the sign in page; nothing else is public."""

    paths: int
    lessons: int
    runbooks: int


class LearningPathSummary(BaseModel):
    id: int
    slug: str
    title: str
    description: str


NodeStatus = Literal["pending", "in_progress", "done", "skipped"]


class Subtopic(BaseModel):
    id: str
    title: str
    summary: str


class RunbookRef(BaseModel):
    id: int
    slug: str
    title: str
    category: str


class Prerequisite(BaseModel):
    id: int
    title: str
    path_id: int
    status: NodeStatus


class NodeSummary(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    dependencies: list[int]
    status: NodeStatus = "pending"
    completed: bool
    locked: bool
    # Titles of the dependencies still blocking this node (for the lock tooltip).
    locked_by: list[str] = []
    prerequisites: list[Prerequisite] = []
    subtopics: list[Subtopic] = []
    runbooks: list[RunbookRef] = []


class NodeDetail(NodeSummary):
    content: str
    sample_question: str | None


class ProgressPayload(BaseModel):
    node_id: int


class NodeStatusUpdate(BaseModel):
    status: NodeStatus


class Runbook(RunbookRef):
    version: str
    updated: str
    description: str
    preconditions: list[str]
    steps: list[str]
    escalation_triggers: list[str]
    node_ids: list[int] = []
    source: Literal["local", "servicenow"] = "local"
    # Set for ServiceNow runbooks: the knowledge article holding the body (read only).
    kb_article_id: int | None = None
    classification: Level = "internal"


class AssessmentRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=MAX_ANSWER)


class AssessmentResult(BaseModel):
    node_id: int
    score: int
    category: str
    feedback: str
    key_points: list[str]


class ScenarioQuestion(BaseModel):
    node_id: int
    node_title: str
    context: str
    options: list[str]


class ScenarioEvaluateRequest(BaseModel):
    chosen_option: int = Field(ge=0, le=20)


class ScenarioResult(BaseModel):
    node_id: int
    chosen_option: int
    correct_option: int
    is_correct: bool
    explanation: str


class ChatRequest(BaseModel):
    # Exactly one context: a training path (its lessons) or one knowledge article.
    path_id: int | None = None
    article_id: int | None = None
    message: str = Field(min_length=1, max_length=MAX_CHAT_MESSAGE)

    @model_validator(mode="after")
    def _one_context(self) -> "ChatRequest":
        if (self.path_id is None) == (self.article_id is None):
            raise ValueError("Send either path_id or article_id")
        return self


class ClearanceUpdate(BaseModel):
    max_classification: Level


class AccessLogEntry(BaseModel):
    id: int
    at: str
    action: Literal["view", "download"]
    user_name: str
    user_email: str
    article_id: int
    kb_number: str
    classification: Level
    # None when the article is above the viewing admin's own clearance.
    title: str | None
    document_name: str | None


class ChatResponse(BaseModel):
    answer: str
    source_node_ids: list[int]
    source_article_id: int | None = None


class AnalyticsSummary(BaseModel):
    user_id: int
    path_id: int
    completed_nodes: int
    total_nodes: int
    completion_rate: float
    average_score: float | None


class PathProgress(BaseModel):
    path_id: int
    title: str
    completed: int
    total: int
    pct: int


class ProgressOverview(BaseModel):
    user_id: int
    user_name: str
    paths: list[PathProgress]
    overall_pct: int


class ContinueNode(BaseModel):
    node_id: int
    title: str
    path_id: int
    path_title: str
    status: NodeStatus
    # in_progress: the learner started it; next: next open node in the last active path; start: nothing touched yet.
    reason: Literal["in_progress", "next", "start"]


class ProgressSummary(BaseModel):
    streak_days: int
    last_active: str | None
    continue_node: ContinueNode | None


class CertificatePath(BaseModel):
    path_id: int
    title: str
    completed: int
    total: int


class CertificateStatus(BaseModel):
    eligible: bool
    user_name: str
    awarded_on: str | None
    average_score: float | None
    assessed_nodes: int
    min_average_score: float
    paths: list[CertificatePath]
    missing: list[str]


class SearchResult(BaseModel):
    kind: Literal["path", "node", "subtopic", "runbook", "article", "application", "document"]
    id: str
    title: str
    subtitle: str
    url: str


class WeakTopic(BaseModel):
    node_id: int
    title: str
    path_id: int
    path_title: str
    average_score: float
    attempts: int
    learners: int
    scenario_attempts: int
    scenario_correct_rate: int | None


class AdminUserPath(BaseModel):
    path_id: int
    title: str
    completed: int
    total: int
    pct: int


class AdminUser(BaseModel):
    id: int
    name: str
    email: str
    last_active: str | None
    paths: list[AdminUserPath]
    overall_pct: int


# ── ServiceNow knowledge ────────────────────────────────────

ArticleKind = Literal["runbook", "sop", "other"]


class ApplicationRef(BaseModel):
    id: int
    app_number: str
    name: str


class ArticleSummary(BaseModel):
    id: int
    kb_number: str
    title: str
    summary: str
    classification: Level
    kind: ArticleKind
    category: str | None
    knowledge_base: str | None
    version: str | None
    source_updated_at: str | None
    synced_at: str | None
    applications: list[ApplicationRef]
    source: Literal["servicenow"] = "servicenow"


class Facet(BaseModel):
    value: str
    label: str
    count: int


class ArticleFacets(BaseModel):
    classifications: list[Facet]
    kinds: list[Facet]
    categories: list[Facet]
    applications: list[Facet]


class ArticlePage(BaseModel):
    items: list[ArticleSummary]
    total: int
    page: int
    page_size: int
    facets: ArticleFacets


class DocumentRef(BaseModel):
    id: int
    file_name: str
    content_type: str
    size_bytes: int
    article_id: int
    kb_number: str
    article_title: str


class LinkedArticle(BaseModel):
    id: int
    kb_number: str
    title: str


class RelatedNode(BaseModel):
    id: int
    title: str
    path_id: int
    path_title: str


class ArticleDetail(ArticleSummary):
    body_markdown: str
    source_url: str | None
    # False when the classification is above the LLM ceiling: the AI Tutor will refuse it.
    llm_allowed: bool
    documents: list[DocumentRef]
    linked_articles: list[LinkedArticle]
    related_nodes: list[RelatedNode]


class ArticleLookup(BaseModel):
    id: int


class ApplicationCounts(BaseModel):
    runbooks: int
    sops: int
    other: int
    documents: int


class ApplicationSummary(BaseModel):
    id: int
    app_number: str
    name: str
    description: str
    counts: ApplicationCounts


class ApplicationDetail(ApplicationSummary):
    runbooks: list[ArticleSummary]
    sops: list[ArticleSummary]
    other: list[ArticleSummary]
    documents: list[DocumentRef]


class KnowledgeStatus(BaseModel):
    """What learners need for the stale and unreachable banners; no operational detail."""

    enabled: bool
    stale: bool
    unreachable: bool
    last_success_at: str | None


class SyncRun(BaseModel):
    id: int
    started_at: str
    finished_at: str | None
    mode: Literal["incremental", "full"]
    trigger: str
    status: Literal["running", "success", "partial", "failed"]
    articles_seen: int
    articles_created: int
    articles_updated: int
    articles_unchanged: int
    articles_retired: int
    articles_failed: int
    documents_downloaded: int
    documents_rejected: int
    error_summary: str | None


class SyncStarted(BaseModel):
    run_id: int
    mode: Literal["incremental", "full"]
    status: Literal["running"] = "running"


class ServiceNowCounts(BaseModel):
    articles_active: int
    articles_inactive: int
    by_classification: dict[str, int]
    applications: int
    documents: int


class ServiceNowStatus(BaseModel):
    enabled: bool
    mock_mode: bool
    auth_mode: str
    instance_host: str | None
    scheduler_running: bool
    sync_interval_minutes: int
    running: bool
    last_run: SyncRun | None
    last_success_at: str | None
    next_incremental: str | None
    next_full: str | None
    counts: ServiceNowCounts


class NodeLinkResult(BaseModel):
    article_id: int
    node_id: int
    linked: bool
