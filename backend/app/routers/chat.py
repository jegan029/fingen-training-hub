from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import LLM_RATE_LIMIT, logger
from ..schemas import ChatRequest, ChatResponse
from ..security import CurrentUser, get_current_user, limiter, user_or_ip_key
from ..services.classification import llm_allowed
from ..services.kb_service import KBService
from ..services.knowledge_service import get_visible_article, record_access
from ..services.llm_service import LLMClientError, LLMService

router = APIRouter()
kb_service = KBService()
llm_service = LLMService()

LLM_REFUSED = "This article cannot be shared with the AI Tutor"


@router.post("/query", response_model=ChatResponse)
@limiter.limit(LLM_RATE_LIMIT, key_func=user_or_ip_key)
def chat_query(request: Request, payload: ChatRequest, user: CurrentUser = Depends(get_current_user)) -> ChatResponse:
    if payload.article_id is not None:
        return _chat_about_article(request, payload, user)

    path = kb_service.get_path(payload.path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Learning path not found")
    context_documents = kb_service.get_context_documents(payload.path_id)
    if not context_documents:
        raise HTTPException(status_code=404, detail="Knowledge base is empty for this path")
    try:
        answer = llm_service.chat(payload.message, context_documents)
    except LLMClientError:
        logger.exception("Chat LLM call failed for path %s", payload.path_id)
        answer = llm_service.fallback_response(payload.message)
    return ChatResponse(
        answer=answer, source_node_ids=[node.id for node in kb_service.list_nodes_for_path(payload.path_id)]
    )


def _chat_about_article(request: Request, payload: ChatRequest, user: CurrentUser) -> ChatResponse:
    article = get_visible_article(payload.article_id, user.max_classification)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    # Checked before anything is sent: above the ceiling, the article never reaches the provider.
    ceiling = request.app.state.servicenow.settings.llm_max_classification
    if not llm_allowed(article["classification"], ceiling):
        raise HTTPException(status_code=403, detail=LLM_REFUSED)
    record_access(user.id, article["id"], article["classification"], "view")
    try:
        answer = llm_service.chat_about_article(
            payload.message, article["kb_number"], article["title"], article["body_markdown"]
        )
    except LLMClientError:
        logger.exception("Chat LLM call failed for article %s", article["id"])
        answer = llm_service.fallback_response(payload.message)
    return ChatResponse(answer=answer, source_node_ids=[], source_article_id=article["id"])
