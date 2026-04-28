export type Rates = Record<string, number>;

export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}
