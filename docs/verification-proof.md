# Verification Proof (`agy-hindsight` v0.1.0)

Recorded on `2026-11-10` against Antigravity CLI `1.5.5`, Antigravity IDE `1.107.0`, and self-hosted Hindsight API `0.10.1` using a dedicated disposable bank (`agy-hindsight-proof-20261110`) and explicit host tag `dev-workstation` (`host:dev-workstation`).

> **Sanitization note:** Local home paths (`<home>`) and the LAN Hindsight endpoint (`<hindsight-base-url>`) are redacted below so no private hostname, local user path, or secret appears in the repository.

---

## 0. Pre-Publish Marketplace Re-Check

Checked both the live Marketplace search index and the interactive `/plugin` -> `Discover (74)` catalog for `hindsight` and `vectorize` on `2026-11-10`:

```text
$ agy -> /plugin -> Discover (74) -> search "hindsight"
No marketplace plugins match your search.
```

---

## 1. Strict Plugin Validation & Unit/Component Self-Tests

```text
$ node ./scripts/self-test.mjs
All agy-hindsight self-tests passed (9 suites).

$ agy plugin validate --strict .
Validating agy-hindsight (plugin.json)

  · mcp_config.json: server "hindsight" declares variables, so the plugin is off until the user fills them in; if config.json turns it on first, the server starts with the placeholders as written

  skills 1 · agents 0 · rules 1 · hooks 1 · mcpServers 1 · sidecars 0

✔ Validation passed

$ agy plugin validate --strict --json .
{
  "dir": ".",
  "manifest": "plugin.json",
  "name": "agy-hindsight",
  "agentPluginsSpec": false,
  "components": {
    "agents": 0,
    "hooks": 1,
    "mcpServers": 1,
    "rules": 1,
    "sidecars": 0,
    "skills": 1
  },
  "findings": [
    {
      "severity": "note",
      "file": "mcp_config.json",
      "message": "server \"hindsight\" declares variables, so the plugin is off until the user fills them in; if config.json turns it on first, the server starts with the placeholders as written"
    }
  ]
}
```

Exit code: `0` (`0` errors, `0` warnings).

---

## 2. Local Directory Install & `agy plugin list`

Installed from the local checkout, configured `HINDSIGHT_API_URL=<hindsight-base-url>` and `HINDSIGHT_BANK_ID=agy-hindsight-proof-20261110` via `/plugin`, and set `--host-tag dev-workstation`:

```text
$ agy plugin install <local-path>/agy-hindsight
  [ok]    agy-hindsight
          ✔ skills      : 1 installed (hindsight-memory)
          ✔ rules       : 1 installed (AGENTS)
          ✔ mcpServers  : 1 installed (hindsight)
          ✔ hooks       : 1 installed (hindsight-memory)
          Installed to <home>/.gemini/config/plugins/agy-hindsight

$ node <home>/.gemini/config/plugins/agy-hindsight/scripts/configure.mjs --status
{
  "disabled": false,
  "apiUrl": "<hindsight-base-url>",
  "bankId": "agy-hindsight-proof-20261110",
  "apiTokenConfigured": false,
  "hostName": "dev-workstation",
  "hostTag": "host:dev-workstation",
  "createBank": false,
  "manageBankConfig": false,
  "dynamicBankId": false,
  "retainTags": [],
  "pluginConfigPath": "<home>/.gemini/antigravity/plugin_data/agy-hindsight/config.json"
}

$ agy plugin list
Installed plugins:
- agy-hindsight (enabled, 0.1.0)
    Source:     antigravity
    Components: 1 skill, 1 rule, 1 MCP server, 1 hook
...
```

---

## 3 & 4. Separate Retains from Antigravity IDE and Antigravity CLI

1. **New Antigravity IDE conversation (`5d944253-a51f-4d10-b573-6170055c5253`)**:
   Completed a new IDE session recording marker `IDE-PROOF-7391`, triggering the `Stop` hook on `antigravity-ide`.
2. **New Antigravity CLI command (`d48c7479-154b-4cbe-8577-add8fc7ebf5a`)**:
   Executed `agy --print` recording marker `CLI-PROOF-4826`, triggering a separate `Stop` hook retain on `antigravity-cli` with the same `host:dev-workstation` tag.

Verified via `GET <hindsight-base-url>/v1/default/banks/agy-hindsight-proof-20261110/documents`:

