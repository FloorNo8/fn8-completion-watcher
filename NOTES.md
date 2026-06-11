# NOTES

- A Node.js (TypeScript, ESM) **MCP server** that surfaces filesystem-backed vendor "completion" envelopes — `MSG-*-result.md` files under an fn8-roles checkout's `state/mailbox/outbox-*/` directories — to a Claude Code / MCP client.
- Exposes five MCP tools over those mailboxes: `recent_completions`, `pending_dispatches`, `read_result_envelope`, `acknowledge_completion`, and `completion_stats`, with acknowledgement state persisted to `state/acknowledged.json` and metadata-only auditing to `state/audit.jsonl`.
- Pairs with the `completion-injector.mjs` UserPromptSubmit hook in fn8-roles, which imports the watcher's built `recent-completions.js` to inject a markdown block of unacknowledged completions into prompts; it deliberately avoids the Anthropic SDK and bounds scans (≤100 files, 24h window).
