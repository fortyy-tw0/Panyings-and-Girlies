"""
app/llm.py: the backend's bridge to the local AI (Ollama).

Usage from the Companion module:
    from app.llm import generate
    reply = generate(system_prompt, [{"role": "user", "content": "Why do I get cramps?"}])

Uses only the Python standard library (no extra pip installs).
If Ollama isn't running, returns a canned reply so the demo never crashes.
"""
import json
import os
import re
import urllib.error
import urllib.request

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/chat")
MODEL = os.environ.get("PUSHY_MODEL", "qwen3.5:2b")
TIMEOUT_SECONDS = 120  # CPU-only laptops can be slow on the first answer

STUB_REPLY = (
    "I'm having trouble thinking right now. Please try again in a moment. "
    "If you're in pain or worried, please talk to a healthcare professional."
)


def generate(system: str, messages: list[dict], temperature: float = 0.4, max_tokens: int = 400) -> str:
    """Send a system prompt + chat history to the local model and return its reply text."""
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}, *messages],
        "stream": False,
        "think": False,  # Qwen3.5 "thinking" off: short, direct answers
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            data = json.loads(response.read().decode("utf-8"))
        text = data.get("message", {}).get("content", "")
        # Safety net in case the model still "thinks out loud".
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        return text or STUB_REPLY
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        # Never log the user's message text here (privacy rule from the backend plan).
        print(f"[llm] Ollama call failed: {type(error).__name__}")
        return STUB_REPLY


def is_model_ready() -> bool:
    """For GET /health: True if Ollama is running and the model is downloaded."""
    try:
        with urllib.request.urlopen(OLLAMA_URL.replace("/api/chat", "/api/tags"), timeout=3) as response:
            names = [m.get("name", "") for m in json.loads(response.read()).get("models", [])]
        return any(name.startswith(MODEL) for name in names)
    except Exception:
        return False
