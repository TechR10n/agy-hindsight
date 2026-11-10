# Changelog

All notable changes to `agy-hindsight` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-10

### Added

- Antigravity v1 plugin manifest (`plugin.json`), bundled 1:1 square SVG icon (`assets/logo.svg`), rule (`rules/AGENTS.md`), and skill (`skills/hindsight-memory/SKILL.md`).
- `PreInvocation` lifecycle hook (`scripts/pre-invocation.mjs`) injecting recalled `<hindsight_memory>` context via `injectSteps` with per-conversation prompt deduplication.
- `Stop` lifecycle hook (`scripts/stop.mjs`) retaining cleaned session transcripts across both **Antigravity IDE** (`antigravity-ide`) and **Antigravity CLI** (`antigravity-cli`) with synchronous retention and automatic async fallback on timeout.
- Zero-dependency stdio MCP server (`scripts/mcp-server.mjs`) exposing `hindsight_recall`, `hindsight_retain`, `hindsight_reflect`, and `hindsight_status` under `agy-hindsight_hindsight`.
- Host provenance stamping (`host:<name>` tag and `metadata.host`) defaulting from the local short hostname while discarding reserved `harness:` and `source:` tag prefixes.
- Configuration CLI (`scripts/configure.mjs`) supporting secret-free `--api-token-stdin` token persistence (compatible with Infisical CLI and 1Password CLI), cross-surface `plugin_data` sync between IDE and CLI, and opt-in `--create-bank` control.
- Zero-network self-test suite (`scripts/self-test.mjs`).
