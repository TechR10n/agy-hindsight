import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeHostName, sanitizeExtraTags } from "./stamp.mjs";

const UNEXPANDED_PLACEHOLDER_RE = /^\$\{[A-Za-z0-9_]+\}$/;

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

function cleanScalar(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || UNEXPANDED_PLACEHOLDER_RE.test(trimmed)) return undefined;
  return trimmed;
}

function parseBool(value, defaultValue = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes") return true;
    if (v === "0" || v === "false" || v === "no") return false;
  }
  return defaultValue;
}

function readJsonFileSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return undefined;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const DEFAULT_PLUGIN_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".."
);

/**
 * Read-only lookup of user-configured MCP variables stored by Antigravity in
 * `<home>/.gemini/config/config.json` under `plugins.<pluginDir>.mcp.<server>.variables`.
 * Never mutates `~/.gemini/config/config.json`.
 */
export function readAntigravityPluginVariables({
  env = process.env,
  homeDir = os.homedir(),
  pluginRoot = env.PLUGIN_ROOT || DEFAULT_PLUGIN_ROOT,
} = {}) {
  const antigravityConfigPath =
    cleanScalar(env.AGY_HINDSIGHT_ANTIGRAVITY_CONFIG) ||
    path.join(homeDir, ".gemini", "config", "config.json");
  const root = readJsonFileSafe(antigravityConfigPath);
  if (!root || typeof root.plugins !== "object" || !root.plugins) return {};

  const pluginDirName = path.basename(path.resolve(pluginRoot));
  const candidateKeys = Array.from(new Set([pluginDirName, "agy-hindsight"]));

  for (const key of candidateKeys) {
    const entry = root.plugins[key];
    if (!entry || typeof entry.mcp !== "object" || !entry.mcp) continue;
    for (const serverKey of ["hindsight", `${key}_hindsight`, "agy-hindsight_hindsight"]) {
      const vars = entry.mcp[serverKey]?.variables;
      if (vars && typeof vars === "object") {
        return vars;
      }
    }
  }
  return {};
}

export function resolvePluginDataDir(env = process.env, homeDir = os.homedir()) {
  const fromEnv = cleanScalar(env.PLUGIN_DATA);
  if (fromEnv) return fromEnv;
  const appDataDir = cleanScalar(env.ANTIGRAVITY_APP_DATA_DIR);
  if (appDataDir) {
    return path.join(appDataDir, "plugin_data", "agy-hindsight");
  }
  return path.join(homeDir, ".gemini", "antigravity", "plugin_data", "agy-hindsight");
}

export function resolvePluginConfigFile(env = process.env, homeDir = os.homedir()) {
  const explicit = cleanScalar(env.AGY_HINDSIGHT_CONFIG_FILE);
  if (explicit) return explicit;
  return path.join(resolvePluginDataDir(env, homeDir), "config.json");
}

export function resolveStateDir(env = process.env, homeDir = os.homedir()) {
  const explicit = cleanScalar(env.AGY_HINDSIGHT_STATE_DIR);
  if (explicit) return explicit;
  return path.join(resolvePluginDataDir(env, homeDir), "state");
}

export function readPluginDataConfig(env = process.env, homeDir = os.homedir()) {
  const explicit = cleanScalar(env.AGY_HINDSIGHT_CONFIG_FILE);
  if (explicit) {
    return {
      path: explicit,
      data: readJsonFileSafe(explicit) || {},
    };
  }

  const primaryFile = resolvePluginConfigFile(env, homeDir);
  const geminiRoot = path.resolve(homeDir, ".gemini") + path.sep;
  const resolvedPrimary = path.resolve(primaryFile);

  // Only merge sibling IDE/CLI plugin_data files when operating inside `<home>/.gemini/`.
  // Isolated custom PLUGIN_DATA directories (e.g. unit tests) stay completely hermetic.
  if (!resolvedPrimary.startsWith(geminiRoot)) {
    return {
      path: primaryFile,
      data: readJsonFileSafe(primaryFile) || {},
    };
  }

  const ideFile = path.join(
    homeDir,
    ".gemini",
    "antigravity",
    "plugin_data",
    "agy-hindsight",
    "config.json"
  );
  const cliFile = path.join(
    homeDir,
    ".gemini",
    "antigravity-cli",
    "plugin_data",
    "agy-hindsight",
    "config.json"
  );
  const merged = {
    ...(readJsonFileSafe(cliFile) || {}),
    ...(readJsonFileSafe(ideFile) || {}),
    ...(readJsonFileSafe(primaryFile) || {}),
  };
  return {
    path: primaryFile,
    data: merged,
  };
}

