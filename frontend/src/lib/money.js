export function formatBaht(amount) {
  const n = Number(amount || 0);
  return `฿${n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
