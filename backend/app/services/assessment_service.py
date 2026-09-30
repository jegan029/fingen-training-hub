from typing import Any

from ..config import logger
from ..db import connection
from ..services.llm_service import LLMClientError, LLMService


class AssessmentService:
    def __init__(self) -> None:
        self.llm = LLMService()

    def get_node_question(self, node_id: int) -> str | None:
        with connection() as conn:
            row = conn.execute("SELECT sample_question FROM nodes WHERE id = ?", (node_id,)).fetchone()
        return row["sample_question"] if row else None

    def evaluate(self, user_id: int, node_id: int, answer: str) -> dict[str, Any]:
        with connection() as conn:
            row = conn.execute("SELECT title, content, sample_question FROM nodes WHERE id = ?", (node_id,)).fetchone()
        if not row:
            raise ValueError("Node not found")

        # The LLM call runs outside any open connection so a slow model does not hold the database.
        try:
            evaluation = self.llm.evaluate_answer(row["title"], row["content"], row["sample_question"] or "", answer)
        except LLMClientError:
            logger.exception("Assessment evaluation failed for node %s", node_id)
            evaluation = {
                "score": 0,
                "category": "Unavailable",
                "feedback": "LLM evaluation failed. Please try again later.",
                "key_points": ["No evaluation was available."],
            }

        with connection() as conn:
            conn.execute(
                "INSERT INTO assessments (user_id, node_id, answer, score, feedback, category) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, node_id, answer, evaluation["score"], evaluation["feedback"], evaluation["category"]),
            )
        return {"node_id": node_id, **evaluation}
