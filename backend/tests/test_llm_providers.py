import pytest
import requests

from app.services import llm_providers
from app.services.llm_providers import (
    AnthropicProvider,
    LLMClientError,
    OfflineProvider,
    OpenAICompatibleProvider,
    build_provider,
)
from app.services.llm_service import LLMService

KB = "# Settlement\n\n## Overview\nIntro.\n\n## Settlement cycles\nTrades settle on T plus 1 via the clearing house batch.\n\n## Reconciliation\nBreaks are matched against custodian statements."


class FakeResponse:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}")

    def json(self):
        return self.body


class Calls(list):
    """Requests made through the fake requests.post; queue replies in .responses."""

    def __init__(self):
        super().__init__()
        self.responses = []


@pytest.fixture()
def captured(monkeypatch):
    calls = Calls()

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append({"url": url, "json": json, "headers": headers})
        return calls.responses.pop(0)

    monkeypatch.setattr(llm_providers.requests, "post", fake_post)
    monkeypatch.setattr(llm_providers.time, "sleep", lambda _s: None)
    return calls


def test_build_provider_by_name():
    assert isinstance(build_provider("offline", "", "", "", 1, 1), OfflineProvider)
    assert isinstance(build_provider("anthropic", "u", "k", "m", 1, 1), AnthropicProvider)
    assert isinstance(build_provider("openai_compatible", "u", "k", "m", 1, 1), OpenAICompatibleProvider)
    with pytest.raises(ValueError):
        build_provider("mystery", "", "", "", 1, 1)


def test_openai_compatible_request_shape(captured):
    captured.responses.append(FakeResponse({"choices": [{"message": {"content": " hi "}}]}))
    provider = OpenAICompatibleProvider("https://llm.example/v1/", "key", "model-x", 5, 1)
    assert provider.complete("sys", "prompt", max_tokens=100, temperature=0.2) == "hi"
    call = captured[0]
    assert call["url"] == "https://llm.example/v1/chat/completions"
    assert call["headers"]["Authorization"] == "Bearer key"
    assert call["json"]["messages"][0] == {"role": "system", "content": "sys"}
    assert call["json"]["model"] == "model-x"


def test_anthropic_request_shape(captured):
    captured.responses.append(
        FakeResponse({"content": [{"type": "text", "text": "Hello"}, {"type": "text", "text": " there"}]})
    )
    provider = AnthropicProvider("https://api.anthropic.com/v1", "key", "claude-model", 5, 1)
    assert provider.complete("sys", "prompt", max_tokens=100, temperature=0.2) == "Hello there"
    call = captured[0]
    assert call["url"] == "https://api.anthropic.com/v1/messages"
    assert call["headers"]["x-api-key"] == "key"
    assert call["headers"]["anthropic-version"] == AnthropicProvider.API_VERSION
    assert call["json"]["system"] == "sys"
    assert call["json"]["messages"] == [{"role": "user", "content": "prompt"}]


def test_providers_retry_then_raise(captured):
    captured.responses += [FakeResponse({}, 500), FakeResponse({}, 503)]
    provider = OpenAICompatibleProvider("https://llm.example/v1", "", "m", 5, 2)
    with pytest.raises(LLMClientError):
        provider.complete("s", "p", max_tokens=10, temperature=0)
    assert len(captured) == 2


def test_missing_model_or_key_raises_without_network(captured):
    with pytest.raises(LLMClientError):
        OpenAICompatibleProvider("u", "k", "", 5, 1).complete("s", "p", max_tokens=1, temperature=0)
    with pytest.raises(LLMClientError):
        AnthropicProvider("u", "", "m", 5, 1).complete("s", "p", max_tokens=1, temperature=0)
    assert captured == []


def test_offline_chat_returns_the_closest_section():
    service = LLMService(OfflineProvider())
    answer = service.chat("How do trades settle through the clearing house?", [KB])
    assert "Settlement cycles" in answer and "clearing house" in answer
    assert service.chat("xyzzy plugh", [KB]) == "I could not find the answer in the provided content."


def test_offline_evaluation_is_deterministic_and_parsed():
    service = LLMService(OfflineProvider())
    good = service.evaluate_answer(
        "Settlement",
        KB,
        "Q",
        "Trades settle T plus 1 through the clearing house batch; "
        "reconciliation matches breaks against custodian statements.",
    )
    weak = service.evaluate_answer("Settlement", KB, "Q", "no idea")
    assert good == service.evaluate_answer(
        "Settlement",
        KB,
        "Q",
        "Trades settle T plus 1 through the clearing house "
        "batch; reconciliation matches breaks against custodian statements.",
    )
    assert good["score"] > weak["score"] == 0
    assert weak["category"] == "Incorrect"
    assert good["key_points"] == ["Settlement cycles", "Reconciliation"]
