# Contributing to agy-hindsight

Thank you for helping improve `agy-hindsight`! Community contributions — bug reports, documentation refinements, skill improvements, and code pull requests — are very welcome.

## Core Design Principles

Every change to `agy-hindsight` must preserve five invariants:

1. **Product boundary (memory only):** `agy-hindsight` integrates exclusively with Hindsight's REST API (`/version`, `/v1/default/banks/...`). Do not add OpenTelemetry (OTLP) trace exporters, proxy configuration, or unrelated observability features to this repository.
2. **Zero external npm dependencies:** All lifecycle hooks (`scripts/pre-invocation.mjs`, `scripts/stop.mjs`), the stdio MCP server (`scripts/mcp-server.mjs`), and configuration helpers run on built-in Node.js 20+ modules (`node:fs`, `node:path`, `node:os`, `fetch`, `node:readline`, `node:http`, `node:assert`). Do not add a `node_modules` dependency tree.
3. **Safe defaults for strangers:** Never hard-code a server hostname, bank ID, private file path, or API token. Missing required settings (`HINDSIGHT_API_URL`, `HINDSIGHT_BANK_ID`) must fail clearly rather than falling back to a default host or bank.
4. **Shared-bank safety by default:** Never create per-repository banks (`createBank: false` unless explicitly opted in) and never rewrite bank missions or settings (`manageBankConfig: false`).
5. **Host provenance & fail-open hooks:** Retain payloads must stamp `host:<name>` and `metadata.host = "<name>"` while stripping reserved `harness:` and `source:` tag prefixes. Lifecycle hooks (`PreInvocation`, `Stop`) must read JSON from `stdin`, write valid JSON to `stdout`, and fail open (`{}`) so an unreachable memory server never blocks a coding turn.

## Local Development & Verification

1. **Clone and branch:**
   ```bash
   git clone https://github.com/TechR10n/agy-hindsight.git
   cd agy-hindsight
   git checkout -b feat/your-change
   ```

2. **Run the offline self-test suite (Node.js 20+):**
   ```bash
   node ./scripts/self-test.mjs
   ```
   All suites must pass without network access or a live Hindsight server. If you add new behavior or fix a bug, add a regression test in `scripts/self-test.mjs`.

3. **Run strict Antigravity plugin validation:**
   ```bash
   agy plugin validate --strict .
   ```
   Validation must exit `0` with **0 errors and 0 warnings**. Check key constraints:
   - `hooks.json` commands use relative paths (`node ./scripts/...`) and never reference `${PLUGIN_ROOT}`.
   - `mcp_config.json` keeps `variables` inside `mcpServers.hindsight.variables` and never redeclares `PLUGIN_ROOT` or `PLUGIN_DATA` in `env`.
   - `plugin.json` keeps `suggestedPrompts` concise (at most 3 items).

4. **Test locally in Antigravity IDE and CLI:**
   ```bash
   agy plugin install .
   agy plugin list
   node ~/.gemini/config/plugins/agy-hindsight/scripts/configure.mjs --status
   ```
   Use a **disposable test bank** (for example `agy-hindsight-dev-test`) rather than a shared production bank when testing `Stop` retention and `PreInvocation` recall.

## Privacy & Secret Hygiene Before Opening a PR

Before committing, verify that no personal hostnames, internal domains, private paths, bank names, or tokens appear in your diff:

```bash
git diff --cached
```

Never paste bearer tokens, API keys, or unredacted private transcripts into commits, Issues, or Pull Requests. See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Ways to Participate

- **GitHub Discussions:** Share how you structure memory banks, `SKILL.md` workflows, or multi-machine `host:<name>` setups, and ask usage questions.
- **GitHub Issues:** Report reproducible bugs across Antigravity IDE, Antigravity CLI (`agy`), or Antigravity App, or propose focused enhancements.
- **Pull Requests:** Open a PR against `main` with passing CI (`self-test.mjs`) and `agy plugin validate --strict .` output noted in the PR template.
