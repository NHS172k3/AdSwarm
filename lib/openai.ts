import OpenAI from "openai";
import { CONFIG, isOpenAIConfigured } from "./config";
import type { CampaignDraft } from "./types";

const client = isOpenAIConfigured ? new OpenAI({ apiKey: CONFIG.OPENAI_KEY }) : null;

export async function maybeGenerateText(prompt: string): Promise<string | null> {
  if (!client) return null;
  try {
    const response = await client.responses.create({
      model: CONFIG.AI_MODEL,
      input: prompt,
      temperature: 0.45,
    });
    const output = (response as any).output_text;
    return typeof output === "string" && output.trim() ? output.trim() : null;
  } catch {
    return null;
  }
}

export async function maybeGenerateJson<T>(prompt: string): Promise<T | null> {
  const text = await maybeGenerateText(`${prompt}\nReturn JSON only.`);
  if (!text) return null;
  const trimmed = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export interface GeneratedImageAsset {
  dataUrl: string;
  prompt: string;
  model: string;
}

function campaignImagePrompt(draft: CampaignDraft, headline: string): string {
  return [
    "Create a polished advertising hero image for a hackathon demo.",
    "The result should look like finished paid social creative, not a UI mockup.",
    `Campaign: ${draft.brief}`,
    `Audience: ${draft.audience}`,
    `Hook: ${headline}`,
    `Call to action: ${draft.cta}`,
    "Use a premium product-ad composition with strong contrast, clear focal point, and enough clean space for overlay copy.",
    "Avoid dense paragraphs of text, watermarks, logos for existing brands, and cluttered UI elements.",
  ].join("\n");
}

export async function maybeGenerateCampaignImage(draft: CampaignDraft, headline: string): Promise<GeneratedImageAsset | null> {
  if (!client) return null;
  const prompt = campaignImagePrompt(draft, headline);

  try {
    const response = await client.images.generate({
      model: CONFIG.OPENAI_IMAGE_MODEL,
      prompt,
      n: 1,
      size: "1536x1024",
      quality: CONFIG.OPENAI_IMAGE_QUALITY as "low" | "medium" | "high" | "auto",
      output_format: "png",
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return null;
    return {
      dataUrl: `data:image/png;base64,${b64}`,
      prompt,
      model: CONFIG.OPENAI_IMAGE_MODEL,
    };
  } catch {
    return null;
  }
}
