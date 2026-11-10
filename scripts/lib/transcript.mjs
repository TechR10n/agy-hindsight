import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const INJECTED_TAG_RE =
  /<(hindsight_memory|hindsight_memories|hindsight_bank|relevant_memories|hindsight_pages|hindsight_page_refresh|hindsight_knowledge|hindsight_knowledge_refresh|hook_prompt|task-notification|system-reminder|user_feedback)\b[\s\S]*?<\/\1>/gi;

const METADATA_BLOCKS_RE =
  /<(ADDITIONAL_METADATA|USER_SETTINGS_CHANGE|SYSTEM_MESSAGE)\b[\s\S]*?<\/\1>/gi;

const USER_REQUEST_RE = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i;

export function stripInjectedMemory(text) {
  if (typeof text !== "string") return "";
  return text.replace(INJECTED_TAG_RE, "");
}

export function unwrapUserContent(text) {
  if (typeof text !== "string") return "";
  const stripped = stripInjectedMemory(text).replace(METADATA_BLOCKS_RE, "");
  const match = USER_REQUEST_RE.exec(stripped);
  return (match ? match[1] : stripped).trim();
}

export function expandTilde(filePath, homeDir = os.homedir()) {
  if (typeof filePath !== "string" || !filePath) return "";
  if (filePath === "~") return homeDir;
  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
    return path.join(homeDir, filePath.slice(2));
  }
  return filePath;
}

/**
 * Prefer `transcript_full.jsonl` when present beside `transcript.jsonl` so long turns
 * are not truncated before retention.
 */
export function resolveTranscriptFile(transcriptPath, homeDir = os.homedir()) {
  const expanded = expandTilde(transcriptPath, homeDir);
  if (!expanded) return "";
  if (expanded.endsWith("transcript.jsonl")) {
    const fullCandidate = path.join(path.dirname(expanded), "transcript_full.jsonl");
    if (fs.existsSync(fullCandidate)) return fullCandidate;
  }
  return expanded;
}

/**
 * Parse an Antigravity JSONL transcript (CLI, IDE, or App) into clean user/assistant turns.
 */
export function readAntigravityTranscript(transcriptPath, homeDir = os.homedir()) {
  const resolved = resolveTranscriptFile(transcriptPath, homeDir);
  if (!resolved || !fs.existsSync(resolved)) return [];

  let raw;
  try {
    raw = fs.readFileSync(resolved, "utf8");
  } catch {
    return [];
  }

  const turns = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!event || typeof event !== "object") continue;

    const rawType = event.type ?? event.role ?? event.message?.role;
    let role;
    if (rawType === "USER_INPUT" || rawType === "user") {
      // Skip synthetic system-injected user steps if marked as SYSTEM source
      if (event.source === "SYSTEM") continue;
      role = "user";
    } else if (
      rawType === "PLANNER_RESPONSE" ||
      rawType === "assistant" ||
      rawType === "model"
    ) {
      role = "assistant";
    } else {
      continue;
    }

    const rawContent =
      event.content ?? event.text ?? event.message?.content ?? event.message?.text;
    if (typeof rawContent !== "string") continue;

    const clean =
      role === "user"
        ? unwrapUserContent(rawContent)
        : stripInjectedMemory(rawContent).replace(METADATA_BLOCKS_RE, "").trim();

    if (!clean) continue;

    const timestamp =
      typeof event.created_at === "string"
        ? event.created_at
        : typeof event.timestamp === "string"
          ? event.timestamp
          : undefined;

    const prev = turns[turns.length - 1];
    if (prev && prev.role === role && prev.content === clean) {
      continue;
    }

    turns.push({
      role,
      content: clean,
      ...(timestamp ? { timestamp } : {}),
    });
  }

  return turns;
}

/**
 * Identify which Antigravity surface invoked the hook (`antigravity-ide`, `antigravity-cli`, `antigravity-app`).
 */
export function detectSurface(hookEvent = {}, env = process.env) {
  const explicit = env.AGY_HINDSIGHT_SURFACE?.trim();
  if (explicit) return explicit;

  const tPath = String(hookEvent.transcriptPath || hookEvent.artifactDirectoryPath || "");
  const normalizedPath = tPath.replace(/\\/g, "/");

  if (normalizedPath.includes("/antigravity-cli/")) {
    return "antigravity-cli";
  }
  if (normalizedPath.includes("/antigravity-ide/")) {
    return "antigravity-ide";
  }
  if (
    env.ANTIGRAVITY_AUTH_SUCCESS_APP === "antigravity-ide" ||
    env.ANTIGRAVITY_VSCODE_HOST === "1" ||
    env.__CFBundleIdentifier === "com.google.antigravity-ide" ||
    (typeof env.VSCODE_IPC_HOOK === "string" && env.VSCODE_IPC_HOOK.includes("Antigravity IDE"))
  ) {
    return "antigravity-ide";
  }
  if (
    env.ANTIGRAVITY_AUTH_SUCCESS_APP === "antigravity" ||
    env.ANTIGRAVITY_AUTH_SUCCESS_APP === "antigravity-app" ||
    env.__CFBundleIdentifier === "com.google.antigravity"
  ) {
    return "antigravity-app";
  }
  if (
    normalizedPath.includes("/antigravity/") ||
    Boolean(hookEvent.transcriptPath || hookEvent.conversationId || env.PLUGIN_ROOT)
  ) {
    return "antigravity-cli";
  }
  return "antigravity";
}

export function formatTurnsForRetain(turns) {
  return turns
    .map((t) => {
      const speaker = t.role === "user" ? "User" : "Assistant";
      const prefix = t.timestamp ? `[${t.timestamp}] ${speaker}:` : `${speaker}:`;
      return `${prefix}\n${t.content}`;
    })
    .join("\n\n");
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input), "utf8").digest("hex");
}
