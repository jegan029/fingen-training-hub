"""Completion providers behind LLMService, selected with LLM_PROVIDER.

Every provider turns (system prompt, user prompt) into reply text. Prompt building, the
<learner_input> fencing and evaluation parsing stay in LLMService, so they apply to all providers.
"""

import json
import re
import time
from typing import Any, Protocol

import requests
from requests import RequestException


class LLMClientError(Exception):
    pass


class CompletionProvider(Protocol):
    name: str

    def complete(self, system: str, prompt: str, *, max_tokens: int, temperature: float) -> str: ...


def _post_json(
    url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int, retries: int
) -> dict[str, Any]:
    """POST with linear backoff between attempts."""
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except (RequestException, ValueError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(1.0 * attempt)
    raise LLMClientError(f"LLM request failed after {retries} attempts: {last_error}")


class OpenAICompatibleProvider:
    """/chat/completions on OpenAI, NVIDIA NIM, vLLM, Ollama and other compatible servers."""

    name = "openai_compatible"

    def __init__(self, base_url: str, api_key: str, model: str, timeout: int, retries: int) -> None:
        self.base_url, self.api_key, self.model = base_url.rstrip("/"), api_key, model
        self.timeout, self.retries = timeout, max(1, retries)

    def complete(self, system: str, prompt: str, *, max_tokens: int, temperature: float) -> str:
        if not self.model:
            raise LLMClientError("LLM_MODEL is not configured")
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        result = _post_json(f"{self.base_url}/chat/completions", payload, headers, self.timeout, self.retries)
        choices = result.get("choices")
        if not choices or not isinstance(choices, list) or not isinstance(choices[0], dict):
            raise LLMClientError("Invalid LLM response format")
        message = choices[0].get("message")
        if not message:
            raise LLMClientError("Invalid LLM response format")
        return (message.get("content") or "").strip()


class AnthropicProvider:
    """Anthropic Messages API (/v1/messages), called over HTTP without the SDK."""

    name = "anthropic"
    API_VERSION = "2023-06-01"

    def __init__(self, base_url: str, api_key: str, model: str, timeout: int, retries: int) -> None:
        self.base_url, self.api_key, self.model = base_url.rstrip("/"), api_key, model
        self.timeout, self.retries = timeout, max(1, retries)

    def complete(self, system: str, prompt: str, *, max_tokens: int, temperature: float) -> str:
        if not self.model:
            raise LLMClientError("LLM_MODEL is not configured")
        if not self.api_key:
            raise LLMClientError("LLM_API_KEY is not configured")
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": self.API_VERSION,
        }
        payload = {
            "model": self.model,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        result = _post_json(f"{self.base_url}/messages", payload, headers, self.timeout, self.retries)
        blocks = result.get("content")
        if not isinstance(blocks, list):
            raise LLMClientError("Invalid LLM response format")
        text = "".join(b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text")
        return text.strip()


# ── Offline ─────────────────────────────────────────────────

_WORD = re.compile(r"[a-z0-9]{4,}")
_STOP = {
    "this",
    "that",
    "with",
    "from",
    "have",
    "what",
    "when",
    "which",
    "your",
    "into",
    "they",
    "them",
    "their",
    "there",
    "then",
    "than",
    "will",
    "would",
    "should",
    "could",
    "about",
    "does",
    "each",
}


def _terms(text: str) -> set:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOP}


def _tag(prompt: str, tag: str) -> str:
    match = re.search(rf"<{tag}>\n?(.*?)\n?</{tag}>", prompt, re.DOTALL)
    return match.group(1) if match else ""


def _sections(markdown: str) -> list[str]:
    return [s.strip() for s in re.split(r"\n(?=#{1,3} )", markdown) if s.strip()]


class OfflineProvider:
    """No network and no model: deterministic answers for demos, workshops and tests.

    Chat returns the knowledge base section that shares the most words with the question.
    Evaluation scores keyword coverage of the reference content and replies in the same JSON
    shape a model would, so it goes through the normal parsing path.
    """

    name = "offline"

    def complete(self, system: str, prompt: str, *, max_tokens: int, temperature: float) -> str:
        if "<reference_content>" in prompt:
            return self._evaluate(prompt)
        return self._chat(prompt)

    def _chat(self, prompt: str) -> str:
        question = _terms(_tag(prompt, "learner_input"))
        best, best_overlap = "", 0
        reference = _tag(prompt, "knowledge_base") or _tag(prompt, "reference_article")
        for section in _sections(reference):
            overlap = len(question & _terms(section))
            if overlap > best_overlap:
                best, best_overlap = section, overlap
        if not best:
            return "I could not find the answer in the provided content."
        return f"Offline mode: this is the closest section of the training content.\n\n{best[:1500]}"

    def _evaluate(self, prompt: str) -> str:
        reference = _terms(_tag(prompt, "reference_content"))
        answer = _terms(_tag(prompt, "learner_input"))
        headings = re.findall(r"^## (.+)$", _tag(prompt, "reference_content"), re.MULTILINE)
        # Coverage of a fixed budget of reference terms, so a short correct answer can still score well.
        coverage = len(answer & reference) / 12 if reference else 0.0
        score = max(0, min(10, round(coverage * 10)))
        category = "Excellent" if score >= 9 else "Good" if score >= 7 else "Partial" if score >= 4 else "Incorrect"
        return json.dumps(
            {
                "score": score,
                "category": category,
                "feedback": "Offline evaluation: scored by how many key terms from the lesson your answer uses. "
                "Configure an LLM provider for written feedback.",
                "key_points": [h.strip() for h in headings[:5] if h.strip().lower() != "overview"],
            }
        )


def build_provider(
    name: str, base_url: str, api_key: str, model: str, timeout: int, retries: int
) -> CompletionProvider:
    if name == "offline":
        return OfflineProvider()
    if name == "anthropic":
        return AnthropicProvider(base_url, api_key, model, timeout, retries)
    if name == "openai_compatible":
        return OpenAICompatibleProvider(base_url, api_key, model, timeout, retries)
    raise ValueError(f"Unknown LLM_PROVIDER: {name!r} (use openai_compatible, anthropic or offline)")
