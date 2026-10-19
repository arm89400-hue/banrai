import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { formatDay, nightsBetween, roomNames } from '../lib/booking';
import { promptPayPayload } from '../lib/promptpay';
import { SAMPLE_QR_TEXT, errorKey, groupStays, owes, payCode } from '../lib/payments';
import { CHECK_IN_TIME, CHECK_OUT_TIME, THAI_NAME } from '../lib/site';
import { useLang } from '../i18n/lang';
import './PayDialog.css';

export default function PayDialog({ bookings, pay, onPaid }) {
  const { t, lang, locale } = useLang();
  const navigate = useNavigate();
  const stay = groupStays(bookings)[0];
  const lead = stay?.bookings.find((b) => owes(b, 'deposit'));
  const [payFull, setPayFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [qrSrc, setQrSrc] = useState(null);
  const [paid, setPaid] = useState(null);
  const fileRef = useRef(null);

  const deposit = Number(lead?.deposit_due ?? stay?.deposit ?? 0);
  const full = Number(lead?.full_due ?? stay?.total ?? 0);
  const kind = payFull && full > deposit ? 'full' : 'deposit';
  const amount = kind === 'full' ? full : deposit;
  const done = Boolean(paid) || stay?.status === 'confirmed';
  const opn = pay.qrPay === 'opn';
  const opnCharge = useOpnCharge({
    bookingId: lead?.id,
    kind,
    enabled: opn && !done,
    onPaid: (data) => {
      setPaid({ amount, kind });
      onPaid(data.bookings ?? [data.booking]);
    },
  });

  const code = stay ? payCode(stay.lead) : '';
  const liveRooms = (stay?.bookings ?? []).filter((b) => b.status !== 'cancelled');
  const rooms = liveRooms.map((b) => roomNames(b.room_name, lang).title).join(', ');
  const nights = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 0;
  const sub = `${code} · ${rooms} · ${t('pay.dlgNights', { n: nights })}`;

  useEffect(() => {
    if (opn) return undefined;
    let live = true;
    const text = pay.promptpay ? promptPayPayload(pay.promptpay, amount) : SAMPLE_QR_TEXT;
    qrWithLogo(text)
      .then((src) => live && setQrSrc(src))
      .catch(() => live && setQrSrc(null));
    return () => {
      live = false;
    };
  }, [opn, pay.promptpay, amount]);

  useEffect(() => {
    const onKey = (e) => done && e.key === 'Escape' && navigate('/booking');
    document.addEventListener('keydown', onKey);
    document.body.classList.add('has-dialog');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-dialog');
    };
  }, [navigate, done]);

  async function send(path, init) {
    if (busy || !lead) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api(path, { method: 'POST', ...init });
      if (!data.review) setPaid({ amount, kind });
      onPaid(data.bookings ?? [data.booking]);
    } catch (err) {
      setError(errorKey(err.reason));
    } finally {
      setBusy(false);
    }
  }

  function uploadSlip(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    send(`/api/bookings/${lead.id}/slip?kind=${kind}`, {
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
  }

  function saveConfirmation() {
    const paidKind = paid?.kind ?? 'deposit';
    drawConfirmation({
      code,
      rows: [
        [t('review.room'), rooms],
        [t('sum.checkIn'), `${formatDay(stay.checkIn, locale)} · ${CHECK_IN_TIME}`],
        [t('sum.checkOut'), `${formatDay(stay.checkOut, locale)} · ${CHECK_OUT_TIME}`],
        [t('pay.slipAmount'), `${formatBaht(paid?.amount ?? stay.deposit)} · ${paidKind === 'full' ? t('pay.optFull') : t('pay.optDeposit')}`],
      ],
      title: THAI_NAME,
      status: t('pay.slipStatus'),
    });
  }

  if (!stay) return null;
  const waiting = !opn && !done && lead?.slip_status === 'review';
  const sample = !opn && !pay.promptpay;
  const qrShown = opn ? opnCharge.charge?.qr : qrSrc;
  const qrGone = opn && ['expired', 'failed'].includes(opnCharge.charge?.status);
  const shownError = opn ? opnCharge.error : error;

  return createPortal(
    <div className="pay-dialog" role="dialog" aria-modal="true" aria-labelledby="pay-dialog-title">
      <div className="pay-dialog__box">
        <header className="pay-dialog__head">
          <h2 id="pay-dialog-title">
            {done ? t('pay.dlgDoneTitle') : t('flow.doneTitle')}
            <small>{sub}</small>
          </h2>
          {done && (
            <button type="button" className="pay-dialog__x" onClick={() => navigate('/booking')} aria-label={t('pay.dlgClose')}>
              ×
            </button>
          )}
        </header>

        <div className="pay-dialog__body">
          <div className="pay-dialog__pay" aria-hidden={done} inert={done}>
            <div className="pay-dialog__card">
              <p className="pay-dialog__bar">PromptPay</p>
              <div className={`pay-dialog__qr${sample ? ' is-sample' : ''}${qrGone ? ' is-gone' : ''}`}>
                {qrShown && <img src={qrShown} alt={sample ? t('pay.sampleAlt') : t('pay.qrAlt', { amount: formatBaht(amount) })} />}
                {sample && <span className="pay-dialog__stamp">{t('pay.sampleStamp')}</span>}
              </div>
              <p className="pay-dialog__amount">{formatBaht(amount)}</p>
              <p className="pay-dialog__for">
                {kind === 'full'
                  ? t('pay.forFull', { n: liveRooms.length })
                  : t('pay.forDeposit', { n: liveRooms.length, total: formatBaht(full) })}
              </p>
              {liveRooms.length > 1 && (
                <dl className="pay-dialog__rooms">
                  {liveRooms.map((b) => (
                    <div key={b.id}>
                      <dt>
                        {roomNames(b.room_name, lang).title}
                        <small>
                          {' '}
                          · {t('sum.guestCount', { n: b.guests })} · {t('pay.dlgNights', { n: nights })}
                        </small>
                      </dt>
                      <dd className="num">{formatBaht(Number(b.total))}</dd>
                    </div>
                  ))}
                  <div className="pay-dialog__rooms-total">
                    <dt>{t('pay.roomsTotal', { n: liveRooms.length })}</dt>
                    <dd className="num">{formatBaht(full)}</dd>
                  </div>
                </dl>
              )}
              {qrShown && !sample && !qrGone && (
                <a className="pay-dialog__saveqr" href={qrShown} download={`baanrai-qr-${code}.png`} target="_blank" rel="noreferrer">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                  </svg>
                  {t('pay.saveQr')}
                </a>
              )}
            </div>

            {full > deposit && (
              <div className="pay-dialog__switch" role="radiogroup" aria-label={t('pay.chooseLabel')}>
                {[
                  [false, `${t('pay.optDeposit')} ${formatBaht(deposit)}`],
                  [true, `${t('pay.optFull')} ${formatBaht(full)}`],
                ].map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={payFull === value}
                    className={payFull === value ? 'is-on' : ''}
                    disabled={busy || opnCharge.making}
                    onClick={() => {
                      setPayFull(value);
                      setError(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {opn ? (
              <OpnStatus making={opnCharge.making} gone={qrGone} failed={Boolean(opnCharge.error)} onNew={opnCharge.renew} />
            ) : (
              <>
                {waiting && <p className="pay-dialog__wait">{t('pay.waiting')}</p>}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadSlip} />
                <button type="button" className="pay-dialog__upload" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {busy ? <span className="pay-dialog__spin" aria-hidden="true" /> : null}
                  {busy ? t(pay.slipCheck === 'auto' ? 'pay.checking' : 'pay.sending') : t(waiting ? 'pay.uploadAgain' : 'pay.dlgUpload')}
                </button>
              </>
            )}
            {shownError && (
              <p className="bk-error pay-dialog__error" role="alert">
                {t(shownError, { amount: formatBaht(amount) })}
              </p>
            )}
          </div>

          {done && (
            <div className="pay-dialog__done">
              <span className="pay-dialog__tick" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <h3>{t('pay.dlgPaid')}</h3>
              <p>{t('pay.dlgConfirmed')}</p>
              {paid && (
                <span className="pay-dialog__paid">
                  {formatBaht(paid.amount)} · {paid.kind === 'full' ? t('pay.optFull') : t('pay.optDeposit')}
                </span>
              )}
              <div className="pay-dialog__btns">
                <button type="button" className="pay-dialog__home" onClick={() => navigate('/home')}>
                  {t('pay.dlgHome')}
                </button>
                <button type="button" className="pay-dialog__save" onClick={saveConfirmation}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                  </svg>
                  {t('pay.dlgSave')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function OpnStatus({ making, gone, failed, onNew }) {
  const { t } = useLang();
  if (gone || failed) {
    return (
      <>
        {gone && <p className="pay-dialog__wait">{t('pay.qrExpired')}</p>}
        <button type="button" className="pay-dialog__upload" onClick={onNew}>
          {t('pay.qrNew')}
        </button>
      </>
    );
  }
  return (
    <p className="pay-dialog__waiting" aria-live="polite">
      <span className="pay-dialog__spin" aria-hidden="true" />
      {making ? t('pay.qrMaking') : t('pay.qrWait')}
    </p>
  );
}

const POLL_MS = 3000;
function useOpnCharge({ bookingId, kind, enabled, onPaid }) {
  const [charge, setCharge] = useState(null);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState(null);
  const [round, setRound] = useState(0);
  const paidRef = useRef(onPaid);
  useEffect(() => {
    paidRef.current = onPaid;
  });

  useEffect(() => {
    if (!enabled || !bookingId) return undefined;
    let live = true;
    setCharge(null);
    setMaking(true);
    setError(null);
    api(`/api/pay/${bookingId}/qr?kind=${kind}`, { method: 'POST' })
      .then((data) => live && setCharge({ id: data.charge, qr: data.qr, status: 'pending' }))
      .catch((err) => live && setError(errorKey(err.reason)))
      .finally(() => live && setMaking(false));
    return () => {
      live = false;
    };
  }, [enabled, bookingId, kind, round]);

  const chargeId = charge?.status === 'pending' ? charge.id : null;
  useEffect(() => {
    if (!enabled || !chargeId) return undefined;
    const timer = setInterval(async () => {
      try {
        const data = await api(`/api/pay/charges/${chargeId}`);
        if (data.status === 'successful') {
          clearInterval(timer);
          paidRef.current(data);
        } else if (data.status !== 'pending') {
          clearInterval(timer);
          setCharge((c) => ({ ...c, status: data.status }));
        }
      } catch {
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, chargeId]);

  return { charge, making, error, renew: () => setRound((n) => n + 1) };
}

const LOGO_SRC = '/images/logo-mark.png';
async function qrWithLogo(text) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, text, { margin: 1, width: 480, errorCorrectionLevel: 'H', color: { dark: '#16231b', light: '#ffffff' } });
  const logo = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = LOGO_SRC;
  });
  if (logo) {
    const c = canvas.getContext('2d');
    const size = Math.round(canvas.width * 0.22);
    const at = Math.round((canvas.width - size) / 2);
    const pad = Math.round(size * 0.1);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(canvas.width / 2, canvas.width / 2, size / 2 + pad, 0, Math.PI * 2);
    c.fill();
    c.drawImage(logo, at, at, size, size);
  }
  return canvas.toDataURL('image/png');
}

function drawConfirmation({ code, rows, title, status }) {
  const W = 720;
  const H = 300 + rows.length * 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  const font = getComputedStyle(document.body).fontFamily;
  c.fillStyle = '#f9f7f2';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#25543f';
  c.fillRect(0, 0, W, 96);
  c.fillStyle = '#ffffff';
  c.font = `600 30px ${font}`;
  c.fillText(title, 40, 60);

  c.fillStyle = '#e4f0ea';
  c.beginPath();
  c.arc(78, 168, 38, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#2e6b50';
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(60, 170);
  c.lineTo(73, 183);
  c.lineTo(97, 155);
  c.stroke();
  c.fillStyle = '#1f2b22';
  c.font = `700 34px ${font}`;
  c.fillText(status, 136, 162);
  c.fillStyle = '#5b5550';
  c.font = `500 26px ${font}`;
  c.fillText(code, 136, 198);

  rows.forEach(([label, value], i) => {
    const y = 270 + i * 64;
    c.fillStyle = '#e3ddd3';
    c.fillRect(40, y - 40, W - 80, 1);
    c.fillStyle = '#5b5550';
    c.font = `400 24px ${font}`;
    c.fillText(label, 40, y);
    c.fillStyle = '#1f2b22';
    c.font = `600 24px ${font}`;
    c.textAlign = 'right';
    c.fillText(value, W - 40, y, W - 280);
    c.textAlign = 'left';
  });

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `baanrai-${code}.png`;
  link.click();
}
