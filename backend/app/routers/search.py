from fastapi import APIRouter, Query

from ..schemas import SearchResult
from ..services.search_service import MAX_QUERY, SearchService

router = APIRouter()
search_service = SearchService()


@router.get("", response_model=list[SearchResult])
def search(q: str = Query("", max_length=MAX_QUERY)) -> list[dict]:
    return search_service.search(q)
