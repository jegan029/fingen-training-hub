import json

from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import LLM_RATE_LIMIT
from ..db import connection
from ..schemas import AssessmentRequest, ScenarioEvaluateRequest
from ..security import CurrentUser, get_current_user, limiter, user_or_ip_key
from ..services.assessment_service import AssessmentService
from ..services.kb_service import KBService

router = APIRouter()
assessment_service = AssessmentService()
kb_service = KBService()


@router.get("/node/{node_id}")
def get_question_for_node(node_id: int) -> dict:
    question = assessment_service.get_node_question(node_id)
    if question is None:
        node = kb_service.get_node(node_id)
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")
        raise HTTPException(status_code=404, detail="Assessment question not available")
    return {"node_id": node_id, "question": question}


@router.post("/node/{node_id}/evaluate")
@limiter.limit(LLM_RATE_LIMIT, key_func=user_or_ip_key)
def evaluate_node(
    request: Request,
    node_id: int,
    payload: AssessmentRequest,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    node = kb_service.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if not payload.answer.strip():
        raise HTTPException(status_code=400, detail="Answer cannot be empty")
    return assessment_service.evaluate(user.id, node_id, payload.answer)


@router.get("/node/{node_id}/scenario")
def get_scenario(node_id: int) -> dict:
    with connection() as conn:
        row = conn.execute(
            "SELECT id, title, scenario_context, scenario_options FROM nodes WHERE id = ?",
            (node_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Node not found")
    if not row["scenario_context"] or not row["scenario_options"]:
        raise HTTPException(status_code=404, detail="Scenario not available for this node")
    options = json.loads(row["scenario_options"])
    return {
        "node_id": row["id"],
        "node_title": row["title"],
        "context": row["scenario_context"],
        "options": options,
    }


@router.post("/node/{node_id}/scenario/evaluate")
def evaluate_scenario(
    node_id: int,
    payload: ScenarioEvaluateRequest,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    with connection() as conn:
        row = conn.execute(
            "SELECT scenario_correct, scenario_explanation FROM nodes WHERE id = ?",
            (node_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Node not found")
        if row["scenario_correct"] is None:
            raise HTTPException(status_code=404, detail="Scenario not available for this node")

        correct = row["scenario_correct"]
        explanation = row["scenario_explanation"] or ""
        is_correct = payload.chosen_option == correct

        conn.execute(
            "INSERT INTO scenario_assessments (user_id, node_id, chosen_option, is_correct) VALUES (?, ?, ?, ?)",
            (user.id, node_id, payload.chosen_option, int(is_correct)),
        )

    return {
        "node_id": node_id,
        "chosen_option": payload.chosen_option,
        "correct_option": correct,
        "is_correct": is_correct,
        "explanation": explanation,
    }
