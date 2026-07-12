import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "./supabase";
import type { Artifact, CampaignDraft, CampaignEvent, Proposal, Question, RunRecord, RunSummary, WalletState } from "./types";

type Store = {
  runs: RunRecord[];
  runsById: Map<string, RunRecord>;
};

const globalForAudit = globalThis as typeof globalThis & { __adswarmAuditStore?: Store };

function getStore(): Store {
  if (!globalForAudit.__adswarmAuditStore) {
    globalForAudit.__adswarmAuditStore = {
      runs: [],
      runsById: new Map(),
    };
  }
  return globalForAudit.__adswarmAuditStore;
}

type PersistedRunRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: RunRecord["status"];
  mode: CampaignDraft["mode"];
  draft: CampaignDraft;
  questions: Question[];
  proposals: Proposal[];
  wallets: WalletState[];
  events: CampaignEvent[];
  artifacts: Artifact[];
  summary: RunSummary | null;
  note: string | null;
};

type PersistedArtifactRow = {
  id: string;
  run_id: string;
  type: Artifact["type"];
  producer: Artifact["producer"];
  version: number;
  title: string;
  storage_url: string | null;
  preview_text: string | null;
  status: Artifact["status"];
  metadata: Record<string, unknown>;
  artifact: Artifact;
};

function serializeRun(run: RunRecord): PersistedRunRow {
  return {
    id: run.id,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
    status: run.status,
    mode: run.mode,
    draft: run.draft,
    questions: run.questions,
    proposals: run.proposals,
    wallets: run.wallets,
    events: run.events,
    artifacts: run.artifacts,
    summary: run.summary ?? null,
    note: run.note ?? null,
  };
}

function deserializeRun(row: PersistedRunRow): RunRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    mode: row.mode,
    draft: row.draft,
    questions: row.questions,
    proposals: row.proposals,
    wallets: row.wallets,
    events: row.events,
    artifacts: row.artifacts,
    summary: row.summary ?? undefined,
    note: row.note ?? undefined,
  };
}

async function persistRun(run: RunRecord): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    await supabase.from("campaign_runs").upsert(serializeRun(run), { onConflict: "id" });
  } catch {
    // Keep the in-memory demo path alive even if Supabase is not migrated yet.
  }
}

function serializeArtifact(runId: string, artifact: Artifact): PersistedArtifactRow {
  return {
    id: artifact.id,
    run_id: runId,
    type: artifact.type,
    producer: artifact.producer,
    version: artifact.version,
    title: artifact.title,
    storage_url: artifact.storageUrl ?? null,
    preview_text: artifact.previewText ?? null,
    status: artifact.status,
    metadata: artifact.metadata ?? {},
    artifact,
  };
}

async function persistArtifact(runId: string, artifact: Artifact): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    await supabase.from("campaign_artifacts").upsert(serializeArtifact(runId, artifact), { onConflict: "id" });
  } catch {
    // Artifact persistence is additive; keep the live demo path alive if the migration is not applied yet.
  }
}

async function loadArtifacts(runId: string): Promise<Artifact[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("campaign_artifacts")
      .select("*")
      .eq("run_id", runId)
      .order("updated_at", { ascending: false })
      .returns<PersistedArtifactRow[]>();
    return data?.map((row) => row.artifact) ?? [];
  } catch {
    return [];
  }
}

function syncRunToMemory(run: RunRecord): RunRecord {
  const store = getStore();
  const existingIndex = store.runs.findIndex((entry) => entry.id === run.id);
  if (existingIndex >= 0) {
    store.runs[existingIndex] = run;
  } else {
    store.runs.unshift(run);
  }
  store.runsById.set(run.id, run);
  return run;
}

function mergeArtifact(artifacts: Artifact[], artifact: Artifact): Artifact[] {
  const index = artifacts.findIndex((entry) => entry.id === artifact.id);
  if (index >= 0) {
    return artifacts.map((entry, entryIndex) => (entryIndex === index ? artifact : entry));
  }
  return [artifact, ...artifacts];
}

export function createRunRecord(payload: {
  mode: CampaignDraft["mode"];
  draft: CampaignDraft;
  questions: Question[];
  proposals: Proposal[];
  wallets: WalletState[];
  artifacts: Artifact[];
}): RunRecord {
  const run: RunRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
    mode: payload.mode,
    draft: payload.draft,
    questions: payload.questions,
    proposals: payload.proposals,
    wallets: payload.wallets,
    events: [],
    artifacts: payload.artifacts,
  };
  syncRunToMemory(run);
  void persistRun(run);
  for (const artifact of run.artifacts) {
    void persistArtifact(run.id, artifact);
  }
  return run;
}

export function getRun(runId: string): RunRecord | null {
  return getStore().runsById.get(runId) ?? null;
}

export async function getRunAsync(runId: string): Promise<RunRecord | null> {
  const cached = getRun(runId);
  if (cached) return cached;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data } = await supabase.from("campaign_runs").select("*").eq("id", runId).maybeSingle<PersistedRunRow>();
    if (!data) return null;
    const run = deserializeRun(data);
    const artifacts = await loadArtifacts(runId);
    if (artifacts.length) {
      run.artifacts = artifacts;
    }
    return syncRunToMemory(run);
  } catch {
    return null;
  }
}

export function appendEvent(runId: string, event: CampaignEvent): RunRecord | null {
  const run = getRun(runId);
  if (!run) return null;
  run.events.push(event);
  if (event.type === "artifact") {
    run.artifacts = mergeArtifact(run.artifacts, event.artifact);
    void persistArtifact(runId, event.artifact);
  }
  run.updatedAt = new Date().toISOString();
  void persistRun(run);
  return run;
}

export function updateRun(runId: string, patch: Partial<Pick<RunRecord, "status" | "summary" | "note" | "artifacts" | "proposals" | "wallets">>): RunRecord | null {
  const run = getRun(runId);
  if (!run) return null;
  Object.assign(run, patch, { updatedAt: new Date().toISOString() });
  void persistRun(run);
  return run;
}

export function completeRun(runId: string, summary: RunSummary, artifacts?: Artifact[]): RunRecord | null {
  return updateRun(runId, {
    status: "completed",
    summary,
    artifacts: artifacts ?? getRun(runId)?.artifacts ?? [],
  });
}

export function failRun(runId: string, note: string): RunRecord | null {
  return updateRun(runId, {
    status: "failed",
    note,
  });
}

export function getRecentRuns(limit = 12): RunRecord[] {
  return getStore().runs.slice(0, limit);
}

export async function getRecentRunsAsync(limit = 12): Promise<RunRecord[]> {
  const cached = getRecentRuns(limit);
  if (cached.length > 0) return cached;
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("campaign_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<PersistedRunRow[]>();
    if (!data?.length) return [];
    return data.map((row) => syncRunToMemory(deserializeRun(row)));
  } catch {
    return [];
  }
}

export function getLatestRun(): RunRecord | null {
  return getStore().runs[0] ?? null;
}

export function listRunEvents(runId: string): CampaignEvent[] {
  return getRun(runId)?.events ?? [];
}

export async function listRunEventsAsync(runId: string): Promise<CampaignEvent[]> {
  const run = await getRunAsync(runId);
  return run?.events ?? [];
}
