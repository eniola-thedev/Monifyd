/** Checkbox matrix of enabled asset/network pairs. Pairs on networks without a wallet are disabled. */
export function CoinPicker({ pairs, networks, haveNetworks }: {
  pairs: { asset: string; network: string }[]; networks: { id: string; name: string }[]; haveNetworks: Set<string>;
}) {
  const name = (id: string) => networks.find((n) => n.id === id)?.name ?? id;
  return (
    <fieldset className="field"><legend>Accepted coins and networks</legend>
      <div className="checks">
        {pairs.map((p) => {
          const ok = haveNetworks.has(p.network);
          return (
            <label key={`${p.asset}:${p.network}`} className={`check${ok ? "" : " off"}`}>
              <input type="checkbox" name="pair" value={`${p.asset}:${p.network}`} disabled={!ok} />
              <span>{p.asset} on {name(p.network)}{ok ? "" : " (add a wallet)"}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
