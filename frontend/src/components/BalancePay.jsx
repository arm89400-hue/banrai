import { useState } from 'react';
import { formatBaht } from '../lib/money';
import { payCode } from '../lib/payments';
import { useLang } from '../i18n/lang';
import PaymentPanel from './PaymentPanel';
import './PaymentPanel.css';

// The other half of the price, once the deposit is paid. The guest can pay
// it online now (a QR fixed to the amount left) or at the farm, where the
// owner marks it paid in admin. Shown once per group of rooms booked
// together (`rooms` = how many it covers).
export default function BalancePay({ booking, rooms = 1, pay, onPaid }) {
  const { t } = useLang();
  const [open, setOpen] = useState(booking.balance_slip_status === 'review');
  const due = Number(booking.balance_due);
  if (!(due > 0)) return null;

  return (
    <section className="balance-pay" aria-label={t('balance.title')}>
      <div className="balance-pay__head">
        <div>
          <p className="balance-pay__label">{t('balance.title')}</p>
          <p className="balance-pay__amount">{formatBaht(due)}</p>
        </div>
        {!open && (
          <button type="button" className="bk-btn bk-btn--primary" onClick={() => setOpen(true)}>
            {t('balance.payOnline')}
          </button>
        )}
      </div>
      <p className="balance-pay__text">{t('balance.choices')}</p>
      {open && (
        <PaymentPanel
          booking={booking}
          kind="balance"
          amount={due}
          code={payCode(booking)}
          rooms={rooms}
          slipStatus={booking.balance_slip_status}
          slipReason={booking.balance_slip_reason}
          {...pay}
          onPaid={onPaid}
        />
      )}
    </section>
  );
}

// "Paid in full" once the other half is in.
export function BalancePaid({ booking }) {
  const { t } = useLang();
  if (!booking.balance_paid_at) return null;
  return (
    <p className="balance-pay__done">
      ✓ {t(booking.balance_method === 'at_farm' ? 'balance.paidFarm' : 'balance.paidOnline')}
    </p>
  );
}
