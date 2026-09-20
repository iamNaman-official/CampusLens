import pytest

from documents.agent import agent


def test_create_model_defaults_to_configurable_ollama(monkeypatch):
    captured = {}

    class FakeOllamaModel:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.delenv("AI_MODEL_PROVIDER", raising=False)
    monkeypatch.setattr(agent, "OllamaModel", FakeOllamaModel)

    agent.create_model()

    assert captured == {
        "host": "http://localhost:11434",
        "model_id": "qwen3:4b",
        "additional_args": {"think": False},
    }


def test_create_model_selects_bedrock_without_static_credentials(monkeypatch):
    captured = {}

    class FakeBedrockModel:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setenv("AI_MODEL_PROVIDER", "bedrock")
    monkeypatch.setenv("BEDROCK_REGION", "ap-south-1")
    monkeypatch.setenv("BEDROCK_MODEL_ID", "apac.amazon.nova-lite-v1:0")
    monkeypatch.setattr(agent, "BedrockModel", FakeBedrockModel)

    agent.create_model()

    assert captured == {
        "model_id": "apac.amazon.nova-lite-v1:0",
        "region_name": "ap-south-1",
        "temperature": 0.1,
    }


def test_create_model_rejects_unknown_provider(monkeypatch):
    monkeypatch.setenv("AI_MODEL_PROVIDER", "unsupported")

    with pytest.raises(ValueError, match="AI_MODEL_PROVIDER"):
        agent.create_model()
