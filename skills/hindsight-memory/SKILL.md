---
name: hindsight-memory
description: Recalls, retains, reflects on, and troubleshoots self-hosted Hindsight long-term memory using the agy-hindsight plugin across Antigravity IDE and CLI. Use when searching past coding decisions, saving durable findings, correcting stale memories, or checking Hindsight plugin configuration and bank status.
---

# Hindsight Memory Skill

Use this skill when interacting with self-hosted Hindsight memory through the `agy-hindsight` plugin (`agy-hindsight_hindsight` MCP server and lifecycle hooks).

## Available MCP Tools (`agy-hindsight_hindsight`)

When `agy-hindsight` is enabled, call its tools under the `agy-hindsight_hindsight` MCP server namespace:

1. **`hindsight_recall`** — Fast fact and observation retrieval.
   - Required: `query` (natural-language question or keywords).
   - Optional: `budget` (`"low"` | `"mid"` | `"high"`), `max_tokens`, `types` (`["world", "experience", "observation"]`), `tags` (e.g. `["host:workstation"]`), `tags_match`, `prefer_observations`.
2. **`hindsight_retain`** — Immediate retention of durable facts, decisions, or notes.
   - Required: `content` (self-contained, secret-free statement).
   - Optional: `context`, `document_id`, `tags`, `metadata`, `async` (defaults to `false` so the retained fact is immediately searchable).
   - Automatically stamps `host:<name>` in `tags` and `metadata.host = "<name>"`. Reserved `harness:` and `source:` tag prefixes are ignored.
3. **`hindsight_reflect`** — Grounded multi-memory synthesis for "why / how did this evolve?" questions.
   - Required: `query`.
   - Optional: `context`, `budget`, `max_tokens`, `tags`, `tags_match`, `include_based_on`.
4. **`hindsight_status`** — Secret-free diagnostic check returning resolved `apiUrl`, `bankId`, `hostTag`, `apiTokenConfigured` boolean, Hindsight `/version`, and bank stats.

## Workflows

### 1. Mid-Session Recall

Automatic `PreInvocation` recall runs once per distinct user prompt. Perform an explicit `hindsight_recall` call when:
- You pivot to a new module, service, or bug mid-turn.
- The user asks *"what did we decide about..."* or *"check Hindsight for..."*.
- You want to filter specifically by host (`tags: ["host:<name>"]`, `tags_match: "all_strict"`).

Always verify recalled technical details against the current files in the workspace before acting on them.

### 2. Retaining High-Signal Findings or User Memories

Although the `Stop` hook retains completed session transcripts automatically, call `hindsight_retain` directly when:
- The user explicitly asks to remember a preference, convention, or fact.
- You uncover a non-obvious bug root cause or architectural constraint that should stand out cleanly as its own memory item.
- A recalled memory turns out to be outdated and needs an explicit correction note.

Keep retained notes concise, concrete, and **completely free of secrets** (never include tokens, passwords, private keys, or sensitive personal/financial records).

### 3. Troubleshooting Configuration

`agy-hindsight` requires two user settings with no built-in defaults:
- `HINDSIGHT_API_URL` — Base URL of your self-hosted Hindsight API server (for example, `http://localhost:8888`).
- `HINDSIGHT_BANK_ID` — Target Hindsight memory bank ID (for example, `my-memory-bank`).

Optional settings:
- `HINDSIGHT_API_TOKEN` — Optional bearer token (empty is allowed for unauthenticated self-hosted servers).
- `HINDSIGHT_HOST_TAG` — Optional host identifier; defaults to the local short hostname and is stored as `host:<name>` and `metadata.host`.

If `hindsight_status` reports a missing setting:
1. Direct the user to configure `HINDSIGHT_API_URL` and `HINDSIGHT_BANK_ID` in Antigravity (`/plugin` -> **Hindsight** -> **Configure MCP servers**) or via environment variables.
2. For optional settings (`--host-tag`, `--api-token-stdin`, `--clear-token`, or opt-in `--create-bank true`), use the bundled helper script (`~/.gemini/config/plugins/agy-hindsight/scripts/configure.mjs`) without passing secret values on the command line.

