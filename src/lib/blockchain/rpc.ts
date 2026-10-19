export async function jsonRpc<T>(url: string, method: string, params: unknown[], fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${method} failed with HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}

export async function getJson<T>(url: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET ${url} failed with HTTP ${res.status}`);
  return (await res.json()) as T;
}
