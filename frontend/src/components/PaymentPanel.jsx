import { useState } from 'react';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { useLang } from '../i18n/lang';
import './PaymentPanel.css';

// Deposit payment for one pending room booking: where the PromptPay QR will
// go (a placeholder for now) and the amount to pay. While the backend is in
// test mode (`testPay`), a "PassPay" button marks the deposit as paid; it
// calls onPaid with the updated (confirmed) booking.
export default function PaymentPanel({ booking, testPay, onPaid }) {
  const { t } = useLang();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);

  async function passPay() {
    setPaying(true);
    setError(null);
    try {
      const data = await api(`/api/bookings/${booking.id}/pass-pay`, { method: 'POST' });
      onPaid(data.booking);
    } catch (err) {
      setError(err.reason === 'NOT_PENDING' ? 'pay.errNotPending' : 'pay.errGeneric');
    } finally {
      setPaying(false);
    }
  }

  return (
    <section className="pay-panel" aria-labelledby={`pay-title-${booking.id}`}>
      <div className="pay-panel__qr" role="img" aria-label={t('pay.qrSoon')}>
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
        </svg>
        <span>{t('pay.qrSoon')}</span>
      </div>

      <div className="pay-panel__info">
        <p className="pay-panel__title" id={`pay-title-${booking.id}`}>
          {t('pay.title')}
        </p>
        <p className="pay-panel__amount">{formatBaht(booking.deposit)}</p>
        <p className="pay-panel__ref">{t('pay.ref', { code: booking.code })}</p>
        <p className="pay-panel__hint">{t('pay.hint')}</p>

        {testPay && (
          <div className="pay-panel__test">
            <button type="button" className="bk-btn bk-btn--primary" disabled={paying} onClick={passPay}>
              {paying ? t('pay.paying') : 'PassPay'}
            </button>
            <span className="pay-panel__tag">{t('pay.testTag')}</span>
          </div>
        )}
        {error && (
          <p className="bk-error" role="alert">
            {t(error)}
          </p>
        )}
      </div>
    </section>
  );
}