export function writePluginDataConfig(updates, env = process.env, homeDir = os.homedir()) {
  const { path: configFile, data: current } = readPluginDataConfig(env, homeDir);
  const next = { ...current, ...updates };
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined) delete next[k];
  }
  const serialized = `${JSON.stringify(next, null, 2)}\n`;

  const targets = [configFile];
  if (!cleanScalar(env.AGY_HINDSIGHT_CONFIG_FILE) && !cleanScalar(env.PLUGIN_DATA)) {
    for (const surfaceDir of ["antigravity", "antigravity-cli"]) {
      const surfaceRoot = path.join(homeDir, ".gemini", surfaceDir);
      if (fs.existsSync(surfaceRoot)) {
        const candidate = path.join(surfaceRoot, "plugin_data", "agy-hindsight", "config.json");
        if (!targets.includes(candidate)) {
          targets.push(candidate);
        }
      }
    }
  }

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const tmpFile = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, serialized, { mode: 0o600 });
    fs.renameSync(tmpFile, target);
  }
  return { path: configFile, syncedPaths: targets };
}

export function normalizeBaseUrl(rawUrl) {
  const cleaned = cleanScalar(rawUrl);
  if (!cleaned) {
    throw new ConfigError(
      "Missing required configuration HINDSIGHT_API_URL. Configure it in Antigravity (/plugin -> Hindsight -> Configure MCP servers), export HINDSIGHT_API_URL, or run `node scripts/configure.mjs --api-url <url>`."
    );
  }
  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new ConfigError(
      `Invalid HINDSIGHT_API_URL "${cleaned}": expected a full http:// or https:// base URL (for example, http://localhost:8888).`
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError(
      `Invalid HINDSIGHT_API_URL "${cleaned}": unsupported protocol "${parsed.protocol}" (expected http: or https:).`
    );
  }
  let normalized = parsed.toString().replace(/\/+$/, "");
  if (normalized.endsWith("/v1")) {
    normalized = normalized.slice(0, -3);
  }
  return normalized;
}

function normalizeOptionalToken(rawToken) {
  if (typeof rawToken !== "string") return "";
  const trimmed = rawToken.trim();
  if (!trimmed || UNEXPANDED_PLACEHOLDER_RE.test(trimmed)) return "";
  if (trimmed.toLowerCase() === "none") return "";
  return trimmed;
}

/**
 * Resolve and validate the active Hindsight plugin configuration.
 * Never falls back to any hard-coded server URL or bank ID.
 */
