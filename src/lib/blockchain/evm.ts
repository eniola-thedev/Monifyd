import { jsonRpc } from "./rpc";
import type { BlockchainAdapter, DetectedTransfer } from "./types";

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const RPC: Record<string, { url: string; lookback: number }> = {
  ethereum: { url: process.env.RPC_ETHEREUM ?? "https://ethereum-rpc.publicnode.com", lookback: 150 },
  base: { url: process.env.RPC_BASE ?? "https://mainnet.base.org", lookback: 900 },
  polygon: { url: process.env.RPC_POLYGON ?? "https://polygon-bor-rpc.publicnode.com", lookback: 900 },
  bnb: { url: process.env.RPC_BNB ?? "https://bsc-rpc.publicnode.com", lookback: 600 },
};
const MAX_RANGE = 1000;
const pad = (addr: string) => "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const hexToNum = (h: string) => Number(BigInt(h));

export const evmAdapter: BlockchainAdapter = {
  async scan({ network, address, tokenContract, cursor }) {
    const cfg = RPC[network];
    if (!cfg) throw new Error(`No RPC configured for ${network}`);
    if (!tokenContract) return { transfers: [], cursor }; // native coin detection is not supported yet
    const latest = hexToNum(await jsonRpc<string>(cfg.url, "eth_blockNumber", []));
    const from = Math.max(cursor ? Number(cursor) + 1 : 0, latest - cfg.lookback);
    if (from > latest) return { transfers: [], cursor: String(latest) };
    const to = Math.min(latest, from + MAX_RANGE - 1);
    const logs = await jsonRpc<{ transactionHash: string; blockNumber: string; data: string; removed?: boolean }[]>(cfg.url, "eth_getLogs", [{
      address: tokenContract, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16),
      topics: [TRANSFER_TOPIC, null, pad(address)],
    }]);
    const times = new Map<string, number | undefined>();
    const transfers: DetectedTransfer[] = [];
    for (const l of logs.filter((x) => !x.removed)) {
      if (!times.has(l.blockNumber)) {
        const b = await jsonRpc<{ timestamp: string } | null>(cfg.url, "eth_getBlockByNumber", [l.blockNumber, false]);
        times.set(l.blockNumber, b ? hexToNum(b.timestamp) : undefined);
      }
      transfers.push({ txHash: l.transactionHash, amountBaseUnits: BigInt(l.data), confirmations: latest - hexToNum(l.blockNumber) + 1, time: times.get(l.blockNumber) });
    }
    return { transfers, cursor: String(to) };
  },

  async confirmations({ network, txHash }) {
    const cfg = RPC[network];
    const [latestHex, receipt] = await Promise.all([
      jsonRpc<string>(cfg.url, "eth_blockNumber", []),
      jsonRpc<{ blockNumber: string; status: string } | null>(cfg.url, "eth_getTransactionReceipt", [txHash]),
    ]);
    if (!receipt) return { confirmations: 0, failed: false };
    if (receipt.status === "0x0") return { confirmations: 0, failed: true };
    return { confirmations: hexToNum(latestHex) - hexToNum(receipt.blockNumber) + 1, failed: false };
  },
};
