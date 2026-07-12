import { NextResponse } from "next/server";
import {
  createAndPollExperimentalVideo,
  createExperimentalVideo,
  downloadExperimentalVideoContent,
  ExperimentalVideoApiError,
  type ExperimentalVideoVariant,
  getExperimentalVideo,
} from "@/lib/openai-video-experimental";

export const runtime = "nodejs";

interface ExperimentalVideoRequestBody {
  prompt?: string;
  model?: string;
  size?: string;
  seconds?: string | number;
  poll?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

function normalizeSeconds(seconds: string | number | undefined): string | undefined {
  if (seconds === undefined || seconds === null) {
    return undefined;
  }

  const value = String(seconds).trim();
  return value || undefined;
}

function toErrorResponse(error: unknown) {
  if (error instanceof ExperimentalVideoApiError) {
    return NextResponse.json(
      {
        ok: false,
        experimental: true,
        error: error.message,
        details: error.details,
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      experimental: true,
      error: error instanceof Error ? error.message : "Unknown experimental video error.",
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExperimentalVideoRequestBody;
    if (!body?.prompt?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          experimental: true,
          error: "prompt is required.",
        },
        { status: 400 },
      );
    }

    const input = {
      prompt: body.prompt,
      model: body.model,
      size: body.size,
      seconds: normalizeSeconds(body.seconds),
    };

    const video = body.poll
      ? await createAndPollExperimentalVideo(input, {
          intervalMs: body.pollIntervalMs,
          timeoutMs: body.timeoutMs,
        })
      : await createExperimentalVideo(input);

    return NextResponse.json({
      ok: true,
      experimental: true,
      video,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId")?.trim();
  const download = searchParams.get("download") === "1";
  const variant = (searchParams.get("variant") ?? "video") as ExperimentalVideoVariant;

  if (!videoId) {
    return NextResponse.json(
      {
        ok: false,
        experimental: true,
        error: "videoId is required.",
      },
      { status: 400 },
    );
  }

  try {
    if (!download) {
      const video = await getExperimentalVideo(videoId);
      return NextResponse.json({
        ok: true,
        experimental: true,
        video,
      });
    }

    const upstream = await downloadExperimentalVideoContent(videoId, variant);
    const headers = new Headers();
    const contentType = upstream.headers.get("Content-Type");
    const contentLength = upstream.headers.get("Content-Length");
    const contentDisposition = upstream.headers.get("Content-Disposition");
    const cacheControl = upstream.headers.get("Cache-Control");
    const etag = upstream.headers.get("ETag");
    const lastModified = upstream.headers.get("Last-Modified");

    if (contentType) headers.set("Content-Type", contentType);
    if (contentLength) headers.set("Content-Length", contentLength);
    if (cacheControl) headers.set("Cache-Control", cacheControl);
    if (etag) headers.set("ETag", etag);
    if (lastModified) headers.set("Last-Modified", lastModified);
    headers.set(
      "Content-Disposition",
      contentDisposition ?? `inline; filename="${videoId}.${variant === "video" ? "mp4" : variant === "thumbnail" ? "webp" : "jpg"}"`,
    );

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