export function resolveConfig({
  env = process.env,
  homeDir = os.homedir(),
  hostname = os.hostname(),
  cwd = process.cwd(),
  pluginRoot = env.PLUGIN_ROOT || DEFAULT_PLUGIN_ROOT,
} = {}) {
  const disabled = parseBool(env.AGY_HINDSIGHT_DISABLED, false);
  const { path: pluginConfigPath, data: fileCfg } = readPluginDataConfig(env, homeDir);
  const agyVars = readAntigravityPluginVariables({ env, homeDir, pluginRoot });

  if (disabled || parseBool(fileCfg.disabled, false)) {
    return {
      disabled: true,
      apiUrl: "",
      bankId: "",
      apiToken: "",
      hostName: normalizeHostName(env.HINDSIGHT_HOST_TAG ?? fileCfg.hostTag, hostname),
      createBank: false,
      manageBankConfig: false,
      dynamicBankId: false,
      retainTags: [],
      retainMetadata: {},
      pluginConfigPath,
    };
  }

  const envApiUrl = cleanScalar(env.HINDSIGHT_API_URL);
  const agyApiUrl = cleanScalar(agyVars.HINDSIGHT_API_URL);
  const fileApiUrl = cleanScalar(fileCfg.apiUrl);
  // If env matches agyVars, env came from mcp_config.json `${HINDSIGHT_API_URL}` expansion;
  // allow an explicit configure.mjs override (`fileApiUrl`) to keep hooks and MCP in sync.
  const rawApiUrl =
    envApiUrl && envApiUrl !== agyApiUrl
      ? envApiUrl
      : fileApiUrl ?? envApiUrl ?? agyApiUrl;

  const apiUrl = normalizeBaseUrl(rawApiUrl);

  const dynamicBankId = parseBool(
    env.HINDSIGHT_DYNAMIC_BANK_ID ?? fileCfg.dynamicBankId,
    false
  );

  const envBankId = cleanScalar(env.HINDSIGHT_BANK_ID);
  const agyBankId = cleanScalar(agyVars.HINDSIGHT_BANK_ID);
  const fileBankId = cleanScalar(fileCfg.bankId);
  let rawBankId =
    envBankId && envBankId !== agyBankId
      ? envBankId
      : fileBankId ?? envBankId ?? agyBankId;

  if (!rawBankId && dynamicBankId) {
    const projectBase = path.basename(path.resolve(cwd)) || "workspace";
    rawBankId = `coding-agent::${projectBase}`;
  }

  if (!rawBankId) {
    throw new ConfigError(
      "Missing required configuration HINDSIGHT_BANK_ID. Configure it in Antigravity (/plugin -> Hindsight -> Configure MCP servers), export HINDSIGHT_BANK_ID, or run `node scripts/configure.mjs --bank-id <bank>`."
    );
  }

  const rawToken =
    env.HINDSIGHT_API_TOKEN !== undefined && !UNEXPANDED_PLACEHOLDER_RE.test(env.HINDSIGHT_API_TOKEN.trim())
      ? env.HINDSIGHT_API_TOKEN
      : fileCfg.apiToken !== undefined
        ? fileCfg.apiToken
        : agyVars.HINDSIGHT_API_TOKEN;
  const apiToken = normalizeOptionalToken(rawToken);

  const rawHostTag =
    cleanScalar(env.HINDSIGHT_HOST_TAG) ??
    cleanScalar(fileCfg.hostTag) ??
    cleanScalar(agyVars.HINDSIGHT_HOST_TAG);
  const hostName = normalizeHostName(rawHostTag, hostname);

  const createBank = parseBool(env.HINDSIGHT_CREATE_BANK ?? fileCfg.createBank, false);
  const manageBankConfig = parseBool(
    env.HINDSIGHT_MANAGE_BANK_CONFIG ?? fileCfg.manageBankConfig,
    false
  );

  const envTags = cleanScalar(env.HINDSIGHT_RETAIN_TAGS)
    ? env.HINDSIGHT_RETAIN_TAGS.split(",")
    : [];
  const fileTags = Array.isArray(fileCfg.retainTags) ? fileCfg.retainTags : [];
  const retainTags = sanitizeExtraTags([...fileTags, ...envTags]);

  const retainMetadata =
    fileCfg.retainMetadata && typeof fileCfg.retainMetadata === "object"
      ? { ...fileCfg.retainMetadata }
      : {};

  return {
    disabled: false,
    apiUrl,
    bankId: rawBankId,
    apiToken,
    hostName,
    hostTag: `host:${hostName}`,
    createBank,
    manageBankConfig,
    dynamicBankId,
    retainTags,
    retainMetadata,
    pluginConfigPath,
  };
}

/**
 * Return a safe, secret-free diagnostic summary of resolved configuration.
 */
export function redactedConfigSummary(cfg) {
  return {
    disabled: Boolean(cfg.disabled),
    apiUrl: cfg.apiUrl || null,
    bankId: cfg.bankId || null,
    apiTokenConfigured: Boolean(cfg.apiToken),
    hostName: cfg.hostName,
    hostTag: `host:${cfg.hostName}`,
    createBank: Boolean(cfg.createBank),
    manageBankConfig: Boolean(cfg.manageBankConfig),
    dynamicBankId: Boolean(cfg.dynamicBankId),
    retainTags: cfg.retainTags || [],
    pluginConfigPath: cfg.pluginConfigPath || null,
  };
}
