/**
 * fn8-completion-watcher — MCP server registration [CODE]
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { appendAudit } from "./governance/audit.js";
import { acknowledgeCompletion } from "./tools/acknowledge-completion.js";
import { completionStats } from "./tools/completion-stats.js";
import { pendingDispatches } from "./tools/pending-dispatches.js";
import { readResultEnvelope } from "./tools/read-result-envelope.js";
import { recentCompletions } from "./tools/recent-completions.js";

async function audit(tool: string, ok: boolean, meta?: Record<string, unknown>): Promise<void> {
  try {
    await appendAudit({
      ts: new Date().toISOString(),
      tool,
      ok,
      meta,
    });
  } catch {
    /* never block tools */
  }
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "recent_completions",
    {
      title: "Recent vendor result envelopes",
      description:
        "Lists recent MSG-*-result.md files under fn8-roles state/mailbox/outbox-* (mtime " +
        "within hours window, scan bound to last 24h, max 100 files). Includes ack state.",
      inputSchema: {
        hours: z.number().optional().describe("Look-back hours (default 1)"),
        vendor: z
          .string()
          .optional()
          .describe("Filter by vendor folder: cursor | pool | bob | codex | gemini | claude-code"),
        since_msg_id: z
          .string()
          .optional()
          .describe("Only completions after this msgId (ordinal compare MSG-NNN)"),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async (args) => {
      try {
        const rows = await recentCompletions({
          hours: args.hours,
          vendor: args.vendor,
          since_msg_id: args.since_msg_id,
        });
        await audit("recent_completions", true, { count: rows.length });
        return { content: [{ type: "text", text: JSON.stringify(rows) }] };
      } catch (err) {
        await audit("recent_completions", false, { error: String(err) });
        return {
          isError: true,
          content: [{ type: "text", text: `recent_completions_failed:${String(err)}` }],
        };
      }
    },
  );

  server.registerTool(
    "pending_dispatches",
    {
      title: "Pending claude-code dispatches",
      description:
        "Walks outbox-claude-code MSG-*-dispatch.md (mtime last 24h, max 100) where target " +
        "result envelope is missing; optional PID via ps aux for fn8-mailbox-{vendor}.",
      inputSchema: {
        vendor: z.string().optional().describe("Filter by target vendor"),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async (args) => {
      try {
        const rows = await pendingDispatches({ vendor: args.vendor });
        await audit("pending_dispatches", true, { count: rows.length });
        return { content: [{ type: "text", text: JSON.stringify(rows) }] };
      } catch (err) {
        await audit("pending_dispatches", false, { error: String(err) });
        return {
          isError: true,
          content: [{ type: "text", text: `pending_dispatches_failed:${String(err)}` }],
        };
      }
    },
  );

  server.registerTool(
    "read_result_envelope",
    {
      title: "Read a result envelope",
      description: "Loads MSG-*-result.md for msgId from any outbox-* directory; parses metadata.",
      inputSchema: {
        msgId: z.string().min(1).describe("Mailbox id e.g. MSG-596"),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    },
    async (args) => {
      try {
        const row = await readResultEnvelope({ msgId: args.msgId });
        await audit("read_result_envelope", Boolean(row), { msgId: args.msgId });
        if (!row) {
          return {
            isError: true,
            content: [{ type: "text", text: `not_found:${args.msgId}` }],
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(row) }] };
      } catch (err) {
        await audit("read_result_envelope", false, { error: String(err) });
        return {
          isError: true,
          content: [{ type: "text", text: `read_result_envelope_failed:${String(err)}` }],
        };
      }
    },
  );

  server.registerTool(
    "completion_stats",
    {
      title: "Completion watcher summary",
      description:
        "Aggregates pending dispatches, recent completions (24h), acknowledged count, and " +
        "the oldest pending dispatch age in minutes. Reuses recent_completions / " +
        "pending_dispatches / acknowledged.json data sources.",
      inputSchema: {},
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async () => {
      try {
        const stats = await completionStats();
        await audit("completion_stats", true, stats);
        return { content: [{ type: "text", text: JSON.stringify(stats) }] };
      } catch (err) {
        await audit("completion_stats", false, { error: String(err) });
        return {
          isError: true,
          content: [{ type: "text", text: `completion_stats_failed:${String(err)}` }],
        };
      }
    },
  );

  server.registerTool(
    "acknowledge_completion",
    {
      title: "Acknowledge completion notification",
      description: "Marks msgId as acknowledged in fn8-completion-watcher/state/acknowledged.json",
      inputSchema: {
        msgId: z.string().min(1).describe("Mailbox id e.g. MSG-596"),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
    },
    async (args) => {
      try {
        const result = await acknowledgeCompletion({ msgId: args.msgId });
        await audit("acknowledge_completion", result.ok, { msgId: args.msgId });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        await audit("acknowledge_completion", false, { error: String(err) });
        return {
          isError: true,
          content: [{ type: "text", text: `acknowledge_completion_failed:${String(err)}` }],
        };
      }
    },
  );
}
