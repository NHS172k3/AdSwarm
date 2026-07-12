import { runCampaignWithStore } from "@/lib/campaign";
import type { CampaignDraft, Proposal, Question, WalletState } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    draft: CampaignDraft;
    questions: Question[];
    proposals: Proposal[];
    wallets: WalletState[];
    accepted: Record<string, boolean>;
  };

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  const send = async (event: unknown) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  runCampaignWithStore({
    draft: body.draft,
    questions: body.questions,
    proposals: body.proposals,
    wallets: body.wallets,
    accepted: body.accepted,
    onEvent: send,
  })
    .catch(async (error: unknown) => {
      await send({ type: "error", message: error instanceof Error ? error.message : "Unknown error" });
    })
    .finally(async () => {
      await writer.close();
    });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
