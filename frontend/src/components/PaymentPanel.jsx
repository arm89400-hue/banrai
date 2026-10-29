import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { promptPayPayload } from '../lib/promptpay';
import { useLang } from '../i18n/lang';
import { SAMPLE_QR_TEXT, errorKey } from '../lib/payments';
import './PaymentPanel.css';

const PAID_MS = 900;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function PaymentPanel({
  booking,
  kind: givenKind = 'deposit',
  amount: givenAmount,
  fullAmount,
  code,
  rooms = 1,
  slipStatus,
  slipReason,
  testPay,
  slipPay,
  slipCheck = 'manual',
  promptpay,
  promptpayName,
  onPaid,
}) {
  const { t } = useLang();
  const canPayFull = givenKind === 'deposit' && fullAmount > givenAmount;
  const [payFull, setPayFull] = useState(false);
  const kind = canPayFull && payFull ? 'full' : givenKind;
  const amount = canPayFull && payFull ? fullAmount : givenAmount;
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState(null);
  const [qrSrc, setQrSrc] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let live = true;
    const text = promptpay ? promptPayPayload(promptpay, amount) : SAMPLE_QR_TEXT;
    QRCode.toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
      .then((src) => live && setQrSrc(src))
      .catch(() => live && setQrSrc(null));
    return () => {
      live = false;
    };
  }, [promptpay, amount]);

  const updated = (data) => data.bookings ?? [data.booking];

  async function finish(data) {
    setPhase('paid');
    await wait(PAID_MS);
    onPaid(updated(data));
  }

  async function testPayNow() {
    if (phase !== 'idle') return;
    setPhase('checking');
    setError(null);
    try {
      await finish(await api(`/api/bookings/${booking.id}/pass-pay?kind=${kind}`, { method: 'POST' }));
    } catch (err) {
      setPhase('idle');
      setError(errorKey(err.reason));
    }
  }

  async function uploadSlip(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || phase !== 'idle') return;
    setPhase('checking');
    setError(null);
    try {
      const data = await api(`/api/bookings/${booking.id}/slip?kind=${kind}`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (data.review) {
        setPhase('idle');
        onPaid(updated(data));
      } else {
        await finish(data);
      }
    } catch (err) {
      setPhase('idle');
      setError(errorKey(err.reason));
    }
  }

  const waiting = slipStatus === 'review';
  const turnedDown = slipStatus === 'rejected' && slipReason === 'MANUAL_REJECT';
  const title = { deposit: t('pay.title'), full: t('pay.titleFull'), balance: t('pay.titleBalance') }[kind];
  const steps = promptpay
    ? [t('pay.howSave'), t('pay.step1'), slipCheck === 'auto' ? t('pay.step2') : t('pay.step2Manual')]
    : [t('pay.step1NoQr'), slipCheck === 'auto' ? t('pay.step2') : t('pay.step2Manual')];

  return (
    <section className="pay-panel" aria-labelledby={`pay-title-${givenKind}-${booking.id}`}>
      <div className={`pay-panel__qr pay-panel__qr--real ${promptpay ? '' : 'pay-panel__qr--sample'} is-${phase}`}>
        <span className="pay-panel__pp">{promptpay ? 'PromptPay' : t('pay.sample')}</span>
        <span className="pay-panel__code">
          {qrSrc ? (
            <img
              src={qrSrc}
              alt={promptpay ? t('pay.qrAlt', { amount: formatBaht(amount) }) : t('pay.sampleAlt')}
            />
          ) : (
            <span className="pay-panel__qr-wait" />
          )}
          {!promptpay && (
            <span className="pay-panel__stamp" aria-hidden="true">
              {t('pay.sampleStamp')}
            </span>
          )}
          {phase === 'paid' && (
            <span className="pay-panel__tick" aria-hidden="true">
              ✓
            </span>
          )}
        </span>
      </div>

      <div className="pay-panel__info">
        {canPayFull && (
          <div className="pay-panel__choice" role="radiogroup" aria-label={t('pay.chooseLabel')}>
            {[
              [false, t('pay.optDeposit'), givenAmount],
              [true, t('pay.optFull'), fullAmount],
            ].map(([full, label, value]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={payFull === full}
                className={payFull === full ? 'is-on' : ''}
                disabled={phase !== 'idle'}
                onClick={() => {
                  setPayFull(full);
                  setError(null);
                }}
              >
                <span>{label}</span>
                <b>{formatBaht(value)}</b>
              </button>
            ))}
          </div>
        )}
        <p className="pay-panel__title" id={`pay-title-${givenKind}-${booking.id}`}>
          {title} · {code}
          {rooms > 1 && ` · ${t('pay.rooms', { n: rooms })}`}
        </p>
        <p className="pay-panel__amount">{formatBaht(amount)}</p>
        {promptpay && promptpayName && <p className="pay-panel__to">{t('pay.to', { name: promptpayName })}</p>}
        {!promptpay && <p className="pay-panel__sample-note">{t('pay.sampleNote')}</p>}

        {slipPay ? (
          <>
            {waiting ? (
              <p className="pay-panel__waiting">
                <span aria-hidden="true">⏳</span> {t('pay.waiting')}
              </p>
            ) : (
              <ol className="pay-panel__steps">
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {turnedDown && <p className="bk-error">{t('pay.err.MANUAL_REJECT')}</p>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadSlip} />
            <div className="pay-panel__actions">
              {promptpay && qrSrc && (
                <a className="pay-panel__save" href={qrSrc} download={`baanrai-qr-${code}.png`}>
                  {t('pay.saveQr')}
                </a>
              )}
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
            </div>
          </>
        ) : (
          <p className="pay-panel__hint">{promptpay ? t('pay.step1') : t('pay.callUs')}</p>
        )}

        {testPay && (
          <div className="pay-panel__test">
            <button type="button" className="pay-panel__testlink" onClick={testPayNow} disabled={phase !== 'idle'}>
              {t('pay.testButton')}
            </button>
            <span className="pay-panel__tag">{t('pay.testTag')}</span>
          </div>
        )}
        <p className="pay-panel__status" aria-live="polite">
          {error && (
            <span className="bk-error" role="alert">
              {t(error, { amount: formatBaht(amount) })}
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
