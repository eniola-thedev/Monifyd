export class MonifydError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "MonifydError";
    this.code = code;
    this.status = status;
  }
}

export class Monifyd {
  constructor({ apiKey, baseUrl, fetch: fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new TypeError("apiKey is required.");
    if (!baseUrl) throw new TypeError("baseUrl is required.");
    if (typeof fetchImpl !== "function") throw new TypeError("A Fetch-compatible implementation is required.");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetch = fetchImpl;
    this.paymentLinks = {
      create: (body, options) => this.request("POST", "/payment-links", body, options),
      list: () => this.request("GET", "/payment-links"),
    };
    this.payments = {
      list: () => this.request("GET", "/payments"),
      get: (id) => this.request("GET", `/payments/${encodeURIComponent(id)}`),
    };
    this.invoices = {
      create: (body, options) => this.request("POST", "/invoices", body, options),
      list: (options = {}) => {
        const query = new URLSearchParams();
        if (options.limit !== undefined) query.set("limit", String(options.limit));
        if (options.offset !== undefined) query.set("offset", String(options.offset));
        const suffix = query.size ? `?${query}` : "";
        return this.request("GET", `/invoices${suffix}`);
      },
      get: (id) => this.request("GET", `/invoices/${encodeURIComponent(id)}`),
      send: (id) => this.request("POST", `/invoices/${encodeURIComponent(id)}/send`),
      cancel: (id) => this.request("POST", `/invoices/${encodeURIComponent(id)}/cancel`),
    };
  }

  async request(method, path, body, options = {}) {
    const headers = { authorization: `Bearer ${this.apiKey}`, accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    const response = await this.fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = payload?.error;
      throw new MonifydError(error?.message ?? `Monifyd API request failed with HTTP ${response.status}.`, error?.code ?? "HTTP_ERROR", response.status);
    }
    return payload;
  }
}
