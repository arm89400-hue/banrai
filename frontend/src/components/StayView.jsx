import { formatBaht } from '../lib/money';
import { formatDayShort, nightsBetween, roomNames } from '../lib/booking';
import { owes, payCode, roomsPaying } from '../lib/payments';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import { useContact } from '../lib/contact';
import { useLang } from '../i18n/lang';
import { StayLogin } from './BookingBits';
import PaymentPanel from './PaymentPanel';
import BalancePay, { BalancePaid } from './BalancePay';
import './StayView.css';

// One stay (a room booking, or rooms booked together) as the guest follows
// it: where it is (sent -> deposit -> confirmed -> the rest), what to do now
// on the left (pay the deposit by QR, or the room logins and the rest of the
// price), and the booking itself in the footer-green box on the right.
// Used on "My bookings" and right after sending a request.
export default function StayView({ stay, pay, onPaid }) {
  const { t, lang, locale } = useLang();
  const contact = useContact();
  const { bookings, lead } = stay;
  const live = bookings.filter((b) => b.status !== 'cancelled');
  const depositLead = live.find((b) => owes(b, 'deposit'));
  const balanceLead = live.find((b) => owes(b, 'balance'));
  const confirmed = stay.status === 'confirmed';
  const paidInFull = confirmed && live.every((b) => b.balance_paid_at || Number(b.total) <= Number(b.deposit));
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const wd = t('date.wd');

  // Where the stay is.
  const track = [
    { key: 'sent', state: 'done' },
    { key: 'deposit', state: confirmed ? 'done' : lead.slip_status === 'review' ? 'wait' : 'now' },
    { key: 'confirmed', state: confirmed ? 'done' : 'todo' },
    {
      key: 'rest',
      state: paidInFull ? 'done' : confirmed ? (lead.balance_slip_status === 'review' ? 'wait' : 'now') : 'todo',
    },
  ];

  return (
    <div className="stay-view">
      {stay.status !== 'cancelled' && (
        <ol className="stay-track">
          {track.map((s) => (
            <li key={s.key} className={`is-${s.state}`} aria-current={s.state === 'now' ? 'step' : undefined}>
              {s.state === 'done' && '✓ '}
              {s.state === 'wait' && s.key === 'deposit' ? t('track.review') : t(`track.${s.key}`)}
            </li>
          ))}
        </ol>
      )}

      <div className="stay-view__cols">
        <div className="stay-view__main">
          {stay.status === 'cancelled' && <p className="stay-view__cancelled">{t('my.cancelledNote')}</p>}

          {depositLead && (
            <PaymentPanel
              booking={depositLead}
              amount={Number(depositLead.deposit_due)}
              fullAmount={Number(depositLead.full_due)}
              code={payCode(depositLead)}
              rooms={roomsPaying(bookings, depositLead, 'deposit')}
              slipStatus={depositLead.slip_status}
              slipReason={depositLead.slip_reason}
              {...pay}
              onPaid={onPaid}
            />
          )}

          {confirmed &&
            live
              .filter((b) => b.stay_username)
              .map((b) => (
                <StayLogin
                  key={b.id}
                  booking={b}
                  room={live.length > 1 ? roomNames(b.room_name, lang).title : null}
                  hint={t('my.stayHint', { date: formatDayShort(stay.checkOut, locale, wd), time: CHECK_OUT_TIME })}
                />
              ))}

          {balanceLead && <BalancePay booking={balanceLead} rooms={roomsPaying(bookings, balanceLead, 'balance')} pay={pay} onPaid={onPaid} />}
          {confirmed && !balanceLead && <BalancePaid booking={lead} />}
        </div>

        <aside className="stay-box">
          <h2>{payCode(lead)}</h2>
          <dl>
            <div>
              <dt>{t('stayBox.in')}</dt>
              <dd>
                {formatDayShort(stay.checkIn, locale, wd)} · {CHECK_IN_TIME}
              </dd>
            </div>
            <div>
              <dt>{t('stayBox.out')}</dt>
              <dd>
                {formatDayShort(stay.checkOut, locale, wd)} · {CHECK_OUT_TIME}
              </dd>
            </div>
            <div>
              <dt>{t('stayBox.rooms')}</dt>
              <dd>{live.map((b) => roomNames(b.room_name, lang).title).join(', ') || '—'}</dd>
            </div>
            <div>
              <dt>{t('stayBox.party')}</dt>
              <dd>{t('stayBox.partyValue', { guests: stay.guests, nights })}</dd>
            </div>
            <div className="stay-box__total">
              <dt>{t('sum.total')}</dt>
              <dd>{formatBaht(stay.total)}</dd>
            </div>
            <div className="stay-box__dep">
              <dt>{t('sum.deposit')}</dt>
              <dd>{confirmed ? `✓ ${formatBaht(stay.deposit)}` : formatBaht(stay.deposit)}</dd>
            </div>
            <div>
              <dt>{t('stayBox.rest')}</dt>
              <dd>{paidInFull ? `✓ ${formatBaht(stay.total - stay.deposit)}` : formatBaht(stay.total - stay.deposit)}</dd>
            </div>
          </dl>
          <p className="stay-box__note">
            {!paidInFull && t('stayBox.restNote')}
            {!paidInFull && <br />}
            {t('stayBox.call', { phones: contact.phones.map((p) => `${p.name[lang]} ${p.display}`).join(' · ') })}
          </p>
        </aside>
      </div>
    </div>
  );
}
