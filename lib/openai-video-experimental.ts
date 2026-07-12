const OPENAI_VIDEO_API_BASE = process.env.OPENAI_EXPERIMENTAL_VIDEO_BASE_URL ?? "https://api.openai.com/v1";
const OPENAI_VIDEO_ENABLED = process.env.OPENAI_EXPERIMENTAL_VIDEO_ENABLED === "true";
const OPENAI_VIDEO_DEFAULT_MODEL = process.env.OPENAI_EXPERIMENTAL_VIDEO_MODEL ?? "sora-2";

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const EXPERIMENTAL_OPENAI_VIDEO_CONFIG = {
  enabled: OPENAI_VIDEO_ENABLED,
  baseUrl: OPENAI_VIDEO_API_BASE,
  defaultModel: OPENAI_VIDEO_DEFAULT_MODEL,
  pollIntervalMs: readPositiveInteger(process.env.OPENAI_EXPERIMENTAL_VIDEO_POLL_INTERVAL_MS, 10000),
  pollTimeoutMs: readPositiveInteger(process.env.OPENAI_EXPERIMENTAL_VIDEO_POLL_TIMEOUT_MS, 300000),
} as const;

export type ExperimentalVideoVariant = "video" | "thumbnail" | "spritesheet";

export interface ExperimentalVideoErrorPayload {
  message?: string;
  type?: string;
  param?: string | null;
  code?: string | null;
}

export interface ExperimentalVideoJob {
  id: string;
  object?: string;
  created_at?: number;
  status: "queued" | "in_progress" | "completed" | "failed" | "canceled" | (string & {});
  model?: string;
  progress?: number;
  seconds?: string;
  size?: string;
  error?: ExperimentalVideoErrorPayload;
}

export interface CreateExperimentalVideoInput {
  prompt: string;
  model?: string;
  size?: string;
  seconds?: string;
}

export interface ExperimentalVideoPollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export interface ExperimentalVideoRequestOptions {
  signal?: AbortSignal;
}

export class ExperimentalVideoApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ExperimentalVideoApiError";
    this.status = status;
    this.details = details;
  }
}

function ensureExperimentalVideoEnabled() {
  if (!EXPERIMENTAL_OPENAI_VIDEO_CONFIG.enabled) {
    throw new ExperimentalVideoApiError(
      "Experimental OpenAI video route is disabled. Set OPENAI_EXPERIMENTAL_VIDEO_ENABLED=true to enable it.",
      404,
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new ExperimentalVideoApiError(
      "OPENAI_API_KEY is required for experimental OpenAI video generation.",
      500,
    );
  }
}

function buildHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Authorization", `Bearer ${process.env.OPENAI_API_KEY}`);
  return headers;
}

function normalizeCreatePayload(input: CreateExperimentalVideoInput) {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new ExperimentalVideoApiError("A non-empty prompt is required.", 400);
  }

  const payload: Record<string, string> = {
    model: input.model?.trim() || EXPERIMENTAL_OPENAI_VIDEO_CONFIG.defaultModel,
    prompt,
  };

  if (input.size?.trim()) {
    payload.size = input.size.trim();
  }

  if (input.seconds?.trim()) {
    payload.seconds = input.seconds.trim();
  }

  return payload;
}

async function openAIVideoJsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  ensureExperimentalVideoEnabled();

  const response = await fetch(`${EXPERIMENTAL_OPENAI_VIDEO_CONFIG.baseUrl}${path}`, {
    ...init,
    headers: buildHeaders(init?.headers),
    cache: "no-store",
  });

  if (!response.ok) {
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {
      details = await response.text().catch(() => null);
    }

    const message =
      typeof details === "object" &&
      details !== null &&
      "error" in details &&
      typeof (details as { error?: { message?: unknown } }).error?.message === "string"
        ? (details as { error: { message: string } }).error.message
        : `OpenAI video request failed with status ${response.status}.`;

    throw new ExperimentalVideoApiError(message, response.status, details);
  }

  return (await response.json()) as T;
}

export async function createExperimentalVideo(input: CreateExperimentalVideoInput, options?: ExperimentalVideoRequestOptions): Promise<ExperimentalVideoJob> {
  return openAIVideoJsonRequest<ExperimentalVideoJob>("/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeCreatePayload(input)),
    signal: options?.signal,
  });
}

export async function getExperimentalVideo(videoId: string): Promise<ExperimentalVideoJob> {
  const trimmedId = videoId.trim();
  if (!trimmedId) {
    throw new ExperimentalVideoApiError("videoId is required.", 400);
  }

  return openAIVideoJsonRequest<ExperimentalVideoJob>(`/videos/${encodeURIComponent(trimmedId)}`);
}

export async function createAndPollExperimentalVideo(
  input: CreateExperimentalVideoInput,
  options?: ExperimentalVideoPollOptions,
): Promise<ExperimentalVideoJob> {
  const intervalMs = options?.intervalMs ?? EXPERIMENTAL_OPENAI_VIDEO_CONFIG.pollIntervalMs;
  const timeoutMs = options?.timeoutMs ?? EXPERIMENTAL_OPENAI_VIDEO_CONFIG.pollTimeoutMs;
  const deadline = Date.now() + timeoutMs;

  let video = await createExperimentalVideo(input);

  while (video.status === "queued" || video.status === "in_progress") {
    if (Date.now() >= deadline) {
      throw new ExperimentalVideoApiError(
        `Timed out waiting for video ${video.id} after ${timeoutMs}ms.`,
        504,
        { videoId: video.id, lastStatus: video.status },
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    video = await getExperimentalVideo(video.id);
  }

  return video;
}

export async function downloadExperimentalVideoContent(
  videoId: string,
  variant: ExperimentalVideoVariant = "video",
): Promise<Response> {
  const trimmedId = videoId.trim();
  if (!trimmedId) {
    throw new ExperimentalVideoApiError("videoId is required.", 400);
  }

  ensureExperimentalVideoEnabled();

  const response = await fetch(
    `${EXPERIMENTAL_OPENAI_VIDEO_CONFIG.baseUrl}/videos/${encodeURIComponent(trimmedId)}/content?variant=${encodeURIComponent(variant)}`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {
      details = await response.text().catch(() => null);
    }

    throw new ExperimentalVideoApiError(
      `OpenAI video content download failed with status ${response.status}.`,
      response.status,
      details,
    );
  }

  return response;
}
