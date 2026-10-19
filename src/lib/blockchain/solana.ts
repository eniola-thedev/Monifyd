import { jsonRpc } from "./rpc";
import type { BlockchainAdapter, DetectedTransfer } from "./types";

const URL = process.env.RPC_SOLANA ?? "https://api.mainnet-beta.solana.com";
const rpc = <T,>(m: string, p: unknown[]) => jsonRpc<T>(URL, m, p);

type Status = { confirmationStatus?: string; err: unknown } | null;
type TokenBalance = { owner?: string; mint?: string; uiTokenAmount: { amount: string } };

const confsFrom = (s: Status) => (!s ? 0 : s.confirmationStatus === "finalized" ? 32 : s.confirmationStatus === "confirmed" ? 10 : 0);

/** Sum of one owner's balance of one mint across a list of token balances, in base units. */
function tokenTotal(list: TokenBalance[], owner: string, mint: string): bigint {
  let total = 0n;
  for (const b of list) if (b.owner === owner && b.mint === mint) total += BigInt(b.uiTokenAmount.amount);
  return total;
}

export const solanaAdapter: BlockchainAdapter = {
  async scan({ address, tokenContract, cursor, fromTime }) {
    // Native SOL arrives at the wallet itself; SPL tokens arrive at the wallet's token account for that mint.
    let watch = [address];
    if (tokenContract) {
      const r = await rpc<{ value: { pubkey: string }[] }>("getTokenAccountsByOwner", [address, { mint: tokenContract }, { encoding: "jsonParsed" }]);
      watch = r.value.map((a) => a.pubkey);
      if (watch.length === 0) return { transfers: [], cursor: null };
    }
    const transfers: DetectedTransfer[] = [];
    let previous: Record<string, string> = {};
    try { previous = cursor ? JSON.parse(cursor) as Record<string, string> : {}; } catch { previous = {}; }
    const next: Record<string, string> = { ...previous };
    for (const key of watch) {
      const boundary = previous[key];
      let before: string | undefined;
      let newest: string | undefined;
      let reachedBoundary = false;
      let finishedByTime = false;
      for (let page = 0; page < 100; page++) {
        const options: Record<string, unknown> = { limit: 1000 };
        if (before) options.before = before;
        if (boundary) options.until = boundary;
        const sigs = await rpc<{ signature: string; err: unknown; blockTime: number | null }[]>("getSignaturesForAddress", [key, options]);
        if (sigs.length === 0) { reachedBoundary = true; break; }
        newest ??= sigs[0].signature;
        const inWindow = sigs.filter((s) => {
          if (boundary && s.signature === boundary) { reachedBoundary = true; return false; }
          if (s.blockTime !== null && fromTime !== undefined && s.blockTime < fromTime) { finishedByTime = true; return false; }
          return !s.err;
        });
        if (inWindow.length) {
          const signatureStatuses: Status[] = [];
          for (let i = 0; i < inWindow.length; i += 256) {
            const statuses = await rpc<{ value: Status[] }>("getSignatureStatuses", [inWindow.slice(i, i + 256).map((s) => s.signature)]);
            signatureStatuses.push(...statuses.value);
          }
          for (let i = 0; i < inWindow.length; i++) {
            const tx = await rpc<any>("getTransaction", [inWindow[i].signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
            if (!tx?.meta || tx.meta.err) continue;
            let delta: bigint = 0n;
            if (tokenContract) {
              delta = tokenTotal(tx.meta.postTokenBalances ?? [], address, tokenContract) - tokenTotal(tx.meta.preTokenBalances ?? [], address, tokenContract);
            } else {
              const idx = tx.transaction.message.accountKeys.findIndex((k: any) => (k.pubkey ?? k) === address);
              if (idx >= 0) delta = BigInt(tx.meta.postBalances[idx]) - BigInt(tx.meta.preBalances[idx]);
            }
            if (delta > 0n) transfers.push({ txHash: inWindow[i].signature, amountBaseUnits: delta, confirmations: confsFrom(signatureStatuses[i]), time: tx.blockTime ?? undefined });
          }
        }
        if (reachedBoundary || finishedByTime || sigs.length < 1000) break;
        before = sigs[sigs.length - 1].signature;
        if (page === 99) throw new Error(`Solana scan exceeded the pagination limit for ${key}; cursor was not advanced.`);
      }
      if (newest) next[key] = newest;
    }
    return { transfers, cursor: Object.keys(next).length ? JSON.stringify(next) : null };
  },

  async confirmations({ txHash }) {
    const r = await rpc<{ value: Status[] }>("getSignatureStatuses", [[txHash], { searchTransactionHistory: true }]);
    const s = r.value[0];
    return { confirmations: confsFrom(s), failed: !!s?.err };
  },
};
