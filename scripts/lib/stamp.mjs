import os from "node:os";
import path from "node:path";

export const RESERVED_TAG_PREFIX = /^(harness|source):/i;

/**
 * Normalize the host identifier used for `host:<name>` retain tags and `metadata.host`.
 * Defaults to the local short hostname when unset or blank.
 */
export function normalizeHostName(rawHost, fallbackHostname = os.hostname()) {
  const trimmed = typeof rawHost === "string" ? rawHost.trim() : "";
  const effective =
    trimmed && trimmed.toLowerCase() !== "auto" && trimmed !== "-" ? trimmed : "";

  if (effective) {
    if (RESERVED_TAG_PREFIX.test(effective)) {
      throw new Error(
        `Invalid HINDSIGHT_HOST_TAG "${effective}": tags starting with "harness:" or "source:" are reserved and discarded by Hindsight coding-agent conventions. Provide a host name (stored as host:<name>).`
      );
    }
    const withoutPrefix = effective.replace(/^host:/i, "").trim();
    const cleaned = withoutPrefix.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!cleaned) {
      throw new Error(
        `Invalid HINDSIGHT_HOST_TAG "${effective}": host identifier resolved to an empty value.`
      );
    }
    return cleaned;
  }

  const rawFallback = typeof fallbackHostname === "string" ? fallbackHostname.trim() : "";
  const shortHost = rawFallback.split(".")[0] || "unknown-host";
  const cleanedFallback = shortHost
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleanedFallback || "unknown-host";
}

/**
 * Filter user-supplied tags, discarding blanks and reserved `harness:` / `source:` prefixes.
 */
export function sanitizeExtraTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim();
    if (!tag) continue;
    if (RESERVED_TAG_PREFIX.test(tag)) continue;
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

/**
 * Build the Hindsight retain tags and string-valued metadata object.
 * Always includes tag `host:<hostName>` and `metadata.host = <hostName>`.
 */
export function buildRetainStamp({
  hostName,
  surface,
  conversationId,
  workspace,
  extraTags = [],
  extraMetadata = {},
}) {
  const normalizedHost = normalizeHostName(hostName);
  const hostTag = `host:${normalizedHost}`;
  const filteredExtra = sanitizeExtraTags(extraTags).filter((t) => t !== hostTag);
  const tags = [hostTag, ...filteredExtra];

  const metadata = {};
  if (extraMetadata && typeof extraMetadata === "object") {
    for (const [key, value] of Object.entries(extraMetadata)) {
      if (value === undefined || value === null) continue;
      const cleanKey = String(key).trim();
      if (!cleanKey) continue;
      metadata[cleanKey] = String(value);
    }
  }

  if (surface) {
    metadata.surface = String(surface);
  }
  if (conversationId) {
    metadata.conversation_id = String(conversationId);
  }
  if (workspace && typeof workspace === "string") {
    const base = path.basename(workspace.replace(/[\\/]+$/, ""));
    if (base) {
      metadata.project = base;
    }
  }

  // Always enforce metadata.host to match the resolved host:<name> tag.
  metadata.host = normalizedHost;

  return { hostName: normalizedHost, hostTag, tags, metadata };
}

