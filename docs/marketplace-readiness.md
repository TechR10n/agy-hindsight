# Antigravity Marketplace & Public Release Readiness

This document tracks everything required to publish `agy-hindsight` to its public GitHub mirror (`https://github.com/TechR10n/agy-hindsight`) and submit it to the Antigravity Plugin Marketplace.

---

## 1. Official Pre-Publish Checklist (`build-plugins` & `marketplace`)

| Requirement | Status | Verification Detail |
| :--- | :--- | :--- |
| **`agy plugin validate --strict .`** | PASS | Exits `0` with `0` errors and `0` warnings. |
| **Manifest `name`** | PASS | `agy-hindsight` matches `^[a-z0-9]+(-[a-z0-9]+)*$`. |
| **Manifest `displayName`** | PASS | `Hindsight` (does not lead with `Antigravity`, `Gemini`, `Claude`, or `Cursor`). |
| **Logo asset (`assets/logo.svg`)** | PASS | `128x128` (`1:1` square `viewBox="0 0 128 128"`), transparent outer canvas, crisp contrast on light and dark UI surfaces. |
| **`suggestedPrompts`** | PASS | 3 concise starter prompts (within Antigravity's 3-prompt display cap). |
| **Repository, Homepage & License** | PASS | `https://github.com/TechR10n/agy-hindsight`, [LICENSE](../LICENSE) (`MIT`), [SECURITY.md](../SECURITY.md), and [CHANGELOG.md](../CHANGELOG.md). |
| **Hooks contract (`hooks.json`)** | PASS | Named group `hindsight-memory`; flat handler arrays on `PreInvocation` and `Stop`; relative `node ./scripts/...` commands; zero `${PLUGIN_ROOT}` usage; fail-open on error. |
| **MCP contract (`mcp_config.json`)** | PASS | Server key `hindsight` (runtime namespace `agy-hindsight_hindsight`); `variables` nested inside `mcpServers.hindsight.variables` with documentation `link`; `PLUGIN_ROOT` and `PLUGIN_DATA` not redeclared in `env`. |
| **Safe community defaults** | PASS | No hard-coded server URL, bank ID, hostname, local path, or token. Missing required settings fail with actionable setup instructions. |
| **Shared-bank safety** | PASS | `createBank: false`, `manageBankConfig: false`, and `dynamicBankId: false` by default. |
| **Supply-chain footprint** | PASS | Zero third-party npm dependencies; runs strictly on Node.js 20+ standard library modules (`node:fs`, `node:path`, `node:os`, `node:crypto`, `node:readline`, global `fetch`). |

---

## 2. GitHub Mirror & Release Tagging (`TechR10n/agy-hindsight`)

Antigravity supports direct installation from public GitHub URLs (`agy plugin install https://github.com/TechR10n/agy-hindsight`) as well as local directories (`agy plugin install ./agy-hindsight`).

Before enabling or pushing the mirror to `https://github.com/TechR10n/agy-hindsight`:

1. **Re-run validation, unit tests, and tree hygiene checks**:
   ```bash
   agy plugin validate --strict .
   node ./scripts/self-test.mjs
   git status
   ```
2. **Verify commit author emails** on the branch being mirrored (`git log --format='%h %an <%ae> %s'`) so no internal-only email addresses are unintentionally published.
3. **Merge to `main` and tag `v0.1.0`**:
   ```bash
   git checkout main
   git merge --ff-only feat/agy-hindsight
   git tag -a v0.1.0 -m "agy-hindsight v0.1.0"
   git push origin main --tags
   ```
4. **Verify public GitHub mirror sync and test clean remote install**:
   ```bash
   agy plugin install https://github.com/TechR10n/agy-hindsight
   agy plugin list
   ```

---

## 3. Antigravity Marketplace Submission Package

### A. Pre-Submission Duplicate Check

Re-run the Discover catalog check immediately prior to submitting the partner form to confirm an official upstream plugin has not already launched:

1. Run `agy` and open `/plugin` -> `Discover` (or search the Plugins panel in Antigravity IDE).
2. Search for `hindsight` and `vectorize`.
3. If an official integration has since been published, defer to the upstream listing rather than submitting a duplicate.

### B. Partner Intake Form Reference (`https://forms.gle/2EX5RFYPoJe1UgxR9`)

Use the following verified metadata when completing the Antigravity Marketplace intake form:

| Field | Prepared Value |
| :--- | :--- |
| **Plugin Name (`id`)** | `agy-hindsight` |
| **Display Name** | `Hindsight` |
| **Version** | `0.1.0` |
| **Short Description** | Self-hosted Hindsight long-term memory for coding sessions with automatic recall, turn retention, and MCP memory tools. |
| **Public Repository URL** | `https://github.com/TechR10n/agy-hindsight` |
| **Author / Maintainer** | `TechR10n` (`https://github.com/TechR10n`) |
| **License** | `MIT` |
| **Suggested Shelf / Category** | `Developer Tools` |
| **Supported Surfaces** | Antigravity IDE, Antigravity CLI (`agy`), Antigravity App |
| **Bundled Components** | 1 Skill (`hindsight-memory`), 1 Rule (`AGENTS.md`), 1 Hook group (`PreInvocation`, `Stop`), 1 MCP server (`hindsight` -> `agy-hindsight_hindsight`) |
| **Required User Variables** | `HINDSIGHT_API_URL` (self-hosted Hindsight base URL), `HINDSIGHT_BANK_ID` (target memory bank ID) |
| **Optional Credentials** | `HINDSIGHT_API_TOKEN` (optional Bearer token for authenticated self-hosted deployments; stored locally with `0600` permissions via `configure.mjs --api-token-stdin`) |
| **Runtime Prerequisites** | Node.js 20+ (`node` on `PATH`) and a user-operated Hindsight API instance (`v0.10+`) |
| **Data & Network Posture** | Connects solely to the user-configured `HINDSIGHT_API_URL`; zero telemetry, zero third-party network calls, zero OTLP/model-proxy interception. |

### C. Brand & Partner Coordination Note

Google's Marketplace curation reviews brand ownership for third-party product names. While `agy plugin install https://github.com/TechR10n/agy-hindsight` works immediately for community distribution once mirrored to GitHub, coordinate with [Vectorize](https://github.com/vectorize-io/hindsight) (or note community-maintained status in the submission form) when requesting inclusion in the in-app Discover catalog under the **Hindsight** display name.
