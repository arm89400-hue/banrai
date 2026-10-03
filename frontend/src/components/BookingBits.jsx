import { useLang } from '../i18n/lang';
import { formatBaht } from '../lib/money';
import './BookingBits.css';

// Price breakdown for a stay: rate x nights, any extra-guest and pet
// charges, the total, the 50% deposit and the balance due on arrival. Pass
// `total`/`deposit` to show a saved booking's amounts instead of computing
// them from the rate. `discount` is the promotion's amount off (already
// taken off a saved `total`) and `promoName` what to call it.
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

// "Promotion -10% · Rainy season · check-in 1 Oct – 31 Oct": one promotion,
// as shown on room cards, room pages and the booking flow's room list.
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

// pending / confirmed / cancelled pill, labelled in the current language.
export function StatusBadge({ status }) {
  const { t } = useLang();
  return <span className={`status-badge status-badge--${status}`}>{t(`status.${status}`)}</span>;
}
