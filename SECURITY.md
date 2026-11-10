# Security Policy

## Credential & Privacy Guarantees

`agy-hindsight` is designed for self-hosted Hindsight deployments:

- **No hard-coded endpoints, banks, or credentials**: Missing `HINDSIGHT_API_URL` or `HINDSIGHT_BANK_ID` fails closed with a `ConfigError`.
- **Safe secret ingestion**: Optional bearer tokens can be piped via `stdin` (`--api-token-stdin`) from secret managers such as Infisical (`infisical secrets get ... --plain`) or 1Password (`op read ...`) so tokens never appear in shell history or process argument lists, and are stored at `${PLUGIN_DATA}/config.json` with `0600` file permissions (`0700` directory permissions).
- **Redacted diagnostics**: `hindsight_status` and `configure.mjs --status` report only `apiTokenConfigured: true|false` and never output raw token values.
- **Workspace path privacy**: Retained metadata records only the workspace directory basename (`metadata.project`), never full local filesystem paths.
- **Shared-bank protection**: `createBank`, `manageBankConfig`, and `dynamicBankId` default to `false` so existing shared banks are never created, overwritten, or reconfigured unless explicitly opted in.

## Reporting a Vulnerability

Please report security issues privately via [GitHub Security Advisories](https://github.com/TechR10n/agy-hindsight/security/advisories/new) rather than opening a public issue containing exploit details or sensitive configuration data.
