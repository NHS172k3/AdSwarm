from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Any


@dataclass
class OpenAIHelper:
    model: str = "gpt-4o-mini"

    def __post_init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY")
        self._client = None
        if not self.api_key:
            return
        try:
            from openai import AsyncOpenAI  # type: ignore

            self._client = AsyncOpenAI(api_key=self.api_key)
        except Exception:
            self._client = None

    async def generate_text(self, prompt: str, fallback: str, *, max_output_tokens: int = 250) -> str:
        if not self._client:
            return fallback

        try:
            response = await self._client.responses.create(
                model=self.model,
                input=prompt,
                max_output_tokens=max_output_tokens,
            )
        except Exception:
            return fallback

        text = getattr(response, "output_text", None)
        if isinstance(text, str) and text.strip():
            return text.strip()

        try:
            output = getattr(response, "output", []) or []
            chunks: list[str] = []
            for item in output:
                for content in getattr(item, "content", []) or []:
                    chunk = getattr(content, "text", None)
                    if isinstance(chunk, str):
                        chunks.append(chunk)
            combined = "\n".join(chunks).strip()
            if combined:
                return combined
        except Exception:
            return fallback

        return fallback

    async def generate_json(self, prompt: str, fallback: dict[str, Any]) -> dict[str, Any]:
        raw = await self.generate_text(
            prompt + "\nReturn compact JSON only.",
            json.dumps(fallback, ensure_ascii=True),
        )
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
        return fallback

    async def maybe_timeout(self, coro: Any, timeout_ms: int, fallback: Any) -> Any:
        try:
            return await asyncio.wait_for(coro, timeout=timeout_ms / 1000)
        except Exception:
            return fallback

