from fastapi import APIRouter, Depends, Query

from ..schemas import SearchResult
from ..security import CurrentUser, get_current_user
from ..services.search_service import MAX_QUERY, SearchService

router = APIRouter()
search_service = SearchService()


@router.get("", response_model=list[SearchResult])
def search(q: str = Query("", max_length=MAX_QUERY), user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    return search_service.search(q, user.max_classification)
