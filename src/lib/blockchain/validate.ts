const EVM = /^0x[a-fA-F0-9]{40}$/;
const BITCOIN = /^(bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Format check only. It catches typos and wrong-chain addresses, not a mistyped but well-formed address. */
export function validateAddress(network: string, address: string): boolean {
  switch (network) {
    case "bitcoin": return BITCOIN.test(address);
    case "solana": return SOLANA.test(address);
    case "ethereum": case "base": case "polygon": case "bnb": return EVM.test(address);
    default: return false;
  }
}
