import { useState } from 'react';
import { useLang } from '../i18n/lang';
import { formatBaht } from '../lib/money';
import './BookingBits.css';

export function PriceRows({
  price,
  nights,
  total,
  deposit,
  extraGuests = 0,
  fee = 0,
  pets = 0,
  petFee = 0,
  discount = 0,
  promoName,
}) {
  const { t } = useLang();
  const extraTotal = extraGuests * fee * (nights || 0);
  const petTotal = pets * petFee * (nights || 0);
  const off = Number(discount) || 0;
  const sum = total != null ? Number(total) : Number(price) * nights - off + extraTotal + petTotal;
  const dep = deposit != null ? Number(deposit) : sum / 2;

  return (
    <div className="price-rows">
      {price != null && nights > 0 && (
        <div className="price-rows__row">
          <span>{t('sum.priceLine', { price: formatBaht(price), n: nights })}</span>
          <span>{formatBaht(Number(price) * nights)}</span>
        </div>
      )}
      {off > 0 && (
        <div className="price-rows__row price-rows__promo">
          <span>{promoName ? t('price.promoNamed', { name: promoName }) : t('price.promo')}</span>
          <span>−{formatBaht(off)}</span>
        </div>
      )}
      {extraGuests > 0 && fee > 0 && nights > 0 && (
        <div className="price-rows__row">
          <span>{t('price.extraLine', { n: extraGuests, fee: formatBaht(fee), nights })}</span>
          <span>{formatBaht(extraTotal)}</span>
        </div>
      )}
      {extraGuests > 0 && !(fee > 0 && nights > 0) && (
        <div className="price-rows__row price-rows__balance">
          <span>{t('price.extraSaved', { n: extraGuests })}</span>
        </div>
      )}
      {pets > 0 && petFee > 0 && nights > 0 && (
        <div className="price-rows__row">
          <span>{t('price.petLine', { n: pets, fee: formatBaht(petFee), nights })}</span>
          <span>{formatBaht(petTotal)}</span>
        </div>
      )}
      {pets > 0 && !(petFee > 0 && nights > 0) && (
        <div className="price-rows__row price-rows__balance">
          <span>{t('price.petSaved', { n: pets })}</span>
        </div>
      )}
      <div className="price-rows__row price-rows__total">
        <span>{t('sum.total')}</span>
        <span>{formatBaht(sum)}</span>
      </div>
      <div className="price-rows__row price-rows__deposit">
        <span>{t('sum.deposit')}</span>
        <span>{formatBaht(dep)}</span>
      </div>
      <div className="price-rows__row price-rows__balance">
        <span>{t('sum.balance')}</span>
        <span>{formatBaht(sum - dep)}</span>
      </div>
    </div>
  );
}

export function PromoTag({ promo }) {
  const { t, locale } = useLang();
  const day = (iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <span className="promo-tag">
      <strong>{t('promo.off', { percent: promo.percent })}</strong>
      <span>
        {promo.name} · {t('promo.dates', { from: day(promo.starts_on), to: day(promo.ends_on) })}
      </span>
    </span>
  );
}

export function StatusBadge({ status }) {
  const { t } = useLang();
  return <span className={`status-badge status-badge--${status}`}>{t(`status.${status}`)}</span>;
}

function CopyRow({ label, value }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  }
  return (
    <div className="stay-login__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <button type="button" className="stay-login__copy" onClick={copy} aria-label={`${t('my.copy')} ${label}`}>
        {copied ? t('my.copied') : t('my.copy')}
      </button>
    </div>
  );
}

export function StayLogin({ booking, room, hint }) {
  const { t } = useLang();
  return (
    <section className="stay-login">
      <p className="stay-login__badge">✓ {t('status.confirmed')}</p>
      <p className="stay-login__title">
        {t('my.stayTitle')}
        {room && ` · ${room}`}
      </p>
      <dl>
        <CopyRow label={t('my.stayUser')} value={booking.stay_username} />
        <CopyRow label={t('my.stayPass')} value={booking.stay_password} />
      </dl>
      {hint && <p className="stay-login__hint">{hint}</p>}
    </section>
  );
}
