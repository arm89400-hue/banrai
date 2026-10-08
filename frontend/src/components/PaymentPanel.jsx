import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { promptPayPayload } from '../lib/promptpay';
import { useLang } from '../i18n/lang';
import './PaymentPanel.css';

const SCAN_MS = 1100; // how long the pretend scan runs (test mode)
const PAID_MS = 900; // how long "Payment complete" shows before the page updates
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Slip errors the server explains with a reason code.
const SLIP_ERRORS = new Set([
  'SLIP_UNREADABLE',
  'SLIP_NOT_FOUND',
  'SLIP_PENDING',
  'SLIP_DUPLICATE',
  'SLIP_AMOUNT',
  'SLIP_RECEIVER',
  'SLIP_OLD',
  'SLIP_SERVICE',
  'SLIP_NOT_CONFIGURED',
  'SLIP_TOO_MANY',
]);
const errorKey = (reason) =>
  reason === 'NOT_PENDING' ? 'pay.errNotPending' : SLIP_ERRORS.has(reason) ? `pay.err.${reason}` : 'pay.errGeneric';

// A QR-looking pattern made from the booking code, for test mode only -
// not a real QR code.
function FakeQr({ seed }) {
  const size = 21;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) % 100;
  };
  const inFinder = (x, y) => (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9);
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inFinder(x, y) && next() < 48) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  const finder = (x, y) => (
    <g key={`f${x}${y}`}>
      <rect x={x} y={y} width="7" height="7" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="var(--white)" />
      <rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  );
  return (
    <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      <rect x="-1" y="-1" width={size + 2} height={size + 2} fill="var(--white)" />
      {cells}
      {finder(0, 0)}
      {finder(size - 7, 0)}
      {finder(0, size - 7)}
    </svg>
  );
}

