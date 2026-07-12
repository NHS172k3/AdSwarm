from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from .config import CONFIG
from .models import Artifact, ArtifactStatus
from .openai_helper import OpenAIHelper


@dataclass
class GenerationResult:
    artifact: Artifact
    real_cost_usd: float
    status: str


class GenerationService:
    def __init__(self, helper: OpenAIHelper | None = None) -> None:
        self.helper = helper or OpenAIHelper()

    async def build_hero_artifact(
        self,
        *,
        campaign_id: str,
        product_name: str,
        brief: str,
        audience: str | None,
        cta: str | None,
        uploaded_image_url: str | None,
        video_enabled: bool,
    ) -> GenerationResult:
        if uploaded_image_url:
            title = f"{product_name} hero creative"
            preview = f"Upload reused in an ad frame. CTA: {cta or 'Shop now'}"
            artifact = Artifact(
                id=f"{campaign_id}:image",
                type="image",
                producer="designer",
                version=1,
                title=title,
                storage_url=uploaded_image_url,
                preview_text=preview,
                status="ready",
                metadata={
                    "source": "upload",
                    "audience": audience,
                    "video_enabled": video_enabled,
                },
            )
            return GenerationResult(artifact=artifact, real_cost_usd=0.0, status="done")

        prompt = (
            f"Write a sharp direct-response hero concept for {product_name}. "
            f"Brief: {brief}. Audience: {audience or 'general buyers'}. CTA: {cta or 'Learn more'}."
        )
        fallback_headline = f"{product_name}: built for {audience or 'your audience'}"
        text = await self.helper.generate_text(prompt, fallback_headline, max_output_tokens=120)
        digest = hashlib.sha1(f"{campaign_id}:{text}".encode("utf-8")).hexdigest()[:10]
        artifact = Artifact(
            id=f"{campaign_id}:image",
            type="image",
            producer="designer",
            version=1,
            title=f"{product_name} hero creative",
            storage_url=f"mock://creative/{digest}.png",
            preview_text=text,
            status="ready",
            metadata={
                "source": "openai-fallback",
                "audience": audience,
                "video_enabled": video_enabled,
            },
        )
        return GenerationResult(
            artifact=artifact,
            real_cost_usd=0.02,
            status="done",
        )

    async def build_support_artifact(
        self,
        *,
        campaign_id: str,
        kind: str,
        title: str,
        preview_text: str,
        producer: str = "strategist",
        metadata: dict[str, Any] | None = None,
        status: ArtifactStatus = "ready",
    ) -> Artifact:
        return Artifact(
            id=f"{campaign_id}:{kind}",
            type=kind,  # type: ignore[arg-type]
            producer=producer,  # type: ignore[arg-type]
            version=1,
            title=title,
            preview_text=preview_text,
            status=status,
            metadata=metadata or {},
        )

