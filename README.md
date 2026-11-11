# agy-hindsight

Self-hosted [Hindsight](https://github.com/vectorize-io/hindsight) long-term memory plugin for **Antigravity IDE**, **Antigravity CLI (`agy`)**, and **Antigravity App**.

`agy-hindsight` wraps Hindsight's v1 REST API in the native Antigravity plugin contract:

- **Automatic turn recall (`PreInvocation` hook)**: Queries your configured Hindsight bank before a user turn and injects matching memories via `injectSteps` (`<hindsight_memory>` system context).
- **Automatic turn retention (`Stop` hook)**: Retains completed user/assistant turns from both **Antigravity IDE** (`antigravity-ide`) and **Antigravity CLI** (`antigravity-cli`) into your configured bank, stamped with `host:<name>` and `metadata.host`.
- **Bundled MCP server (`agy-hindsight_hindsight`)**: Exposes `hindsight_recall`, `hindsight_retain`, `hindsight_reflect`, and `hindsight_status` over stdio with zero external npm dependencies.
- **Bundled rule & skill**: Guides the agent to verify recalled memories against live workspace code, correct stale facts, and never retain secrets.

## Product Boundary & Safety Guarantees

- **Memory only**: Hindsight is a long-term agent memory service. This plugin communicates exclusively with Hindsight's REST API (`/version`, `/v1/default/banks/...`). It is **not** an OpenTelemetry (OTLP) trace receiver, does **not** replace tracing tools, and does **not** proxy or intercept Antigravity model traffic.
- **No hard-coded defaults**: Neither a server URL nor a bank ID is defaulted. Missing required configuration fails clearly rather than falling back to someone else's host or bank.
- **Shared-bank safe by default**: `agy-hindsight` **never** creates per-repository banks (`dynamicBankId: false`, `createBank: false`) and **never** rewrites bank missions or configuration (`manageBankConfig: false`) unless you explicitly opt in.
- **Host provenance stamping**: Every retained document and MCP `hindsight_retain` item is tagged with `host:<name>` and `metadata.host = "<name>"` (defaulting `<name>` from the local short hostname when unset). Reserved `harness:` and `source:` tag prefixes are filtered out so Hindsight coding-agent conventions never discard host attribution.

## Requirements

- **Node.js** 20+ (`node` on `PATH`)
- **Antigravity** CLI (`agy` 1.5+) and/or Antigravity IDE
- A reachable **Hindsight** API endpoint — either self-hosted (`http://localhost:8888` or your LAN URL) or [Hindsight Cloud](https://hindsight.vectorize.io) (`https://api.hindsight.vectorize.io`) — and an existing memory bank ID

### New to Hindsight? Set Up a Backend First

`agy-hindsight` connects to a Hindsight memory server. If you do not have one yet, pick either option before enabling the plugin:

1. **Self-hosted (Docker / local, no account required):** Follow the [Hindsight Quickstart](https://github.com/vectorize-io/hindsight) to start a local Hindsight API + Control Plane (`http://localhost:8888`) and create a memory bank in the web UI.
2. **Managed Hindsight Cloud:** Sign up at [ui.hindsight.vectorize.io](https://ui.hindsight.vectorize.io), create a memory bank and API key, use `https://api.hindsight.vectorize.io` as `HINDSIGHT_API_URL`, and pipe your API key via `--api-token-stdin` (see [Optional Settings](#optional-settings)).

## Installation

Install from GitHub or directly from a local checkout:

```bash
# Install from GitHub
agy plugin install https://github.com/TechR10n/agy-hindsight

# Or install from a local directory
agy plugin install /path/to/agy-hindsight

# Verify installation
agy plugin list
```

## Configuration

### Required Settings

When enabling **Hindsight** in Antigravity (`/plugin` in the CLI or the Plugins view in Antigravity IDE), Antigravity prompts for two required MCP variables:

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `HINDSIGHT_API_URL` | Yes | *(none)* | Base URL of your self-hosted Hindsight server (e.g. `http://localhost:8888`). |
| `HINDSIGHT_BANK_ID` | Yes | *(none)* | Hindsight bank ID used for recall and retain (e.g. `my-memory-bank`). |

Both the MCP server and the lifecycle hooks (`PreInvocation` and `Stop`) automatically resolve these configured variables. You can also override them per shell session via environment variables (`HINDSIGHT_API_URL`, `HINDSIGHT_BANK_ID`).

### Optional Settings

| Setting / Env Var | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `HINDSIGHT_API_TOKEN` | No | `""` (empty) | Optional Bearer token for authenticated Hindsight servers. Leave empty when your self-hosted server does not require authentication. |
| `HINDSIGHT_HOST_TAG` | No | Local short hostname | Computer identifier stored as retain tag `host:<name>` and `metadata.host = "<name>"`. Must not start with `harness:` or `source:`. |
| `HINDSIGHT_CREATE_BANK` | No | `false` | Opt-in flag (`true`/`false`) to issue `PUT /v1/default/banks/<bank>` with an empty `{}` body before retaining if a bank does not exist yet. Never modifies existing bank configuration. |
| `AGY_HINDSIGHT_DISABLED` | No | `false` | Set to `1` or `true` to temporarily disable hooks and MCP calls for a single command. |

To persist optional settings (such as a custom host tag or a bearer token read safely from stdin without touching shell history) in `${PLUGIN_DATA}/config.json` (`0600` permissions):

```bash
# Inspect current secret-free configuration status
node ~/.gemini/config/plugins/agy-hindsight/scripts/configure.mjs --status

# Override the host tag (stored as host:workstation and metadata.host="workstation")
node ~/.gemini/config/plugins/agy-hindsight/scripts/configure.mjs --host-tag workstation

# Store an optional API token from stdin (for example, via Infisical or 1Password CLI)
infisical secrets get HINDSIGHT_CP_ACCESS_KEY --env prod --plain \
  | node ~/.gemini/config/plugins/agy-hindsight/scripts/configure.mjs --api-token-stdin

# Clear a stored API token for unauthenticated servers
node ~/.gemini/config/plugins/agy-hindsight/scripts/configure.mjs --clear-token
```

## MCP Tools

At runtime, Antigravity namespaces the bundled server as `agy-hindsight_hindsight`:

- `hindsight_recall` — Search the configured bank for facts and observations matching `query`.
- `hindsight_retain` — Retain a fact or summary immediately (`async: false` by default) with `host:<name>` tag and `metadata.host`.
- `hindsight_reflect` — Synthesize a grounded answer across stored memories in the bank.
- `hindsight_status` — Check server version, bank statistics, active surface (`antigravity-ide` / `antigravity-cli`), and redacted configuration status.

## Validation & Development Tests

Run the strict Antigravity plugin validator and the zero-network self-test suite from the repository root:

```bash
agy plugin validate --strict .
node ./scripts/self-test.mjs
```

See [docs/verification-proof.md](docs/verification-proof.md) for end-to-end validation output across `agy plugin validate --strict`, `agy plugin install`, Antigravity IDE retention, Antigravity CLI retention, and live memory recall, and [docs/marketplace-readiness.md](docs/marketplace-readiness.md) for public GitHub mirror and Antigravity Marketplace publishing steps.

## Contributing & Security

- Contributor guide & PR checklist: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security & secret handling policy: [SECURITY.md](SECURITY.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE).
