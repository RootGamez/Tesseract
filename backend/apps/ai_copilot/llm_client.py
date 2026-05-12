"""
LLM Client — Abstraction over OpenAI API and Ollama (RF-AI-01, RF-AI-02, RF-AI-03)
Implements graceful fallback: OpenAI → Ollama → Silent fail (RF-SEC criterion).
"""
import time
import json
import hashlib
import structlog
from django.conf import settings

logger = structlog.get_logger(__name__)

# JSON schema for question generation output
QUESTION_JSON_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
            "options": {
                "type": "array",
                "items": {"type": "object", "properties": {
                    "text": {"type": "string"},
                    "is_correct": {"type": "boolean"},
                }},
            },
            "correct_answer": {"type": "string"},
            "explanation": {"type": "string"},
            "difficulty": {"type": "string", "enum": ["EASY", "MEDIUM", "HARD"]},
        },
    },
}


class LLMClient:
    """
    Unified LLM client with OpenAI primary and Ollama fallback.
    All calls are silent on failure — never blocking classroom flow.
    """

    def __init__(self):
        self.openai_key = settings.OPENAI_API_KEY
        self.openai_model = settings.OPENAI_MODEL
        self.ollama_url = settings.OLLAMA_BASE_URL
        self.ollama_model = settings.OLLAMA_MODEL

    def complete(self, prompt: str, system: str = "", max_tokens: int = 2000) -> dict:
        """
        Send a completion request. Returns {"content": str, "model": str, "tokens": int}.
        Falls back silently on failure (acceptance criteria: AI fails silently).
        """
        # Try OpenAI first
        if self.openai_key:
            try:
                return self._call_openai(prompt, system, max_tokens)
            except Exception as exc:
                logger.warning("openai_failed_falling_back", error=str(exc))

        # Fallback to Ollama
        try:
            return self._call_ollama(prompt, system, max_tokens)
        except Exception as exc:
            logger.error("ollama_failed", error=str(exc))
            return {"content": None, "model": None, "tokens": 0, "error": str(exc)}

    def _call_openai(self, prompt: str, system: str, max_tokens: int) -> dict:
        import openai
        client = openai.OpenAI(api_key=self.openai_key)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        start = time.monotonic()
        response = client.chat.completions.create(
            model=self.openai_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.7,
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        content = response.choices[0].message.content
        return {
            "content": content,
            "model": self.openai_model,
            "tokens": response.usage.total_tokens,
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "duration_ms": duration_ms,
        }

    def _call_ollama(self, prompt: str, system: str, max_tokens: int) -> dict:
        import requests
        url = f"{self.ollama_url}/api/chat"
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        start = time.monotonic()
        resp = requests.post(url, json={
            "model": self.ollama_model,
            "messages": messages,
            "stream": False,
        }, timeout=120)
        resp.raise_for_status()
        duration_ms = int((time.monotonic() - start) * 1000)
        data = resp.json()
        content = data.get("message", {}).get("content", "")
        return {
            "content": content,
            "model": self.ollama_model,
            "tokens": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "duration_ms": duration_ms,
        }

    def parse_json_response(self, content: str) -> list | dict | None:
        """Extract JSON from LLM response (handles markdown code blocks)."""
        if not content:
            return None
        # Strip markdown code fences if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        try:
            return json.loads(content.strip())
        except json.JSONDecodeError:
            logger.warning("json_parse_failed", content_preview=content[:200])
            return None


def get_input_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()
