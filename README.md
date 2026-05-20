# fn8-completion-watcher

MCP server for **filesystem-backed** vendor mailbox completions (`state/mailbox/outbox-*/MSG-*-result.md`) in the fn8-roles bridge. Pairs with the `completion-injector.mjs` UserPromptSubmit hook in fn8-roles (`fn8-ups-orchestrator` pipeline).

## Requirements

- Node.js 22+
- Built `dist/` (`npm run build`)
- `fn8-roles` checkout with `state/mailbox/` populated

## Environment

| Variable | Purpose |
|----------|---------|
| `FN8_ROLES_ROOT` | Path to fn8-roles (default: `~/My Space/Fn8 - Projects/fn8-roles`) |
| `FN8_COMPLETION_WATCHER_HOME` | This package root for `state/acknowledged.json` (default: `~/fn8-completion-watcher`) |

## Install (Claude Code plugin)

Symlink or copy this directory to `~/.claude/plugins/local/fn8-completion-watcher/`, run `npm install && npm run build`, then register the MCP server in Claude Code settings with command:

```bash
node /path/to/fn8-completion-watcher/dist/index.js
```

## Tools

| Tool | Description |
|------|-------------|
| `recent_completions` | Recent `MSG-*-result.md` (mtime within `hours`, scan bound 24h, max 100 files) |
| `pending_dispatches` | `outbox-claude-code` dispatches in last 24h missing target result + optional PID |
| `read_result_envelope` | Parse one result file by `msgId` |
| `acknowledge_completion` | Mark `msgId` acknowledged in `state/acknowledged.json` |

## Hook (fn8-roles)

`scripts/hooks/completion-injector.mjs` dynamically imports `~/fn8-completion-watcher/dist/tools/recent-completions.js` and injects a markdown block for unacknowledged rows. Registered in `fn8-ups-orchestrator.mjs` immediately after `ledger-context-injector`.

## Anti-patterns (enforced)

- No Anthropic SDK / API in this package
- Does not write `state/live-inbox.jsonl`
- Scans at most **100** result files, **24h** mtime window
- Audit log (`state/audit.jsonl`) stores metadata only (no result bodies)

## License

UNLICENSED — Floor No 8 SRL proprietary (match fn8-roles).
