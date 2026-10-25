import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/lang';
import { Loading, Sk, SkText } from './Skeleton';
import { useGlide } from '../lib/glide';

// Small building blocks shared by every admin page, so each page is laid out
// the same way: a header with one main action, lists of rows, forms in a side
// drawer, and questions asked in our own dialog instead of the browser's.

// Segmented tabs whose white highlight slides to the tab you pick.
export function Seg({ active, className = '', children, ...rest }) {
  const ref = useRef(null);
  useGlide(ref, active);
  return (
    <div ref={ref} className={`adm-seg ${className}`.trim()} {...rest}>
      <span className="glide" aria-hidden="true" />
      {children}
    </div>
  );
}

export function PageHead({ title, lead, children }) {
  return (
    <header className="adm-head">
      <div className="adm-head__text">
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {children && <div className="adm-head__acts">{children}</div>}
    </header>
  );
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`adm-pill adm-pill--${tone}`}>{children}</span>;
}

export function Empty({ title, hint, children }) {
  return (
    <div className="adm-empty">
      <b>{title}</b>
      {hint && <p>{hint}</p>}
      {children}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <p className="adm-error" role="alert">
      {children}
    </p>
  );
}

// Placeholder rows shaped like the real list rows.
export function RowsSkeleton({ rows = 5, thumb = false, action = true }) {
  const { t } = useLang();
  return (
    <Loading label={t('adm.loading')} className="adm-rows">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="adm-row adm-row--sk">
          {thumb && <Sk className="adm-row__thumb" h="auto" r="10px" />}
          <div className="adm-row__main">
            <Sk w={`${42 - (i % 3) * 8}%`} h="1.05em" />
            <Sk w={`${64 - (i % 2) * 14}%`} h="0.85em" style={{ marginTop: 8 }} />
          </div>
          {action && <Sk w="88px" h="40px" r="999px" />}
        </div>
      ))}
    </Loading>
  );
}

export function PanelSkeleton({ lines = 4 }) {
  const { t } = useLang();
  return (
    <Loading label={t('adm.loading')} className="adm-card adm-card--pad">
      <Sk w="40%" h="1.3em" />
      <div style={{ marginTop: 16 }}>
        <SkText lines={lines} last="45%" />
      </div>
    </Loading>
  );
}

// A form or detail view that slides in from the right edge (from the bottom on
// phones). Its own footer holds the buttons, so they are never covered.
export function Drawer({ title, sub, onClose, onSubmit, footer, children, wide = false, dirty = false }) {
  const { t } = useLang();
  const ref = useRef(null);
  const confirm = useConfirm();

  // A form with unsaved changes asks before it closes, whichever way the
  // owner tries to leave: the X, Cancel, Esc, a click outside, or reloading
  // or closing the tab.
  const requestClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: t('adm.leave.title'),
        body: t('adm.leave.body'),
        cancel: t('adm.leave.stay'),
        ok: t('adm.leave.go'),
        danger: true,
        focusCancel: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Put the cursor in the first field of a form (not on the close button).
    const first = d?.querySelector('.adm-drawer__body :is(input:not([type="checkbox"]):not([type="file"]), textarea, select)');
    if (onSubmit && first) first.focus({ preventScroll: true });
    else d?.querySelector('.adm-drawer__box')?.focus({ preventScroll: true });
    return () => {
      if (d?.open) d.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Box = onSubmit ? 'form' : 'div';
  return (
    <dialog
      ref={ref}
      className={`adm-drawer${wide ? ' adm-drawer--wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => e.target === ref.current && requestClose()}
    >
      <Box className="adm-drawer__box" onSubmit={onSubmit} tabIndex={-1}>
        <header className="adm-drawer__head">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="adm-x" onClick={requestClose} aria-label={t('adm.close')}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="adm-drawer__body">{children}</div>
        {footer && (
          <footer className="adm-drawer__foot">{typeof footer === 'function' ? footer(requestClose) : footer}</footer>
        )}
      </Box>
    </dialog>
  );
}

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const { t } = useLang();
  const [ask, setAsk] = useState(null);
  const resolver = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    if (ask && ref.current && !ref.current.open) ref.current.showModal();
  }, [ask]);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setAsk(typeof opts === 'string' ? { title: opts } : opts);
      }),
    []
  );

  const answer = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    if (ref.current?.open) ref.current.close();
    setAsk(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {ask && (
        <dialog
          ref={ref}
          className={`adm-confirm${ask.danger ? ' is-danger' : ''}`}
          onCancel={(e) => {
            e.preventDefault();
            answer(false);
          }}
        >
          <h2>{ask.title}</h2>
          {ask.body && <p>{ask.body}</p>}
          <div className="adm-confirm__acts">
            <button type="button" className="adm-btn" onClick={() => answer(false)} autoFocus={Boolean(ask.focusCancel)}>
              {ask.cancel ?? t('adm.ask.no')}
            </button>
            <button
              type="button"
              className={`adm-btn ${ask.danger ? 'adm-btn--danger' : 'adm-btn--primary'}`}
              onClick={() => answer(true)}
              autoFocus={!ask.focusCancel}
            >
              {ask.ok ?? t('adm.ask.yes')}
            </button>
          </div>
        </dialog>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  return confirm ?? ((opts) => Promise.resolve(window.confirm(typeof opts === 'string' ? opts : opts.title)));
}