// Deposit payment for one pending room booking.
// - `promptpay` set: a real PromptPay QR with the deposit filled in.
// - `slipPay`: the guest uploads the transfer slip. `slipCheck` 'auto'
//   (SlipOK) confirms a good slip straight away; 'manual' leaves it for the
//   owner to approve in admin, and the panel says it is waiting.
// - No PromptPay but `testPay`: a test QR that "scans" and marks it paid.
// onPaid receives the updated booking (confirmed, or with its slip waiting).
export default function PaymentPanel({ booking, testPay, slipPay, slipCheck = 'manual', promptpay, onPaid }) {
  const { t } = useLang();
  const [phase, setPhase] = useState('idle'); // idle | scanning | checking | paid
  const [error, setError] = useState(null);
  const [qrSrc, setQrSrc] = useState(null);
  const fileRef = useRef(null);

  // Draw the PromptPay QR for this booking's deposit.
  useEffect(() => {
    if (!promptpay) return undefined;
    let live = true;
    QRCode.toDataURL(promptPayPayload(promptpay, booking.deposit), { margin: 1, width: 360, errorCorrectionLevel: 'M' })
      .then((src) => live && setQrSrc(src))
      .catch(() => live && setQrSrc(null));
    return () => {
      live = false;
    };
  }, [promptpay, booking.deposit]);

  async function finish(data) {
    setPhase('paid');
    await wait(PAID_MS);
    onPaid(data.booking);
  }

  // Test mode: pretend to scan, then mark the deposit paid.
  async function testPayNow() {
    if (phase !== 'idle') return;
    setPhase('scanning');
    setError(null);
    try {
      const [data] = await Promise.all([api(`/api/bookings/${booking.id}/pass-pay`, { method: 'POST' }), wait(SCAN_MS)]);
      await finish(data);
    } catch (err) {
      setPhase('idle');
      setError(errorKey(err.reason));
    }
  }

  // Real payment: send the transfer slip to be checked.
  async function uploadSlip(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || phase !== 'idle') return;
    setPhase('checking');
    setError(null);
    try {
      const data = await api(`/api/bookings/${booking.id}/slip`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (data.review) {
        // Saved for the owner to check: no "paid" yet.
        setPhase('idle');
        onPaid(data.booking);
      } else {
        await finish(data);
      }
    } catch (err) {
      setPhase('idle');
      setError(errorKey(err.reason));
    }
  }

  const fakeQr = !promptpay && testPay;
  const waiting = booking.slip_status === 'review';
  const turnedDown = booking.slip_status === 'rejected' && booking.slip_reason === 'MANUAL_REJECT';
  const qrLabel = phase === 'scanning' ? t('pay.scanning') : phase === 'paid' ? t('pay.paid') : t('pay.qrTap');

  return (
    <section className="pay-panel" aria-labelledby={`pay-title-${booking.id}`}>
      {promptpay ? (
        <div className={`pay-panel__qr pay-panel__qr--real is-${phase}`}>
          <span className="pay-panel__pp">PromptPay</span>
          <span className="pay-panel__code">
            {qrSrc ? <img src={qrSrc} alt={t('pay.qrAlt', { amount: formatBaht(booking.deposit) })} /> : <span className="pay-panel__qr-wait" />}
            {phase === 'paid' && (
              <span className="pay-panel__tick" aria-hidden="true">
                ✓
              </span>
            )}
          </span>
        </div>
      ) : fakeQr ? (
        <button
          type="button"
          className={`pay-panel__qr pay-panel__qr--live is-${phase}`}
          onClick={testPayNow}
          disabled={phase !== 'idle'}
          aria-label={qrLabel}
        >
          <span className="pay-panel__code">
            <FakeQr seed={booking.code} />
            {phase === 'scanning' && <span className="pay-panel__scanline" aria-hidden="true" />}
            {phase === 'paid' && (
              <span className="pay-panel__tick" aria-hidden="true">
                ✓
              </span>
            )}
          </span>
          <span className="pay-panel__qr-label" aria-live="polite">
            {qrLabel}
          </span>
        </button>
      ) : (
        <div className="pay-panel__qr" role="img" aria-label={t('pay.qrSoon')}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
          </svg>
          <span>{t('pay.qrSoon')}</span>
        </div>
      )}

      <div className="pay-panel__info">
        <p className="pay-panel__title" id={`pay-title-${booking.id}`}>
          {t('pay.title')}
        </p>
        <p className="pay-panel__amount">{formatBaht(booking.deposit)}</p>
        <p className="pay-panel__ref">{t('pay.ref', { code: booking.code })}</p>

        {slipPay ? (
          <>
            {waiting ? (
              <p className="pay-panel__waiting">
                <span aria-hidden="true">⏳</span> {t('pay.waiting')}
              </p>
            ) : (
              <ol className="pay-panel__steps">
                <li>{promptpay ? t('pay.step1') : t('pay.step1NoQr')}</li>
                <li>{slipCheck === 'auto' ? t('pay.step2') : t('pay.step2Manual')}</li>
              </ol>
            )}
            {turnedDown && <p className="bk-error">{t('pay.err.MANUAL_REJECT')}</p>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadSlip} />
            <button
              type="button"
              className="bk-btn bk-btn--sun pay-panel__upload"
              onClick={() => fileRef.current?.click()}
              disabled={phase !== 'idle'}
            >
              {phase === 'checking' ? (
                <>
                  <span className="pay-panel__spin" aria-hidden="true" />
                  {slipCheck === 'auto' ? t('pay.checking') : t('pay.sending')}
                </>
              ) : phase === 'paid' ? (
                `✓ ${t('pay.slipOk')}`
              ) : waiting || turnedDown ? (
                t('pay.uploadAgain')
              ) : (
                t('pay.upload')
              )}
            </button>
          </>
        ) : (
          <p className="pay-panel__hint">{promptpay ? t('pay.step1') : t('pay.callUs')}</p>
        )}

        {testPay && !fakeQr && (
          <button type="button" className="pay-panel__testlink" onClick={testPayNow} disabled={phase !== 'idle'}>
            {t('pay.testButton')}
          </button>
        )}
        {testPay && (
          <div className="pay-panel__test">
            <span className="pay-panel__tag">{t('pay.testTag')}</span>
          </div>
        )}
        <p className="pay-panel__status" aria-live="polite">
          {error && (
            <span className="bk-error" role="alert">
              {t(error)}
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
