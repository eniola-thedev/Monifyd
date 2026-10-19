import { getJson } from "./rpc";
import type { BlockchainAdapter, DetectedTransfer } from "./types";

const API = process.env.BITCOIN_API ?? "https://blockstream.info/api";
type Tx = { txid: string; vout: { scriptpubkey_address?: string; value: number }[]; status: { confirmed: boolean; block_height?: number; block_time?: number } };

export const bitcoinAdapter: BlockchainAdapter = {
  async scan({ address, cursor, fromTime }) {
    const [firstPage, tip] = await Promise.all([getJson<Tx[]>(`${API}/address/${address}/txs`), getJson<number>(`${API}/blocks/tip/height`)]);
    const txs: Tx[] = [];
    let page = firstPage;
    let pageCount = 0;
    let reachedBoundary = false;
    while (page.length) {
      for (const tx of page) {
        if (cursor && tx.txid === cursor) { reachedBoundary = true; break; }
        if (fromTime !== undefined && tx.status.confirmed && tx.status.block_time !== undefined && tx.status.block_time < fromTime) {
          reachedBoundary = true;
          break;
        }
        txs.push(tx);
      }
      if (reachedBoundary || page.length < 25) break;
      if (++pageCount >= 200) throw new Error("Bitcoin scan exceeded the pagination limit; cursor was not advanced.");
      const lastId = page[page.length - 1].txid;
      page = await getJson<Tx[]>(`${API}/address/${address}/txs/chain/${lastId}`);
    }
    const transfers: DetectedTransfer[] = [];
    for (const tx of txs) {
      const sats = tx.vout.filter((o) => o.scriptpubkey_address === address).reduce((t, o) => t + o.value, 0);
      if (sats > 0) transfers.push({ txHash: tx.txid, amountBaseUnits: BigInt(sats), confirmations: tx.status.confirmed && tx.status.block_height ? tip - tx.status.block_height + 1 : 0, time: tx.status.block_time });
    }
    return { transfers, cursor: firstPage[0]?.txid ?? cursor ?? null };
  },

  async confirmations({ txHash }) {
    const [st, tip] = await Promise.all([
      getJson<{ confirmed: boolean; block_height?: number }>(`${API}/tx/${txHash}/status`),
      getJson<number>(`${API}/blocks/tip/height`),
    ]);
    return { confirmations: st.confirmed && st.block_height ? tip - st.block_height + 1 : 0, failed: false };
  },
};
