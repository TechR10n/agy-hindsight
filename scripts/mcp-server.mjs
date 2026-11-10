#!/usr/bin/env node
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { HindsightClient } from "./lib/client.mjs";
import {
  ConfigError,
  redactedConfigSummary,
  resolveConfig,
} from "./lib/config.mjs";
import { buildRetainStamp } from "./lib/stamp.mjs";
import { detectSurface } from "./lib/transcript.mjs";

const SERVER_NAME = "hindsight";
const SERVER_VERSION = "0.1.0";
const SUPPORTED_PROTOCOLS = new Set([
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);
const DEFAULT_PROTOCOL = "2025-03-26";

export const TOOL_DEFINITIONS = [
  {
    name: "hindsight_recall",
    description:
      "Search the configured self-hosted Hindsight memory bank for relevant facts, prior decisions, and observations matching a query.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Natural-language or keyword query to search in Hindsight memory.",
        },
        budget: {
          type: "string",
          enum: ["low", "mid", "high"],
          description: "Retrieval budget controlling recall depth (default: mid).",
        },
        max_tokens: {
          type: "integer",
          minimum: 128,
          maximum: 16384,
          description: "Maximum token budget for returned recall items (default: 2048).",
        },
        types: {
          type: "array",
          items: {
            type: "string",
            enum: ["world", "experience", "observation"],
          },
          description: "Optional fact types to filter (defaults to all types).",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional visibility/provenance tags to filter on (for example, [\"host:workstation\"]).",
        },
        tags_match: {
          type: "string",
          enum: ["any", "all", "any_strict", "all_strict", "exact"],
          description: "How `tags` are matched (default: any).",
        },
        prefer_observations: {
          type: "boolean",
          description:
            "When true, deduplicate raw facts already consolidated into returned observations.",
        },
      },
    },
  },
  {
    name: "hindsight_retain",
    description:
      "Store durable facts, architectural decisions, or notes into the configured self-hosted Hindsight memory bank, stamped with `host:<name>` and `metadata.host`.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["content"],
      properties: {
        content: {
          type: "string",
          description: "Fact, note, or structured summary to retain in Hindsight.",
        },
        context: {
          type: "string",
          description: "Optional topic or context label describing the retained item.",
        },
        document_id: {
          type: "string",
          description:
            "Optional stable document ID. Items sharing a document_id update/group together.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional extra tags (`host:<name>` is added automatically; reserved `harness:` and `source:` prefixes are ignored).",
        },
        metadata: {
          type: "object",
          additionalProperties: { type: "string" },
          description:
            "Optional string key-value metadata (`host` is set automatically to match `host:<name>`).",
        },
        async: {
          type: "boolean",
          description:
            "When false (default), wait for extraction to finish so the memory is immediately recallable.",
        },
      },
    },
  },
  {
    name: "hindsight_reflect",
    description:
      "Synthesize a grounded markdown answer across memories in the configured Hindsight bank for deeper rationale or historical questions.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Question to synthesize from stored Hindsight memories.",
        },
        context: {
          type: "string",
          description: "Optional background context for the reflection.",
        },
        budget: {
          type: "string",
          enum: ["low", "mid", "high"],
          description: "Reflection budget (default: mid).",
        },
        max_tokens: {
          type: "integer",
          minimum: 256,
          maximum: 16384,
          description: "Maximum response tokens (default: 4096).",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tag filter.",
        },
        tags_match: {
          type: "string",
          enum: ["any", "all", "any_strict", "all_strict", "exact"],
          description: "Tag matching mode.",
        },
        include_based_on: {
          type: "boolean",
          description: "Include supporting source facts in `based_on` (default: true).",
        },
      },
    },
  },
  {
    name: "hindsight_status",
    description:
      "Return safe, secret-free Hindsight configuration and connectivity status (server version, configured bank, resolved `host:<name>` tag). Never returns API tokens.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
];

function toolSuccess(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function toolError(err) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
  };
}

