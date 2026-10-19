import assert from "node:assert/strict";
import { apiAuthError } from "./errors";

async function main() {
  const invalid = apiAuthError(null);
  assert.equal(invalid?.status, 401);

  const limited = apiAuthError({ rateLimited: true, retryAfter: 17 });
  assert.equal(limited?.status, 429);
  assert.equal(limited?.headers.get("retry-after"), "17");
  assert.deepEqual(await limited?.json(), {
    error: { code: "RATE_LIMITED", message: "API request limit exceeded. Retry after the indicated delay." },
  });

  assert.equal(apiAuthError({}), null);
  console.log("API auth errors: ok");
}

void main();
