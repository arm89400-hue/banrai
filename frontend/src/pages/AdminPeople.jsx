import { useMemo, useState } from 'react';
import { formatBaht } from '../lib/money';
import { useAdminData } from '../lib/adminData';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import { Empty, ErrorNote, PageHead, Pill, RowsSkeleton, Seg } from '../components/AdminUI';
import Pager, { usePaged } from '../components/Pager';

const fmtDate = (d, locale) =>
  d ? new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDateTime = (d, locale) =>
  d ? new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const fmtTime = (d, locale) => new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

function Search({ value, onChange, placeholder }) {
  return (
    <label className="adm-search">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4-4" />
      </svg>
      <input type="search" placeholder={placeholder} aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const USER_KINDS = ['all', 'members', 'rooms'];

export function Users() {
  const { t, locale } = useLang();
  const { user: me } = useAuth();
  const { data, error } = useAdminData('/api/admin/users');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const list = (data?.users ?? []).filter((u) => {
    if (kind === 'members' && u.stay_booking_id) return false;
    if (kind === 'rooms' && !u.stay_booking_id) return false;
    return !q || [u.email, u.member_code].some((v) => String(v ?? '').toLowerCase().includes(q));
  });
  const paged = usePaged(list, 12, `${kind}|${q}`);

  return (
    <>
      <PageHead title={t('adm.tab.users')} />
      <ErrorNote>{error}</ErrorNote>
      <div className="adm-tools">
        <Seg active={kind} role="tablist">
          {USER_KINDS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)}>
              {t(`adm.users.kind.${id}`)}
            </button>
          ))}
        </Seg>
        <Search value={query} onChange={setQuery} placeholder={t('adm.users.search')} />
      </div>
      <div className="adm-card" ref={paged.boxRef} style={paged.boxStyle}>
        {!data ? (
          <RowsSkeleton rows={6} action={false} />
        ) : list.length === 0 ? (
          <Empty title={q ? t('adm.bk.noMatch') : t('adm.users.empty')} />
        ) : (
          <div className="adm-rows">
            {paged.rows.map((u) => {
              const isRoom = Boolean(u.stay_booking_id);
              const isMe = u.email === me?.email;
              return (
                <div key={u.id} className="adm-row adm-user">
                  <span className={`achat__av achat__av--${u.id % 5}`} aria-hidden="true">
                    {isRoom ? '#' : u.email.charAt(0).toUpperCase()}
                  </span>
                  <div className="adm-row__main">
                    <b>{u.email}</b>
                    <span className="num">
                      {isRoom ? t('adm.users.roomLogin') : u.member_code} · {t('adm.users.joinedOn', { date: fmtDate(u.created_at, locale) })}
                    </span>
                  </div>
                  <div className="adm-row__meta">
                    {u.is_admin ? (
                      <Pill tone="confirmed">{isMe ? t('adm.users.you') : t('adm.users.admin')}</Pill>
                    ) : isRoom ? (
                      <span className="num">{t('adm.users.until', { when: fmtDateTime(u.account_expires_at, locale) })}</span>
                    ) : (
                      <span className="num">{t('adm.users.nBookings', { n: u.booking_count })}</span>
                    )}
                  </div>
                  <span />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {data && <Pager {...paged.pager} />}
    </>
  );
}

export const LOG_TYPES = {
  'booking.requested': { group: 'bookings', tone: 'pending' },
  'booking.confirmed': { group: 'bookings', tone: 'confirmed' },
  'booking.cancelled': { group: 'bookings', tone: 'cancelled' },
  'booking.reopened': { group: 'bookings', tone: 'pending' },
  'booking.deleted': { group: 'bookings', tone: 'cancelled' },
  'booking.repriced': { group: 'bookings', tone: 'pending' },
  'booking.slip_sent': { group: 'bookings', tone: 'check' },
  'booking.balance_paid': { group: 'bookings', tone: 'confirmed' },
  'booking.balance_unpaid': { group: 'bookings', tone: 'pending' },
  'booking.slip_rejected': { group: 'bookings', tone: 'cancelled' },
  'promotion.created': { group: 'bookings', tone: 'confirmed' },
  'promotion.deleted': { group: 'bookings', tone: 'cancelled' },
  'settings.contact': { group: 'bookings', tone: 'confirmed' },
  'member.registered': { group: 'accounts', tone: 'confirmed' },
  'login.member': { group: 'logins', tone: 'neutral' },
  'login.room': { group: 'logins', tone: 'neutral' },
  'login.admin': { group: 'logins', tone: 'neutral' },
  'login.expired': { group: 'logins', tone: 'cancelled' },
};
const LOG_FILTERS = ['all', 'bookings', 'accounts', 'logins'];

export function logLabel(t, type) {
  const key = `adm.log.${type}`;
  const text = t(key);
  return text === key ? type : text;
}

function LogDetails({ entry }) {
  const { t, locale } = useLang();
  const d = entry.details ?? {};
  const stay = [d.room, d.check_in && `${d.check_in} → ${d.check_out}`].filter(Boolean).join(' · ');
  const lines = [
    stay,
    d.extra_guests > 0 && t('adm.logd.extraGuests', { n: d.extra_guests }),
    d.pets > 0 && t('adm.logd.pets', { n: d.pets }),
    d.promotion && t('adm.logd.promotion', { name: d.promotion }),
    d.total != null &&
      [
        t('adm.logd.total', { money: formatBaht(d.total) }),
        d.old_total != null && t('adm.logd.was', { money: formatBaht(d.old_total) }),
        d.deposit != null && t('adm.logd.deposit', { money: formatBaht(d.deposit) }),
      ]
        .filter(Boolean)
        .join(' · '),
    d.member_code && t('adm.logd.member', { code: d.member_code }),
    d.via && t('adm.logd.via', { via: d.via }),
    d.was && t('adm.logd.wasStatus', { was: d.was }),
    d.reason && t('adm.logd.reason', { reason: d.reason }),
    d.notified != null && (d.notified ? t('adm.logd.notified') : t('adm.logd.noAccount')),
    d.room_login_removed && t('adm.logd.loginRemoved', { user: d.room_login_removed }),
    d.expired_at && t('adm.logd.expired', { when: fmtDateTime(d.expired_at, locale) }),
    d.phones != null && t('adm.logd.phones', { n: d.phones }),
  ].filter(Boolean);

  return (
    <>
      {(d.code || d.guest || d.name) && (
        <b>
          {[d.code, d.guest, d.phone, d.name, d.percent != null && t('adm.logd.percentOff', { n: d.percent })].filter(Boolean).join(' · ')}
        </b>
      )}
      {lines.map((line, i) => (
        <span key={i}>{line}</span>
      ))}
      {d.room_username && (
        <span className="adm-login">
          {t('adm.panel.login')} <code>{d.room_username}</code> <code>{d.room_password}</code>
          {t('adm.logd.until', { when: fmtDateTime(d.expires_at, locale) })}
        </span>
      )}
    </>
  );
}

export function ActivityLog() {
  const { t, locale } = useLang();
  const { data, error, loading, reload } = useAdminData('/api/admin/log');
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.log ?? []).filter((entry) => {
      const meta = LOG_TYPES[entry.type];
      if (group !== 'all' && meta?.group !== group) return false;
      if (!q) return true;
      return [entry.actor, logLabel(t, entry.type), ...Object.values(entry.details ?? {})].some((v) =>
        String(v ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, group, query, t]);

  const paged = usePaged(rows, 15, `${group}|${query}`);
  const days = [];
  for (const entry of paged.rows) {
    const key = new Date(entry.created_at).toDateString();
    if (days.at(-1)?.key !== key) days.push({ key, list: [] });
    days.at(-1).list.push(entry);
  }

  return (
    <>
      <PageHead title={t('adm.tab.log')}>
        <button type="button" className="adm-btn" onClick={reload} disabled={loading}>
          {loading ? t('adm.log.refreshing') : t('adm.log.refresh')}
        </button>
      </PageHead>
      <ErrorNote>{error}</ErrorNote>
      <div className="adm-tools">
        <Seg active={group} role="tablist">
          {LOG_FILTERS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={group === id} onClick={() => setGroup(id)}>
              {t(`adm.logf.${id}`)}
            </button>
          ))}
        </Seg>
        <Search value={query} onChange={setQuery} placeholder={t('adm.log.search')} />
      </div>
      <div className="adm-card" ref={paged.boxRef} style={paged.boxStyle}>
        {!data ? (
          <RowsSkeleton rows={8} action={false} />
        ) : rows.length === 0 ? (
          <Empty title={t('adm.log.empty')} />
        ) : (
          <div className="adm-rows">
            {days.map(({ key, list }) => (
              <div key={key}>
                <h3 className="adm-month">
                  {new Date(list[0].created_at).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </h3>
                {list.map((entry) => {
                  const meta = LOG_TYPES[entry.type] ?? { tone: 'neutral' };
                  return (
                    <div key={entry.id} className="adm-row adm-log">
                      <span className="adm-log__time num">{fmtTime(entry.created_at, locale)}</span>
                      <div className="adm-row__main adm-log__body">
                        <span className="adm-log__what">
                          <Pill tone={meta.tone}>{logLabel(t, entry.type)}</Pill>
                          <span className="adm-muted">{entry.actor ?? t('adm.log.system')}</span>
                        </span>
                        <LogDetails entry={entry} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      {data && <Pager {...paged.pager} />}
    </>
  );
}