export async function dispatchToolCall(name, args = {}, { env = process.env, fetchImpl } = {}) {
  if (name === "hindsight_status") {
    let cfg;
    try {
      cfg = resolveConfig({ env });
    } catch (err) {
      if (err instanceof ConfigError) {
        return toolError(err);
      }
      throw err;
    }

    if (cfg.disabled) {
      return toolSuccess({
        ok: true,
        disabled: true,
        config: redactedConfigSummary(cfg),
      });
    }

    const client = new HindsightClient({
      apiUrl: cfg.apiUrl,
      bankId: cfg.bankId,
      apiToken: cfg.apiToken,
      createBank: false,
      manageBankConfig: false,
      ...(fetchImpl ? { fetchImpl } : {}),
    });

    try {
      const version = await client.getVersion({ timeoutMs: 8000 });
      let bankStats = null;
      try {
        bankStats = await client.getBankStats({ timeoutMs: 8000 });
      } catch {
        bankStats = null;
      }
      return toolSuccess({
        ok: true,
        surface: detectSurface({}, env),
        config: redactedConfigSummary(cfg),
        server: version,
        bankStats,
      });
    } catch (err) {
      return toolError(err);
    }
  }

  let cfg;
  try {
    cfg = resolveConfig({ env });
  } catch (err) {
    return toolError(err);
  }

  if (cfg.disabled) {
    return toolError(
      new Error("agy-hindsight is currently disabled via configuration (AGY_HINDSIGHT_DISABLED).")
    );
  }

  const client = new HindsightClient({
    apiUrl: cfg.apiUrl,
    bankId: cfg.bankId,
    apiToken: cfg.apiToken,
    createBank: cfg.createBank,
    manageBankConfig: cfg.manageBankConfig,
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  try {
    if (name === "hindsight_recall") {
      const result = await client.recall({
        query: args.query,
        budget: args.budget || "mid",
        maxTokens: args.max_tokens || 2048,
        types: args.types,
        tags: args.tags,
        tagsMatch: args.tags_match,
        preferObservations: Boolean(args.prefer_observations),
      });
      return toolSuccess({
        bank_id: cfg.bankId,
        count: Array.isArray(result?.results) ? result.results.length : 0,
        results: result?.results || [],
        ...(result?.entities ? { entities: result.entities } : {}),
      });
    }

    if (name === "hindsight_retain") {
      if (typeof args.content !== "string" || !args.content.trim()) {
        throw new Error("hindsight_retain requires a non-empty `content` string.");
      }
      const surface = detectSurface({}, env);
      const stamp = buildRetainStamp({
        hostName: cfg.hostName,
        surface,
        workspace: process.cwd(),
        extraTags: [
          ...cfg.retainTags,
          ...(Array.isArray(args.tags) ? args.tags : []),
        ],
        extraMetadata: {
          ...cfg.retainMetadata,
          ...(args.metadata && typeof args.metadata === "object" ? args.metadata : {}),
        },
      });

      const item = {
        content: args.content.trim(),
        ...(args.context ? { context: String(args.context) } : {}),
        ...(args.document_id ? { document_id: String(args.document_id) } : {}),
        timestamp: new Date().toISOString(),
        tags: stamp.tags,
        metadata: stamp.metadata,
      };

      const resp = await client.retain({
        items: [item],
        async: Boolean(args.async),
        timeoutMs: 45000,
      });

      return toolSuccess({
        success: Boolean(resp?.success),
        bank_id: resp?.bank_id || cfg.bankId,
        items_count: resp?.items_count ?? 1,
        async: Boolean(resp?.async),
        ...(resp?.operation_id ? { operation_id: resp.operation_id } : {}),
        tags: stamp.tags,
        metadata: stamp.metadata,
      });
    }

    if (name === "hindsight_reflect") {
      const resp = await client.reflect({
        query: args.query,
        context: args.context,
        budget: args.budget || "mid",
        maxTokens: args.max_tokens || 4096,
        tags: args.tags,
        tagsMatch: args.tags_match,
        includeBasedOn: args.include_based_on !== false,
      });
      return toolSuccess({
        bank_id: cfg.bankId,
        text: resp?.text || "",
        ...(resp?.based_on ? { based_on: resp.based_on } : {}),
      });
    }

    return toolError(new Error(`Unknown tool "${name}".`));
  } catch (err) {
    return toolError(err);
  }
}

export async function handleJsonRpcMessage(message, ctx = {}) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
    return null;
  }

  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const { id, method, params } = message;

  // Notifications carry no `id` and expect no response.
  if (!hasId) {
    return null;
  }

  try {
    if (method === "initialize") {
      const requested = params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.has(requested)
        ? requested
        : DEFAULT_PROTOCOL;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          instructions:
            "Self-hosted Hindsight memory tools (`hindsight_recall`, `hindsight_retain`, `hindsight_reflect`, `hindsight_status`) scoped to the user's configured bank.",
        },
      };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOL_DEFINITIONS,
        },
      };
    }

    if (method === "resources/list") {
      return { jsonrpc: "2.0", id, result: { resources: [] } };
    }

    if (method === "prompts/list") {
      return { jsonrpc: "2.0", id, result: { prompts: [] } };
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const toolArgs =
        params?.arguments && typeof params.arguments === "object"
          ? params.arguments
          : {};
      if (!toolName || typeof toolName !== "string") {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "tools/call requires params.name." },
        };
      }
      const result = await dispatchToolCall(toolName, toolArgs, ctx);
      return {
        jsonrpc: "2.0",
        id,
        result,
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function writeMessage(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function startStdioServer() {
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  process.stdin.on("data", (chunk) => {
    buffer += decoder.write(chunk);
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        writeMessage({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        });
        continue;
      }
      Promise.resolve(handleJsonRpcMessage(parsed))
        .then((resp) => {
          if (resp) writeMessage(resp);
        })
        .catch((err) => {
          if (parsed && Object.prototype.hasOwnProperty.call(parsed, "id")) {
            writeMessage({
              jsonrpc: "2.0",
              id: parsed.id,
              error: {
                code: -32603,
                message: err instanceof Error ? err.message : String(err),
              },
            });
          }
        });
    }
  });

  process.stdin.on("end", () => {
    const trailing = (buffer + decoder.end()).trim();
    if (!trailing) return;
    try {
      const parsed = JSON.parse(trailing);
      Promise.resolve(handleJsonRpcMessage(parsed)).then((resp) => {
        if (resp) writeMessage(resp);
      });
    } catch {
      // ignore incomplete EOF fragment
    }
  });
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  if (process.argv.includes("--list-tools")) {
    process.stdout.write(
      `${JSON.stringify(
        TOOL_DEFINITIONS.map((t) => t.name),
        null,
        2
      )}\n`
    );
    process.exit(0);
  }
  startStdioServer();
}

