// Formats a price in Thai Baht, e.g. 1500 -> "฿1,500", 99.5 -> "฿99.50".
// Every price on the site goes through this so the currency stays consistent.
export function formatBaht(amount) {
  const n = Number(amount || 0);
  return `฿${n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
