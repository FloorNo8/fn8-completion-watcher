#!/usr/bin/env node
/**
 * completion-injector.mjs — UserPromptSubmit: unacknowledged vendor completions [CODE]
 *
 * Loads recent_completions from fn8-completion-watcher dist (dynamic import).
 * Injects a markdown block into hookSpecificOutput.additionalContext when
 * there are rows with acknowledged: false.
 *
 * Env:
 *   FN8_ROLES_ROOT      — fn8-roles bridge root
 *   FN8_COMPLETION_WATCHER_HOME — package with dist/ (default: ~/fn8-completion-watcher or repo root if hooks/ layout)
 *
 * Fail-soft: any error → { continue: true }; never block prompts.
 *
 * Rule anchors: Rule 28 (no message-body logging — metadata-only audit trail in watcher).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function resolveFn8Root() {
  if (process.env.FN8_ROLES_ROOT) return process.env.FN8_ROLES_ROOT;
  const fromHook = resolve(__dirname, '..', '..');
  if (existsSync(join(fromHook, 'state', 'mailbox'))) return fromHook;
  return join(homedir(), 'My Space', 'Fn8 - Projects', 'fn8-roles');
}

function resolveWatcherHome() {
  if (process.env.FN8_COMPLETION_WATCHER_HOME) return process.env.FN8_COMPLETION_WATCHER_HOME;
  const sibling = resolve(__dirname, '..');
  if (existsSync(join(sibling, 'dist', 'tools', 'recent-completions.js'))) return sibling;
  return join(homedir(), 'fn8-completion-watcher');
}

const MODULE_URL = pathToFileURL(join(resolveWatcherHome(), 'dist/tools/recent-completions.js')).href;

function emitContinue() {
  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
  process.exit(0);
}

function emitContext(text) {
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: text,
    },
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
}

async function main() {
  try {
    readFileSync(0, 'utf8'); // drain stdin (orchestrator pipes envelope)
  } catch {
    /* empty */
  }

  process.env.FN8_ROLES_ROOT = resolveFn8Root();
  process.env.FN8_COMPLETION_WATCHER_HOME = resolveWatcherHome();

  let recentCompletions;
  try {
    const mod = await import(MODULE_URL);
    recentCompletions = mod.recentCompletions;
    if (typeof recentCompletions !== 'function') {
      emitContinue();
      return;
    }
  } catch {
    emitContinue();
    return;
  }

  let rows;
  try {
    rows = await recentCompletions({ hours: 2 });
  } catch {
    emitContinue();
    return;
  }

  const pending = Array.isArray(rows) ? rows.filter((r) => r && !r.acknowledged) : [];
  if (pending.length === 0) {
    emitContinue();
    return;
  }

  const lines = pending.map((r) => {
    const sha = r.commit_sha ? `\`${r.commit_sha}\`` : "`(no sha parsed)`";
    const subj = r.dispatch_subject ? r.dispatch_subject.slice(0, 120) : "";
    const relPath = String(r.result_envelope_path || "").replace(/^.*\/fn8-roles\//, "");
    return `- **${r.msgId}** (${r.vendor}) completed ${r.completed_at} → commit ${sha} — ${subj} · result \`${relPath || r.result_envelope_path}\``;
  });

  const body = [
    '## Pending vendor completions (last 2h, unacknowledged)',
    '',
    'The following vendor subprocesses finished work that may need your verification or audit:',
    '',
    ...lines,
    '',
    'When you finish your current response, audit these commits empirically (read the actual code; do not trust the result envelope summary). After auditing, call the `acknowledge_completion` MCP tool so you do not see this notification again.',
  ].join('\n');

  emitContext(body);
}

main().catch(() => emitContinue());
