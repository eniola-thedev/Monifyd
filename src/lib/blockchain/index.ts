import { evmAdapter } from "./evm";
import { bitcoinAdapter } from "./bitcoin";
import { solanaAdapter } from "./solana";
import type { BlockchainAdapter } from "./types";

/** Picks the adapter for a network. Payment code never talks to a chain provider directly. */
export function adapterFor(network: string): BlockchainAdapter {
  if (network === "bitcoin") return bitcoinAdapter;
  if (network === "solana") return solanaAdapter;
  return evmAdapter;
}
