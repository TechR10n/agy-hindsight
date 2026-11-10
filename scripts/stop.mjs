#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HindsightClient } from "./lib/client.mjs";
import { ConfigError, resolveConfig, resolveStateDir } from "./lib/config.mjs";
import { buildRetainStamp } from "./lib/stamp.mjs";
import {
  detectSurface,
  formatTurnsForRetain,
  readAntigravityTranscript,
  sha256Hex,
} from "./lib/transcript.mjs";

function readStdinText() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function readCursor(cursorFile) {
  try {
    if (!fs.existsSync(cursorFile)) return {};
    return JSON.parse(fs.readFileSync(cursorFile, "utf8")) || {};
  } catch {
    return {};
  }
}

function writeCursor(cursorFile, data) {
  try {
    fs.mkdirSync(path.dirname(cursorFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(cursorFile, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // Non-fatal if state directory is read-only
  }
}

function deterministicUuid(seed) {
  const hex = sha256Hex(seed);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export async function runStopHook({
  rawStdin,
  env = process.env,
  fetchImpl,
} = {}) {
  const inputText = rawStdin !== undefined ? rawStdin : readStdinText();
  let event = {};
  if (inputText && inputText.trim()) {
    try {
      event = JSON.parse(inputText);
    } catch {
      return { exitCode: 0, stdout: { decision: "allow" } };
    }
  }

  const workspaceCwd =
    (Array.isArray(event.workspacePaths) && event.workspacePaths[0]) ||
    event.cwd ||
    process.cwd();

  let cfg;
  try {
    cfg = resolveConfig({ env, cwd: workspaceCwd });
  } catch (err) {
    if (err instanceof ConfigError) {
      return { exitCode: 1, stderr: `[agy-hindsight] ${err.message}` };
    }
    throw err;
  }

  if (cfg.disabled) {
    return { exitCode: 0, stdout: { decision: "allow" } };
  }

  const turns = event.transcriptPath
    ? readAntigravityTranscript(event.transcriptPath)
    : [];

  if (turns.length === 0) {
    return { exitCode: 0, stdout: { decision: "allow" } };
  }

  const formattedContent = formatTurnsForRetain(turns);
  if (!formattedContent.trim()) {
    return { exitCode: 0, stdout: { decision: "allow" } };
  }

  const surface = detectSurface(event, env);
  const conversationId = String(
    event.conversationId || crypto.randomUUID()
  );
  const documentId = `antigravity:${surface}:${conversationId}`;

  const stamp = buildRetainStamp({
    hostName: cfg.hostName,
    surface,
    conversationId,
    workspace: workspaceCwd,
    extraTags: cfg.retainTags,
    extraMetadata: cfg.retainMetadata,
  });

  const contentHash = sha256Hex(
    JSON.stringify({
      bankId: cfg.bankId,
      documentId,
      tags: stamp.tags,
      metadata: stamp.metadata,
      content: formattedContent,
    })
  );

  const stateDir = resolveStateDir(env);
  const cursorFile = path.join(
    stateDir,
    `retain-${sha256Hex(`${cfg.bankId}:${documentId}`).slice(0, 24)}.json`
  );
  const prevCursor = readCursor(cursorFile);
  if (prevCursor.contentHash === contentHash) {
    return { exitCode: 0, stdout: { decision: "allow" } };
  }

  const client = new HindsightClient({
    apiUrl: cfg.apiUrl,
    bankId: cfg.bankId,
    apiToken: cfg.apiToken,
    createBank: cfg.createBank,
    manageBankConfig: cfg.manageBankConfig,
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  const firstTimestamp = turns[0]?.timestamp || new Date().toISOString();
  const item = {
    content: formattedContent,
    context: `Antigravity (${surface}) coding session`,
    timestamp: firstTimestamp,
    document_id: documentId,
    tags: stamp.tags,
    metadata: stamp.metadata,
    update_mode: "replace",
  };

  try {
    try {
      await client.retain({
        items: [item],
        async: false,
        timeoutMs: 65000,
      });
    } catch (syncErr) {
      const isTimeout =
        syncErr &&
        (syncErr.name === "TimeoutError" || syncErr.name === "AbortError");
      if (!isTimeout) throw syncErr;

      await client.retain({
        items: [item],
        async: true,
        operationId: deterministicUuid(`${documentId}:${contentHash}`),
        timeoutMs: 10000,
      });
    }

    writeCursor(cursorFile, {
      contentHash,
      documentId,
      bankId: cfg.bankId,
      surface,
      hostTag: stamp.hostTag,
      turns: turns.length,
      retainedAt: new Date().toISOString(),
    });
  } catch (err) {
    process.stderr.write(
      `[agy-hindsight] Stop retain failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return { exitCode: 1, stderr: undefined };
  }

  return { exitCode: 0, stdout: { decision: "allow" } };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  runStopHook()
    .then(({ exitCode, stdout, stderr }) => {
      if (stderr) process.stderr.write(`${stderr}\n`);
      if (stdout !== undefined) process.stdout.write(`${JSON.stringify(stdout)}\n`);
      process.exit(exitCode);
    })
    .catch((err) => {
      process.stderr.write(
        `[agy-hindsight] Unexpected Stop hook error: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}

