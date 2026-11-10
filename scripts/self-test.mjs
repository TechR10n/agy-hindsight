#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ConfigError,
  redactedConfigSummary,
  resolveConfig,
  writePluginDataConfig,
} from "./lib/config.mjs";
import {
  buildRetainStamp,
  normalizeHostName,
  sanitizeExtraTags,
} from "./lib/stamp.mjs";
import {
  detectSurface,
  readAntigravityTranscript,
  unwrapUserContent,
} from "./lib/transcript.mjs";
import { handleJsonRpcMessage } from "./mcp-server.mjs";
import { runPreInvocation } from "./pre-invocation.mjs";
import { runStopHook } from "./stop.mjs";

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-hindsight-test-"));
  const fakeHome = path.join(tmpDir, "home");
  const pluginData = path.join(tmpDir, "plugin_data");
  fs.mkdirSync(fakeHome, { recursive: true });
  fs.mkdirSync(pluginData, { recursive: true });

  try {
    // 1. Missing settings fail clearly without falling back to defaults
    assert.throws(
      () =>
        resolveConfig({
          env: { PLUGIN_DATA: pluginData },
          homeDir: fakeHome,
          hostname: "workstation.local",
        }),
      (err) => err instanceof ConfigError && /HINDSIGHT_API_URL/.test(err.message)
    );

    assert.throws(
      () =>
        resolveConfig({
          env: {
            PLUGIN_DATA: pluginData,
            HINDSIGHT_API_URL: "${HINDSIGHT_API_URL}",
          },
          homeDir: fakeHome,
          hostname: "workstation.local",
        }),
      (err) => err instanceof ConfigError && /HINDSIGHT_API_URL/.test(err.message)
    );

    assert.throws(
      () =>
        resolveConfig({
          env: {
            PLUGIN_DATA: pluginData,
            HINDSIGHT_API_URL: "http://localhost:8888/",
          },
          homeDir: fakeHome,
          hostname: "workstation.local",
        }),
      (err) => err instanceof ConfigError && /HINDSIGHT_BANK_ID/.test(err.message)
    );

    // 2. Empty API token allowed, host tag defaults from local hostname, bank mutations off by default
    const defaultCfg = resolveConfig({
      env: {
        PLUGIN_DATA: pluginData,
        HINDSIGHT_API_URL: "http://localhost:8888/v1/",
        HINDSIGHT_BANK_ID: "disposable-test-bank",
        HINDSIGHT_API_TOKEN: "",
      },
      homeDir: fakeHome,
      hostname: "DevBox.example.internal",
    });
    assert.equal(defaultCfg.apiUrl, "http://localhost:8888");
    assert.equal(defaultCfg.bankId, "disposable-test-bank");
    assert.equal(defaultCfg.apiToken, "");
    assert.equal(defaultCfg.hostName, "devbox");
    assert.equal(defaultCfg.hostTag, "host:devbox");
    assert.equal(defaultCfg.createBank, false);
    assert.equal(defaultCfg.manageBankConfig, false);
    assert.equal(defaultCfg.dynamicBankId, false);

    // 3. Non-empty token is redacted in diagnostic summaries
    const tokenCfg = resolveConfig({
      env: {
        PLUGIN_DATA: pluginData,
        HINDSIGHT_API_URL: "https://hindsight.example.test",
        HINDSIGHT_BANK_ID: "disposable-test-bank",
        HINDSIGHT_API_TOKEN: "test-token-not-real",
        HINDSIGHT_HOST_TAG: "ci-runner",
      },
      homeDir: fakeHome,
    });
    const summary = redactedConfigSummary(tokenCfg);
    assert.equal(summary.apiTokenConfigured, true);
    assert.equal(JSON.stringify(summary).includes("test-token-not-real"), false);
    assert.equal(summary.hostTag, "host:ci-runner");

    // 4. Reserved harness: and source: prefixes are rejected/discarded
    assert.throws(
      () => normalizeHostName("harness:antigravity"),
      /reserved/i
    );
    assert.throws(
      () => normalizeHostName("source:laptop"),
      /reserved/i
    );
    assert.deepEqual(
      sanitizeExtraTags(["harness:cli", "source:ide", "team:core", "host:box"]),
      ["team:core", "host:box"]
    );

    const stamp = buildRetainStamp({
      hostName: "host:workstation-01",
      surface: "antigravity-ide",
      conversationId: "conv-123",
      workspace: "/some/private/user/path/my-repo",
      extraTags: ["harness:ignored", "source:ignored", "topic:auth"],
      extraMetadata: { host: "spoofed", custom: "val" },
    });
    assert.deepEqual(stamp.tags, ["host:workstation-01", "topic:auth"]);
    assert.equal(stamp.metadata.host, "workstation-01");
    assert.equal(stamp.metadata.surface, "antigravity-ide");
    assert.equal(stamp.metadata.project, "my-repo");
    assert.equal(JSON.stringify(stamp).includes("/some/private/user"), false);

    // 5. Read-only lookup of Antigravity MCP variables in ~/.gemini/config/config.json
    const agyConfigDir = path.join(fakeHome, ".gemini", "config");
    fs.mkdirSync(agyConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(agyConfigDir, "config.json"),
      JSON.stringify({
        plugins: {
          "agy-hindsight": {
            enabled: true,
            mcp: {
              hindsight: {
                variables: {
                  HINDSIGHT_API_URL: "http://127.0.0.1:8888",
                  HINDSIGHT_BANK_ID: "from-agy-ui",
                },
              },
            },
          },
        },
      })
    );
    const bridgedCfg = resolveConfig({
      env: { PLUGIN_DATA: pluginData },
      homeDir: fakeHome,
      hostname: "builder",
      pluginRoot: "/opt/plugins/agy-hindsight",
    });
    assert.equal(bridgedCfg.apiUrl, "http://127.0.0.1:8888");
    assert.equal(bridgedCfg.bankId, "from-agy-ui");

    // 5b. Cross-surface plugin_data sync between antigravity (IDE) and antigravity-cli (CLI)
    const ideSurfaceData = path.join(fakeHome, ".gemini", "antigravity", "plugin_data", "agy-hindsight");
    const cliSurfaceData = path.join(fakeHome, ".gemini", "antigravity-cli", "plugin_data", "agy-hindsight");
    fs.mkdirSync(path.join(fakeHome, ".gemini", "antigravity"), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, ".gemini", "antigravity-cli"), { recursive: true });
    writePluginDataConfig({ hostTag: "shared-workstation" }, {}, fakeHome);
    const ideResolved = resolveConfig({
      env: { PLUGIN_DATA: ideSurfaceData },
      homeDir: fakeHome,
      pluginRoot: "/opt/plugins/agy-hindsight",
    });
    const cliResolved = resolveConfig({
      env: { PLUGIN_DATA: cliSurfaceData },
      homeDir: fakeHome,
      pluginRoot: "/opt/plugins/agy-hindsight",
    });
    assert.equal(ideResolved.hostTag, "host:shared-workstation");
    assert.equal(cliResolved.hostTag, "host:shared-workstation");

    // 5c. Precedence: configure.mjs bankId overrides mcp_config.json ${HINDSIGHT_BANK_ID} expansion,
    // while an explicit shell env override still wins.
    writePluginDataConfig({ bankId: "override-from-configure" }, {}, fakeHome);
    const mcpAutoEnvResolved = resolveConfig({
      env: {
        PLUGIN_DATA: ideSurfaceData,
        HINDSIGHT_API_URL: "http://127.0.0.1:8888",
        HINDSIGHT_BANK_ID: "from-agy-ui",
      },
      homeDir: fakeHome,
      pluginRoot: "/opt/plugins/agy-hindsight",
    });
    assert.equal(mcpAutoEnvResolved.bankId, "override-from-configure");

    const explicitShellEnvResolved = resolveConfig({
      env: {
        PLUGIN_DATA: ideSurfaceData,
        HINDSIGHT_API_URL: "http://127.0.0.1:8888",
        HINDSIGHT_BANK_ID: "explicit-shell-bank",
      },
      homeDir: fakeHome,
      pluginRoot: "/opt/plugins/agy-hindsight",
    });
    assert.equal(explicitShellEnvResolved.bankId, "explicit-shell-bank");
    writePluginDataConfig({ bankId: undefined }, {}, fakeHome);

    // 6. Surface detection distinguishes IDE vs CLI
    assert.equal(
      detectSurface(
        { transcriptPath: "/tmp/.gemini/antigravity/brain/1/transcript.jsonl" },
        { ANTIGRAVITY_AUTH_SUCCESS_APP: "antigravity-ide" }
      ),
      "antigravity-ide"
    );
    assert.equal(
      detectSurface(
        { transcriptPath: "/tmp/.gemini/antigravity/brain/2/transcript.jsonl" },
        {}
      ),
      "antigravity-cli"
    );

    // 7. Transcript cleaning strips injected blocks and unwraps <USER_REQUEST>
    const transcriptFile = path.join(tmpDir, "transcript.jsonl");
    fs.writeFileSync(
      transcriptFile,
      [
        JSON.stringify({
          type: "USER_INPUT",
          created_at: "2026-11-10T12:00:00Z",
          content:
            '<ADDITIONAL_METADATA>meta</ADDITIONAL_METADATA><hindsight_memory bank="x">- old</hindsight_memory><USER_REQUEST>Remember marker ALPHA-101</USER_REQUEST>',
        }),
        JSON.stringify({
          type: "PLANNER_RESPONSE",
          created_at: "2026-11-10T12:00:02Z",
          content: "Noted ALPHA-101.",
        }),
      ].join("\n")
    );
    assert.equal(
      unwrapUserContent("<USER_REQUEST>Hello world</USER_REQUEST>"),
      "Hello world"
    );
    const parsedTurns = readAntigravityTranscript(transcriptFile);
    assert.equal(parsedTurns.length, 2);
    assert.equal(parsedTurns[0].content, "Remember marker ALPHA-101");
    assert.equal(parsedTurns[1].content, "Noted ALPHA-101.");

    // 8. Mock Hindsight server calls for PreInvocation, Stop (IDE + CLI), and MCP tools
    const httpCalls = [];
    const mockFetch = async (url, init = {}) => {
      const parsedBody = init.body ? JSON.parse(init.body) : undefined;
      httpCalls.push({
        method: init.method || "GET",
        url,
        headers: init.headers || {},
        body: parsedBody,
      });

      if (url.endsWith("/version")) {
        return new Response(JSON.stringify({ api_version: "0.10.1" }), { status: 200 });
      }
      if (url.endsWith("/stats")) {
        return new Response(JSON.stringify({ total_nodes: 2 }), { status: 200 });
      }
      if (url.endsWith("/memories/recall")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "m1",
                text: "Marker ALPHA-101 was verified.",
                type: "world",
                tags: ["host:devbox"],
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/memories")) {
        return new Response(
          JSON.stringify({
            success: true,
            bank_id: "disposable-test-bank",
            items_count: 1,
            async: false,
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/reflect")) {
        return new Response(
          JSON.stringify({ text: "Synthesized answer for ALPHA-101.", based_on: {} }),
          { status: 200 }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const hookEnv = {
      PLUGIN_DATA: pluginData,
      HINDSIGHT_API_URL: "http://localhost:8888",
      HINDSIGHT_BANK_ID: "disposable-test-bank",
      HINDSIGHT_HOST_TAG: "test-host",
    };

    const preRes = await runPreInvocation({
      rawStdin: JSON.stringify({
        conversationId: "conv-ide-1",
        lastUserInput: "<USER_REQUEST>What is marker ALPHA-101?</USER_REQUEST>",
      }),
      env: hookEnv,
      fetchImpl: mockFetch,
    });
    assert.equal(preRes.exitCode, 0);
    assert.ok(
      preRes.stdout.injectSteps?.[0]?.systemMessage?.systemMessage?.includes(
        "Marker ALPHA-101 was verified."
      )
    );

    // Dedup check: identical prompt on same conversation yields empty object without HTTP call
    const callsBeforeDedup = httpCalls.length;
    const preDedup = await runPreInvocation({
      rawStdin: JSON.stringify({
        conversationId: "conv-ide-1",
        lastUserInput: "<USER_REQUEST>What is marker ALPHA-101?</USER_REQUEST>",
      }),
      env: hookEnv,
      fetchImpl: mockFetch,
    });
    assert.deepEqual(preDedup.stdout, {});
    assert.equal(httpCalls.length, callsBeforeDedup);

    // Stop hook for IDE surface
    const stopIde = await runStopHook({
      rawStdin: JSON.stringify({
        conversationId: "conv-ide-1",
        transcriptPath: transcriptFile,
        workspacePaths: ["/Users/example/project-x"],
      }),
      env: { ...hookEnv, ANTIGRAVITY_AUTH_SUCCESS_APP: "antigravity-ide" },
      fetchImpl: mockFetch,
    });
    assert.deepEqual(stopIde, { exitCode: 0, stdout: { decision: "allow" } });
    const ideRetainCall = httpCalls.at(-1);
    assert.equal(ideRetainCall.method, "POST");
    assert.equal(
      ideRetainCall.body.items[0].document_id,
      "antigravity:antigravity-ide:conv-ide-1"
    );
    assert.deepEqual(ideRetainCall.body.items[0].tags, ["host:test-host"]);
    assert.equal(ideRetainCall.body.items[0].metadata.host, "test-host");
    assert.equal(ideRetainCall.body.items[0].metadata.surface, "antigravity-ide");

    // Stop hook for CLI surface
    const stopCli = await runStopHook({
      rawStdin: JSON.stringify({
        conversationId: "conv-cli-2",
        transcriptPath: transcriptFile,
        workspacePaths: ["/Users/example/project-x"],
      }),
      env: hookEnv,
      fetchImpl: mockFetch,
    });
    assert.deepEqual(stopCli, { exitCode: 0, stdout: { decision: "allow" } });
    const cliRetainCall = httpCalls.at(-1);
    assert.equal(
      cliRetainCall.body.items[0].document_id,
      "antigravity:antigravity-cli:conv-cli-2"
    );
    assert.deepEqual(cliRetainCall.body.items[0].tags, ["host:test-host"]);
    assert.equal(cliRetainCall.body.items[0].metadata.surface, "antigravity-cli");

    // Verify zero bank-creation PUT or config-mutation PATCH calls occurred
    assert.equal(
      httpCalls.some((c) => c.method === "PUT" || c.method === "PATCH"),
      false
    );

    // MCP JSON-RPC round-trips
    const initResp = await handleJsonRpcMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    });
    assert.equal(initResp.result.serverInfo.name, "hindsight");

    const listResp = await handleJsonRpcMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    assert.deepEqual(
      listResp.result.tools.map((t) => t.name),
      ["hindsight_recall", "hindsight_retain", "hindsight_reflect", "hindsight_status"]
    );

    const retainMcp = await handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "hindsight_retain",
          arguments: {
            content: "Explicit MCP retained note.",
            tags: ["harness:dropped", "topic:mcp"],
          },
        },
      },
      { env: hookEnv, fetchImpl: mockFetch }
    );
    const retainPayload = JSON.parse(retainMcp.result.content[0].text);
    assert.equal(retainPayload.success, true);
    assert.deepEqual(retainPayload.tags, ["host:test-host", "topic:mcp"]);
    assert.equal(retainPayload.metadata.host, "test-host");

    const recallMcp = await handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "hindsight_recall",
          arguments: { query: "ALPHA-101" },
        },
      },
      { env: hookEnv, fetchImpl: mockFetch }
    );
    const recallPayload = JSON.parse(recallMcp.result.content[0].text);
    assert.equal(recallPayload.count, 1);
    assert.match(recallPayload.results[0].text, /ALPHA-101/);

    process.stdout.write("All agy-hindsight self-tests passed (9 suites).\n");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`Self-test failure: ${err?.stack || err}\n`);
  process.exit(1);
});

