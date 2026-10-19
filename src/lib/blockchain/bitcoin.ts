import { getJson } from "./rpc";
import type { BlockchainAdapter, DetectedTransfer } from "./types";

const API = process.env.BITCOIN_API ?? "https://blockstream.info/api";
type Tx = { txid: string; vout: { scriptpubkey_address?: string; value: number }[]; status: { confirmed: boolean; block_height?: number; block_time?: number } };

export const bitcoinAdapter: BlockchainAdapter = {
  async scan({ address }) {
    const [txs, tip] = await Promise.all([getJson<Tx[]>(`${API}/address/${address}/txs`), getJson<number>(`${API}/blocks/tip/height`)]);
    const transfers: DetectedTransfer[] = [];
    for (const tx of txs) {
      const sats = tx.vout.filter((o) => o.scriptpubkey_address === address).reduce((t, o) => t + o.value, 0);
      if (sats > 0) transfers.push({ txHash: tx.txid, amountBaseUnits: BigInt(sats), confirmations: tx.status.confirmed && tx.status.block_height ? tip - tx.status.block_height + 1 : 0, time: tx.status.block_time });
    }
    return { transfers, cursor: null };
  },

  async confirmations({ txHash }) {
    const [st, tip] = await Promise.all([
      getJson<{ confirmed: boolean; block_height?: number }>(`${API}/tx/${txHash}/status`),
      getJson<number>(`${API}/blocks/tip/height`),
    ]);
    return { confirmations: st.confirmed && st.block_height ? tip - st.block_height + 1 : 0, failed: false };
  },
};
