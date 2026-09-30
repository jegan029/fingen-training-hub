from typing import Literal

from pydantic import BaseModel, EmailStr, Field

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
    path_id: int
    message: str = Field(min_length=1, max_length=MAX_CHAT_MESSAGE)


class ChatResponse(BaseModel):
    answer: str
    source_node_ids: list[int]


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
    kind: Literal["path", "node", "subtopic", "runbook"]
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
