#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  ConfigError,
  readPluginDataConfig,
  redactedConfigSummary,
  resolveConfig,
  writePluginDataConfig,
} from "./lib/config.mjs";

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/configure.mjs [options]",
      "",
      "Manage optional per-plugin settings stored in ${PLUGIN_DATA}/config.json (mode 0600).",
      "Required settings (HINDSIGHT_API_URL and HINDSIGHT_BANK_ID) can also be configured",
      "interactively in Antigravity via `/plugin` -> Hindsight -> Configure MCP servers.",
      "",
      "Options:",
      "  --status                Print safe, secret-free resolved configuration summary",
      "  --api-url <url>         Set Hindsight base URL (e.g. http://localhost:8888)",
      "  --bank-id <id>          Set Hindsight memory bank ID",
      "  --host-tag <name>       Set host tag name (stored as host:<name> and metadata.host)",
      "  --clear-host-tag        Reset host tag to default from local hostname",
      "  --api-token-stdin       Read optional bearer token from stdin (avoids shell history)",
      "  --clear-token           Clear stored bearer token (for unauthenticated servers)",
      "  --create-bank <bool>    Explicitly opt in/out of creating missing banks (default: false)",
      "  --disable               Pause agy-hindsight hooks and MCP calls",
      "  --enable                Resume agy-hindsight hooks and MCP calls",
      "  --help                  Show this help message",
      "",
    ].join("\n")
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const updates = {};
  let mutated = false;
  let showStatus = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--status") {
      showStatus = true;
    } else if (arg === "--api-url") {
      const val = args[++i];
      if (!val) throw new Error("--api-url requires a value.");
      updates.apiUrl = val.trim();
      mutated = true;
    } else if (arg === "--bank-id") {
      const val = args[++i];
      if (!val) throw new Error("--bank-id requires a value.");
      updates.bankId = val.trim();
      mutated = true;
    } else if (arg === "--host-tag") {
      const val = args[++i];
      if (!val) throw new Error("--host-tag requires a value.");
      updates.hostTag = val.trim();
      mutated = true;
    } else if (arg === "--clear-host-tag") {
      updates.hostTag = undefined;
      mutated = true;
    } else if (arg === "--api-token-stdin") {
      const token = fs.readFileSync(0, "utf8").trim();
      updates.apiToken = token;
      mutated = true;
    } else if (arg === "--clear-token") {
      updates.apiToken = "";
      mutated = true;
    } else if (arg === "--create-bank") {
      const val = args[++i];
      if (!val) throw new Error("--create-bank requires true or false.");
      updates.createBank = val.trim().toLowerCase() === "true";
      mutated = true;
    } else if (arg === "--disable") {
      updates.disabled = true;
      mutated = true;
    } else if (arg === "--enable") {
      updates.disabled = false;
      mutated = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (mutated) {
    const { path: savedPath } = writePluginDataConfig(updates);
    process.stdout.write(`Saved plugin settings to ${savedPath}\n`);
  }

  if (showStatus || mutated) {
    try {
      const cfg = resolveConfig();
      process.stdout.write(`${JSON.stringify(redactedConfigSummary(cfg), null, 2)}\n`);
    } catch (err) {
      if (err instanceof ConfigError) {
        const { path: cfgPath } = readPluginDataConfig();
        if (mutated && !showStatus) {
          process.stdout.write(
            `Note: ${err.message} (plugin config path: ${cfgPath})\n`
          );
          return;
        }
        process.stderr.write(`${err.message} (plugin config path: ${cfgPath})\n`);
        process.exit(1);
      }
      throw err;
    }
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  try {
    main();
  } catch (err) {
    process.stderr.write(
      `[agy-hindsight] ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
}
