import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/lang';
import './Pager.css';

// Splits a long list into pages. The list box keeps the height of a full
// page so the page buttons stay in the same place on the last page.
export function usePaged(list, perPage, resetKey) {
  const [page, setPage] = useState(1);
  const [minHeight, setMinHeight] = useState(0);
  const boxRef = useRef(null);
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const current = Math.min(page, pages);
  const start = (current - 1) * perPage;
  const rows = list.slice(start, start + perPage);

  useEffect(() => {
    setPage(1);
    setMinHeight(0);
  }, [resetKey]);

  // Measure a full page once per list. The box's min-height counts its border
  // (border-box below); measuring with offsetHeight while min-height was
  // content-box made the box grow 2px on every render until React gave up.
  useLayoutEffect(() => {
    if (rows.length === perPage && boxRef.current) {
      const h = Math.ceil(boxRef.current.getBoundingClientRect().height);
      setMinHeight((old) => (h > old + 1 ? h : old));
    }
  });

  const go = (n) => {
    setPage(n);
    boxRef.current?.scrollIntoView({ block: 'nearest' });
  };

  return {
    rows,
    boxRef,
    boxStyle: pages > 1 && minHeight ? { minHeight, boxSizing: 'border-box' } : undefined,
    pager: { page: current, pages, start, shown: rows.length, total: list.length, go },
  };
}

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const out = [];
  let last = 0;
  for (const n of [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)) {
    if (n - last > 1) out.push(`gap${n}`);
    out.push(n);
    last = n;
  }
  return out;
}

export default function Pager({ page, pages, start, shown, total, go }) {
  const { t } = useLang();
  if (total === 0) return null;
  return (
    <nav className="pager" aria-label={t('adm.pager.label')}>
      <span className="pager__count">{t('adm.pager.showing', { from: start + 1, to: start + shown, total })}</span>
      <button type="button" disabled={page === 1} onClick={() => go(page - 1)} aria-label={t('adm.pager.prev')}>‹</button>
      {pageList(page, pages).map((n) =>
        typeof n === 'string' ? (
          <span key={n} className="pager__gap">…</span>
        ) : (
          <button key={n} type="button" className={n === page ? 'on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => go(n)}>
            {n}
          </button>
        ),
      )}
      <button type="button" disabled={page === pages} onClick={() => go(page + 1)} aria-label={t('adm.pager.next')}>›</button>
    </nav>
  );
}
