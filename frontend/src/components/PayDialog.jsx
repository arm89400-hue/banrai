import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { nightsBetween, roomNames } from '../lib/booking';
import { promptPayPayload } from '../lib/promptpay';
import { SAMPLE_QR_TEXT, errorKey, groupStays, owes, payCode } from '../lib/payments';
import { useLang } from '../i18n/lang';
import { useGlide } from '../lib/glide';
import { addToCalendar } from '../lib/calendar';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import Baht from './Baht';
import { useContact } from '../lib/contact';
import { confirmationData, saveConfirmation as saveConfirmationImage } from '../lib/confirmationImage';
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [slip, setSlip] = useState(null);
  const switchRef = useRef(null);
  useGlide(switchRef, payFull);
  const onPhone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const contact = useContact();
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
      setSlip(null);
    } finally {
      setBusy(false);
    }
  }

  function uploadSlip(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSlip((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    send(`/api/bookings/${lead.id}/slip?kind=${kind}`, {
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
  }

  // Right after paying, the list may not have caught up yet: count what was just paid.
  const note =
    done && stay
      ? confirmationData({ stay: stay.status === 'confirmed' ? stay : { ...stay, status: 'confirmed' }, t, lang, locale, contact })
      : null;

  async function saveConfirmation() {
    if (saving || !note) return;
    setSaving(true);
    try {
      await saveConfirmationImage(note);
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } finally {
      setSaving(false);
    }
  }

  function saveToCalendar() {
    addToCalendar({
      code,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      inTime: CHECK_IN_TIME,
      outTime: CHECK_OUT_TIME,
      title: `${t('conf.farm')} · ${code}`,
      details: [note.see, note.times, contact.phones.map((p) => `${p.name[lang]} ${p.display}`).join(' · ')].join('\n'),
      location: contact.maps,
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
      <div className={`pay-dialog__box${done ? ' is-done' : ''}`}>
        {!done && (
          <header className="pay-dialog__head">
            <h2 id="pay-dialog-title">
              {t('flow.doneTitle')}
              <small>{sub}</small>
            </h2>
          </header>
        )}

        <div className="pay-dialog__body">
          <div className="pay-dialog__pay" aria-hidden={done} inert={done}>
            {/* Where the guest is: choose, pay in the bank app, send the slip. */}
            <ol className="pay-steps">
              {[t('pay.dlgStep1'), t('pay.dlgStep2'), opn ? t('pay.dlgStep3Auto') : t('pay.dlgStep3')].map((label, i) => {
                const now = busy || waiting || (opn && opnCharge.charge) ? 2 : 1;
                const state = i < now ? 'done' : i === now ? 'now' : 'next';
                return (
                  <li key={label} className={`is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
                    <span aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
                    {label}
                  </li>
                );
              })}
            </ol>

            {full > deposit && (
              <div ref={switchRef} className="pay-dialog__switch" role="radiogroup" aria-label={t('pay.chooseLabel')}>
                <span className="glide" aria-hidden="true" />
                {[
                  [false, t('pay.optDeposit'), deposit],
                  [true, t('pay.optFull'), full],
                ].map(([value, label, sum]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={payFull === value}
                    aria-pressed={payFull === value}
                    className={payFull === value ? 'is-on' : ''}
                    disabled={busy || opnCharge.making}
                    onClick={() => {
                      setPayFull(value);
                      setError(null);
                    }}
                  >
                    <span>{label}</span>
                    <b>{formatBaht(sum)}</b>
                  </button>
                ))}
              </div>
            )}

            <div className="pay-dialog__card">
              <p className="pay-dialog__bar">PromptPay</p>
              <div className={`pay-dialog__qr${sample ? ' is-sample' : ''}${qrGone ? ' is-gone' : ''}`}>
                {qrShown && <img key={qrShown.slice(-40)} src={qrShown} alt={sample ? t('pay.sampleAlt') : t('pay.qrAlt', { amount: formatBaht(amount) })} />}
                {sample && <span className="pay-dialog__stamp">{t('pay.sampleStamp')}</span>}
              </div>
              <p className="pay-dialog__amount">
                <Baht value={amount} />
              </p>
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
              {onPhone && qrShown && !sample && !qrGone && <p className="pay-dialog__phonehint">{t('pay.phoneHint')}</p>}
            </div>

            {opn ? (
              <OpnStatus making={opnCharge.making} gone={qrGone} failed={Boolean(opnCharge.error)} onNew={opnCharge.renew} />
            ) : (
              <>
                {waiting && <p className="pay-dialog__wait">{t('pay.waiting')}</p>}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadSlip} />
                <button type="button" className="pay-dialog__upload" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {busy && slip ? (
                    <span className="pay-slip" aria-hidden="true">
                      <img src={slip} alt="" />
                      <span className="pay-slip__scan" />
                    </span>
                  ) : busy ? (
                    <span className="pay-dialog__spin" aria-hidden="true" />
                  ) : null}
                  {busy ? t(pay.slipCheck === 'auto' ? 'pay.checking' : 'pay.sending') : t(waiting ? 'pay.uploadAgain' : 'pay.dlgUpload')}
                </button>
              </>
            )}
            {!busy && (
              <button type="button" className="pay-dialog__later" onClick={() => navigate('/booking')}>
                {t('pay.later')}
              </button>
            )}
            {shownError && (
              <p className="bk-error pay-dialog__error" role="alert">
                {t(shownError, { amount: formatBaht(amount) })}
              </p>
            )}
          </div>

          {done && note && (
            <div className="pay-dialog__done">
              <div className="pay-done__photo">
                <img src="/images/farm/sign.jpg" alt="" />
                <button type="button" className="pay-done__x" onClick={() => navigate('/booking')} aria-label={t('pay.dlgClose')}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <div className="pay-done__body">
                <span className="pay-done__tick" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" />
                  </svg>
                </span>
                <p className="pay-done__status">
                  {paid
                    ? t('pay.donePaid', {
                        amount: formatBaht(paid.amount),
                        kind: paid.kind === 'full' ? t('pay.optFull') : t('pay.optDeposit'),
                      })
                    : t('pay.slipStatus')}
                </p>
                {note.dear && <p className="pay-done__dear">{note.dear}</p>}
                <h2 id="pay-dialog-title">{note.see}</h2>
                <p className="pay-done__times">{note.times}</p>

                <dl className="pay-done__facts">
                  <div>
                    <dt>{note.codeLabel}</dt>
                    <dd className="pay-done__code">{note.code}</dd>
                  </div>
                  <div>
                    <dt>{note.facts.at(-1)[0]}</dt>
                    <dd className="pay-done__left">{note.facts.at(-1)[1]}</dd>
                  </div>
                </dl>
                <button type="button" className="pay-done__cal" onClick={saveToCalendar}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16v13H4zM4 11h16M8 3v4M16 3v4M12 14v4M10 16h4" />
                  </svg>
                  {t('conf.calendar')}
                </button>
              </div>

              <div className="pay-dialog__btns">
                <button type="button" className="pay-dialog__home" onClick={() => navigate('/booking')}>
                  {t('pay.dlgMine')}
                </button>
                <button
                  type="button"
                  className={`pay-dialog__save${saved ? ' is-saved' : ''}`}
                  onClick={saveConfirmation}
                  disabled={saving}
                  aria-busy={saving}
                >
                  {!saved && (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                    </svg>
                  )}
                  {saving ? t('conf.saving') : saved ? `✓ ${t('conf.savedOk')}` : t('pay.dlgSave')}
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
