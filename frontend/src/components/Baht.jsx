import { useEffect, useRef, useState } from 'react';
import { formatBaht } from '../lib/money';
import { useTween } from '../lib/glide';

// A baht amount that runs to its new value in place when it changes, and
// glows for a moment, so the guest sees the total react to what they picked.
export default function Baht({ value, className }) {
  const n = Number(value || 0);
  const shown = useTween(n);
  const [bump, setBump] = useState(0);
  const first = useRef(n);
  useEffect(() => {
    if (n !== first.current) setBump((b) => b + 1);
    first.current = n;
  }, [n]);
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      <span key={bump} className={bump ? 'baht-bump' : undefined}>
        {formatBaht(shown)}
      </span>
    </span>
  );
}
