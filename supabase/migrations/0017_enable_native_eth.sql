-- Enable native Ether payments on Ethereum mainnet now that direct transfers
-- are scanned from full blocks by the EVM adapter.
update asset_networks
set enabled = true
where asset = 'ETH' and network = 'ethereum';
