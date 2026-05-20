/**
 * fn8-completion-watcher — shared types [CODE]
 */

export type RecentCompletion = {
  msgId: string;
  vendor: string;
  dispatch_subject: string;
  dispatch_linear_id?: string;
  completed_at: string;
  status: "ok" | "failed";
  duration_ms?: number;
  commit_sha?: string;
  files_changed?: number;
  result_envelope_path: string;
  result_envelope_size: number;
  acknowledged: boolean;
};

export type PendingDispatch = {
  msgId: string;
  vendor: string;
  dispatched_at: string;
  age_minutes: number;
  workflow_id?: string;
  subprocess_pid?: number;
  subprocess_alive: boolean;
  has_result_envelope: boolean;
};

export type ReadResultEnvelopeResult = {
  msgId: string;
  frontmatter: Record<string, unknown>;
  body_markdown: string;
  parsed_commits: string[];
  parsed_files_changed?: number;
  parsed_acceptance_status?: "pass" | "fail" | "partial";
  summary_first_500_chars: string;
};

export type AuditEntry = {
  ts: string;
  tool: string;
  ok: boolean;
  meta?: Record<string, unknown>;
};
