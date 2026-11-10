/**
 * Minimal, zero-dependency Hindsight REST API v1 client.
 * Never creates a bank or modifies bank configuration unless explicitly opted in.
 * Never sends OpenTelemetry / OTLP payloads.
 */
export class HindsightApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "HindsightApiError";
    this.status = status;
    this.body = body;
  }
}

export class HindsightClient {
  constructor({
    apiUrl,
    bankId,
    apiToken = "",
    createBank = false,
    manageBankConfig = false,
    fetchImpl = globalThis.fetch,
  }) {
    if (!apiUrl) {
      throw new Error("HindsightClient requires apiUrl.");
    }
    if (!bankId) {
      throw new Error("HindsightClient requires bankId.");
    }
    this.apiUrl = apiUrl.replace(/\/+$/, "");
    this.bankId = bankId;
    this.apiToken = apiToken || "";
    this.createBank = Boolean(createBank);
    this.manageBankConfig = Boolean(manageBankConfig);
    this.fetchImpl = fetchImpl;
  }

  _headers(hasJsonBody = false) {
    const headers = {
      Accept: "application/json",
    };
    if (hasJsonBody) {
      headers["Content-Type"] = "application/json";
    }
    if (this.apiToken) {
      headers.Authorization = `Bearer ${this.apiToken}`;
    }
    return headers;
  }

  _bankPath(bankId = this.bankId, suffix = "") {
    return `/v1/default/banks/${encodeURIComponent(bankId)}${suffix}`;
  }

  async _request(method, urlPath, { body, timeoutMs = 20000 } = {}) {
    const url = `${this.apiUrl}${urlPath}`;
    const hasBody = body !== undefined;
    const response = await this.fetchImpl(url, {
      method,
      headers: this._headers(hasBody),
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const rawText = await response.text();
    let parsed;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = rawText;
      }
    }

    if (!response.ok) {
      const detail =
        parsed && typeof parsed === "object" && (parsed.detail || parsed.error || parsed.message)
          ? JSON.stringify(parsed.detail ?? parsed.error ?? parsed.message)
          : typeof parsed === "string"
            ? parsed.slice(0, 300)
            : response.statusText;
      throw new HindsightApiError(
        `Hindsight ${method} ${urlPath} failed with HTTP ${response.status}: ${detail}`,
        { status: response.status, body: parsed }
      );
    }

    return parsed;
  }

  async getVersion({ timeoutMs = 10000 } = {}) {
    return this._request("GET", "/version", { timeoutMs });
  }

  async getHealth({ timeoutMs = 10000 } = {}) {
    return this._request("GET", "/health", { timeoutMs });
  }

  async getBankStats({ bankId = this.bankId, timeoutMs = 10000 } = {}) {
    return this._request("GET", this._bankPath(bankId, "/stats"), { timeoutMs });
  }

  /**
   * Only creates an empty bank if the user explicitly opted into `createBank: true`.
   * Never rewrites missions, strategies, or shared bank settings.
   */
  async ensureBankIfOptedIn({ bankId = this.bankId, timeoutMs = 10000 } = {}) {
    if (!this.createBank) return { created: false, optedIn: false };
    await this._request("PUT", this._bankPath(bankId, ""), {
      body: {},
      timeoutMs,
    });
    return { created: true, optedIn: true };
  }

  async retain({
    bankId = this.bankId,
    items,
    async: isAsync = false,
    operationId,
    timeoutMs = 30000,
  }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("retain() requires at least one memory item.");
    }
    if (this.createBank) {
      await this.ensureBankIfOptedIn({ bankId, timeoutMs: Math.min(timeoutMs, 10000) });
    }
    const payload = {
      items,
      async: Boolean(isAsync),
      ...(operationId ? { operation_id: operationId } : {}),
    };
    return this._request("POST", this._bankPath(bankId, "/memories"), {
      body: payload,
      timeoutMs,
    });
  }

  async recall({
    bankId = this.bankId,
    query,
    budget = "mid",
    maxTokens = 2048,
    types,
    tags,
    tagsMatch,
    preferObservations = false,
    timeoutMs = 15000,
  }) {
    if (typeof query !== "string" || !query.trim()) {
      throw new Error("recall() requires a non-empty query string.");
    }
    const payload = {
      query: query.trim(),
      budget,
      max_tokens: maxTokens,
      prefer_observations: Boolean(preferObservations),
      ...(Array.isArray(types) && types.length > 0 ? { types } : {}),
      ...(Array.isArray(tags) && tags.length > 0 ? { tags } : {}),
      ...(tagsMatch ? { tags_match: tagsMatch } : {}),
    };
    return this._request("POST", this._bankPath(bankId, "/memories/recall"), {
      body: payload,
      timeoutMs,
    });
  }

  async reflect({
    bankId = this.bankId,
    query,
    context,
    budget = "low",
    maxTokens = 4096,
    tags,
    tagsMatch,
    includeBasedOn = true,
    timeoutMs = 150000,
  }) {
    if (typeof query !== "string" || !query.trim()) {
      throw new Error("reflect() requires a non-empty query string.");
    }
    const payload = {
      query: query.trim(),
      budget,
      max_tokens: maxTokens,
      ...(context ? { context: String(context) } : {}),
      ...(Array.isArray(tags) && tags.length > 0 ? { tags } : {}),
      ...(tagsMatch ? { tags_match: tagsMatch } : {}),
      ...(includeBasedOn ? { include: { facts: {} } } : {}),
    };
    return this._request("POST", this._bankPath(bankId, "/reflect"), {
      body: payload,
      timeoutMs,
    });
  }

  async listDocuments({ bankId = this.bankId, q, limit = 20, timeoutMs = 10000 } = {}) {
    const params = new URLSearchParams();
    if (q) params.set("q", String(q));
    if (limit !== undefined) params.set("limit", String(limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this._request("GET", this._bankPath(bankId, `/documents${qs}`), { timeoutMs });
  }

  async getDocument({ bankId = this.bankId, documentId, timeoutMs = 10000 }) {
    return this._request(
      "GET",
      this._bankPath(bankId, `/documents/${encodeURIComponent(documentId)}`),
      { timeoutMs }
    );
  }
}

