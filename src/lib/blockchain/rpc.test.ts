import assert from "node:assert/strict";
import { getJson, jsonRpc } from "./rpc";

async function main() {
  await assert.rejects(
    jsonRpc("https://rpc.example", "eth_blockNumber", [], async () => new Response("offline", { status: 503 })),
    /eth_blockNumber failed with HTTP 503/,
  );
  await assert.rejects(
    jsonRpc("https://rpc.example", "eth_getLogs", [], async () => Response.json({
      jsonrpc: "2.0", id: 1, error: { code: -32005, message: "rate limit exceeded" },
    })),
    /eth_getLogs: rate limit exceeded/,
  );
  await assert.rejects(
    getJson("https://explorer.example/api", async () => new Response("", { status: 502 })),
    /GET https:\/\/explorer\.example\/api failed with HTTP 502/,
  );

  console.log("RPC failure handling: ok");
}

void main();