```json
{
  "items": [
    {
      "id": "antigravity:antigravity-cli:d48c7479-154b-4cbe-8577-add8fc7ebf5a",
      "bank_id": "agy-hindsight-proof-20261110",
      "content_hash": "e3690e068070bb55e86ca82a1213a9db9cfeeb1e294a1c8fd3ee4dcbafc38b4f",
      "created_at": "2026-11-10T22:57:05.858319+00:00",
      "updated_at": "2026-11-10T22:57:26.256254+00:00",
      "text_length": 422,
      "memory_unit_count": 1,
      "retain_params": {
        "context": "Antigravity (antigravity-cli) coding session",
        "metadata": {
          "host": "dev-workstation",
          "project": "agy-hindsight",
          "surface": "antigravity-cli",
          "conversation_id": "d48c7479-154b-4cbe-8577-add8fc7ebf5a"
        },
        "event_date": "2026-11-10T22:54:21+00:00"
      },
      "document_metadata": {
        "host": "dev-workstation",
        "project": "agy-hindsight",
        "surface": "antigravity-cli",
        "conversation_id": "d48c7479-154b-4cbe-8577-add8fc7ebf5a"
      },
      "tags": [
        "host:dev-workstation"
      ]
    },
    {
      "id": "antigravity:antigravity-ide:5d944253-a51f-4d10-b573-6170055c5253",
      "bank_id": "agy-hindsight-proof-20261110",
      "content_hash": "9a918932e97ba63acc8f83955d7a42e41617afa28f482dd195ce32c8810532de",
      "created_at": "2026-11-10T22:44:53.173666+00:00",
      "updated_at": "2026-11-10T22:45:11.081081+00:00",
      "text_length": 166,
      "memory_unit_count": 1,
      "retain_params": {
        "context": "Antigravity (antigravity-ide) coding session",
        "metadata": {
          "host": "dev-workstation",
          "project": "agy-hindsight",
          "surface": "antigravity-ide",
          "conversation_id": "5d944253-a51f-4d10-b573-6170055c5253"
        },
        "event_date": "2026-11-10T22:41:32+00:00"
      },
      "document_metadata": {
        "host": "dev-workstation",
        "project": "agy-hindsight",
        "surface": "antigravity-ide",
        "conversation_id": "5d944253-a51f-4d10-b573-6170055c5253"
      },
      "tags": [
        "host:dev-workstation"
      ]
    }
  ],
  "total": 2,
  "limit": 100,
  "offset": 0
}
```

---

## 5. Live Recall Proof (Both `PreInvocation` `injectSteps` and `agy-hindsight_hindsight` MCP)

### A. Automatic `PreInvocation` Hook Recall in Antigravity CLI (`agy --print`)

Ran a fresh `agy --print` invocation with tool calls disallowed so the model could answer solely from the hook-injected `<hindsight_memory>` context:

```text
$ agy --print "Do not call any tools. Answer strictly from your injected <hindsight_memory> block: which Antigravity surfaces retained sessions into the disposable Hindsight bank on host dev-workstation, and what CLI proof marker code was recorded?"
Based on the injected `<hindsight_memory>` block (`agy-hindsight-proof-20261110`):

- **Antigravity surfaces that retained sessions on `dev-workstation`:** **Antigravity CLI** and **Antigravity IDE**
- **CLI proof marker code recorded:** `CLI-PROOF-4826`
```

### B. `agy-hindsight_hindsight` MCP Tool (`hindsight_recall`) in Antigravity IDE

Called `agy-hindsight_hindsight` -> `hindsight_recall` (`tags: ["host:dev-workstation"]`, `tags_match: "all_strict"`) inside Antigravity IDE:

```json
{
  "bank_id": "agy-hindsight-proof-20261110",
  "results": [
    {
      "id": "3847b97b-23ab-4550-9097-41ca5e17a844",
      "text": "Antigravity CLI retained the session into the disposable Hindsight bank on host dev-workstation, verified by marker CLI-PROOF-4826. | When: 2026-11-10 | Involving: user | Verification of session retention in the Hindsight bank.",
      "type": "world",
      "document_id": "antigravity:antigravity-cli:d48c7479-154b-4cbe-8577-add8fc7ebf5a",
      "metadata": {
        "host": "dev-workstation",
        "project": "agy-hindsight",
        "surface": "antigravity-cli",
        "conversation_id": "d48c7479-154b-4cbe-8577-add8fc7ebf5a"
      },
      "tags": [
        "host:dev-workstation"
      ]
    },
    {
      "id": "1d3f4912-2cc9-4b12-89dd-8b66c742a11c",
      "text": "Antigravity IDE retained the session into the disposable Hindsight bank on host dev-workstation | When: 2026-11-10",
      "type": "experience",
      "document_id": "antigravity:antigravity-ide:5d944253-a51f-4d10-b573-6170055c5253",
      "metadata": {
        "host": "dev-workstation",
        "project": "agy-hindsight",
        "surface": "antigravity-ide",
        "conversation_id": "5d944253-a51f-4d10-b573-6170055c5253"
      },
      "tags": [
        "host:dev-workstation"
      ]
    }
  ]
}
```
