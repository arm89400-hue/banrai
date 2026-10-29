// Small text checks written without regular expressions that could backtrack
// badly on long, crafted input.

// name@domain.tld: one "@", something before it, and a dot inside the domain.
export function isEmail(value) {
  const s = String(value ?? '');
  if (s.length === 0 || s.length > 254 || /\s/.test(s)) return false;
  const at = s.indexOf('@');
  if (at < 1 || at !== s.lastIndexOf('@')) return false;
  const domain = s.slice(at + 1);
  return domain.length >= 3 && domain.slice(1, -1).includes('.');
}

export function trimTrailingSlashes(value) {
  const s = String(value ?? '');
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}
