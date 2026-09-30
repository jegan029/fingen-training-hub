from fastapi import APIRouter, HTTPException, Request

from ..config import LLM_RATE_LIMIT, logger
from ..schemas import ChatRequest, ChatResponse
from ..security import limiter, user_or_ip_key
from ..services.kb_service import KBService
from ..services.llm_service import LLMClientError, LLMService

router = APIRouter()
kb_service = KBService()
llm_service = LLMService()


@router.post("/query", response_model=ChatResponse)
@limiter.limit(LLM_RATE_LIMIT, key_func=user_or_ip_key)
def chat_query(request: Request, payload: ChatRequest) -> ChatResponse:
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
