/** Every chain sits behind this interface so no provider is hard-wired into payment logic. */
export type DetectedTransfer = {
  txHash: string;
  amountBaseUnits: bigint;
  confirmations: number;
  /** Unix seconds when the transfer was confirmed, when known. */
  time?: number;
};

export type ScanArgs = { network: string; asset: string; address: string; tokenContract: string | null; cursor: string | null; fromTime?: number };

export interface BlockchainAdapter {
  /** Incoming transfers of `asset` to `address` seen since `cursor`. Returns the new cursor. */
  scan(args: ScanArgs): Promise<{ transfers: DetectedTransfer[]; cursor: string | null }>;
  /** Current confirmations for a known transaction. `failed` means it was reverted or dropped. */
  confirmations(args: { network: string; txHash: string }): Promise<{ confirmations: number; failed: boolean }>;
}
