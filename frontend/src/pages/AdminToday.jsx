import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatBaht } from '../lib/money';
import { addDays, toISODate } from '../lib/booking';
import { dayOf, groupRows, needsYou, roomTitle } from '../lib/adminBookings';
import { useAdminData } from '../lib/adminData';
import { useLang } from '../i18n/lang';
import { Empty, ErrorNote, PageHead, Pill } from '../components/AdminUI';
import { Loading, Sk } from '../components/Skeleton';
import { Phone, useBookingActions, who } from './AdminBookings';
import { LiveFeed, MoneyChart, OccupancyChart, Pulse } from './AdminPulse';
import './AdminToday.css';

const DAYS = 14;
const day = (iso) => new Date(`${iso}T00:00:00`);
const nights = (a, b) => Math.max(0, Math.round((day(b) - day(a)) / 86_400_000));

function useDates() {
  const { t, locale } = useLang();
  const today = toISODate(new Date());
  const tomorrow = addDays(today, 1);
  return {
    today,
    short: (iso) => day(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    range: (a, b) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).formatRange(day(a), day(b)),
    when: (iso) =>
      iso === today
        ? t('adm.today.todayWord')
        : iso === tomorrow
          ? t('adm.today.tomorrow')
          : day(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
  };
}

// What needs the owner, most urgent first: slips to check, deposits not paid,
// money to collect at the farm, then guests waiting for a chat reply.
function JobList({ groups, waiting, actions, onOpen }) {
  const { t } = useLang();
  const d = useDates();
  const navigate = useNavigate();
  const rank = (g) => (g.depositReview || g.balanceReview ? 0 : g.status === 'pending' ? 1 : 2);
  const jobs = groups
    .filter((g) => needsYou(g, d.today))
    .sort((a, b) => rank(a) - rank(b) || a.checkIn.localeCompare(b.checkIn));

  if (jobs.length === 0 && waiting === 0) {
    return (
      <div className="adm-card">
        <Empty title={t('adm.today.allDone')} hint={t('adm.today.allDoneHint')} />
      </div>
    );
  }

  return (
    <div className="adm-card adm-rows tdy-jobs">
      {jobs.map((g) => {
        const slip = g.depositReview ? 'deposit' : g.balanceReview ? 'balance' : null;
        const slipRow = slip && g.rows.find((r) => (slip === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review'));
        const expected = slipRow && (slip === 'deposit' ? slipRow.slip_expected : slipRow.balance_slip_expected);
        let pill;
        let what;
        if (slip) {
          pill = <Pill tone="check">{t('adm.today.job.slip')}</Pill>;
          what = t(slip === 'deposit' ? 'adm.today.slipDeposit' : 'adm.today.slipRest', { money: formatBaht(expected) });
        } else if (g.status === 'pending') {
          pill = <Pill tone="pending">{t('adm.today.job.deposit')}</Pill>;
          what = t('adm.today.noDeposit', { money: formatBaht(g.deposit) });
        } else {
          pill = <Pill tone="confirmed">{t('adm.today.job.collect')}</Pill>;
          what = t('adm.today.collect', { money: formatBaht(g.restDue), when: d.when(g.checkIn) });
        }
        return (
          <div key={g.key} className="adm-row tdy-job">
            <span className="tdy-job__pill">{pill}</span>
            <button type="button" className="adm-row__main tdy-job__what" onClick={() => onOpen(g)}>
              <b>
                {who(g.lead)} <span className="adm-muted">· {g.rooms}</span>
              </b>
              <span className="num">
                {what} · {d.range(g.checkIn, g.checkOut)}
              </span>
            </button>
            <span />
            <div className="adm-row__acts">
              {slip && (
                <>
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => onOpen(g)}>
                    {t('adm.today.seeSlip')}
                  </button>
                  <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => actions.approve(g, slip)}>
                    {t('adm.today.approve')}
                  </button>
                </>
              )}
              {!slip && g.status === 'pending' && (
                <>
                  {g.lead.guest_phone && <Phone phone={g.lead.guest_phone} label={t('adm.bk.step.call')} className="adm-btn adm-btn--sm" />}
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => onOpen(g)}>
                    {t('adm.today.open')}
                  </button>
                </>
              )}
              {!slip && g.status === 'confirmed' && (
                <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => actions.paidAtFarm(g)}>
                  {t('adm.act.paidAtFarm')}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {waiting > 0 && (
        <div className="adm-row tdy-job">
          <span className="tdy-job__pill">
            <Pill tone="neutral">{t('adm.today.job.chat')}</Pill>
          </span>
          <button type="button" className="adm-row__main tdy-job__what" onClick={() => navigate('/admin/chat')}>
            <b>{t('adm.today.waitingChats', { n: waiting })}</b>
          </button>
          <span />
          <div className="adm-row__acts">
            <Link to="/admin/chat" className="adm-btn adm-btn--sm adm-btn--primary">
              {t('adm.dash.reply')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// Rooms down the side, the next two weeks across the top, one bar per stay.
function RoomBoard({ rooms, groups, start, onOpen }) {
  const { t, lang, locale } = useLang();
  const d = useDates();
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const end = addDays(start, DAYS);
  const live = groups.filter((g) => g.status !== 'cancelled');

  return (
    <div className="adm-card tdy-board-wrap">
      <div className="tdy-board" style={{ '--days': DAYS }} role="grid" aria-label={t('adm.today.board')}>
        <div className="tdy-board__head" role="row">
        <div className="tdy-board__corner" role="columnheader" />
        {days.map((iso) => {
          const date = day(iso);
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div
              key={iso}
              role="columnheader"
              className={`tdy-board__day${iso === d.today ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}`}
            >
              <span>{date.toLocaleDateString(locale, { weekday: 'short' })}</span>
              <b className="num">{date.getDate()}</b>
            </div>
          );
        })}
        </div>

        {rooms.map((room) => {
          const stays = live.flatMap((g) =>
            g.live
              .filter((r) => r.room_id === room.id && dayOf(r.booked_for) < end && dayOf(r.booked_until) > start)
              .map((r) => ({ g, r }))
          );
          return (
            <div key={room.id} className="tdy-board__row" role="row">
              <div className="tdy-board__room" role="rowheader">
                {roomTitle(room.name, lang)}
              </div>
              {days.map((iso, di) => (
                <div
                  key={iso}
                  className={`tdy-board__cell${iso === d.today ? ' is-today' : ''}`}
                  style={{ gridColumn: di + 2 }}
                  aria-hidden="true"
                />
              ))}
              {stays.map(({ g, r }) => {
                const from = dayOf(r.booked_for) < start ? start : dayOf(r.booked_for);
                const to = dayOf(r.booked_until) > end ? end : dayOf(r.booked_until);
                const col = nights(start, from) + 2;
                const span = Math.max(1, nights(from, to));
                const cutStart = dayOf(r.booked_for) < start;
                const cutEnd = dayOf(r.booked_until) > end;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`tdy-bar${g.status === 'pending' ? ' is-wait' : ''}${cutStart ? ' is-cut-start' : ''}${cutEnd ? ' is-cut-end' : ''}`}
                    style={{ gridColumn: `${col} / span ${span}` }}
                    onClick={() => onOpen(g)}
                    title={`${who(r)} · ${g.code} · ${d.range(dayOf(r.booked_for), dayOf(r.booked_until))}`}
                  >
                    <span>{who(r)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="tdy-key">
        <span>
          <i /> {t('adm.dash.legend.ok')}
        </span>
        <span>
          <i className="is-wait" /> {t('adm.dash.legend.wait')}
        </span>
      </p>
    </div>
  );
}

function Comings({ title, items, empty, onOpen }) {
  const { t } = useLang();
  const d = useDates();
  return (
    <section className="adm-sec">
      <div className="adm-sec__head">
        <h2>{title}</h2>
      </div>
      <div className="adm-card adm-rows">
        {items.length === 0 && <p className="tdy-none">{empty}</p>}
        {items.map(({ date, g }) => (
          <button key={g.key + date} type="button" className="adm-row is-click tdy-come" onClick={() => onOpen(g)}>
            <span className={`tdy-come__when${date === d.today ? ' is-today' : ''}`}>{d.when(date)}</span>
            <span className="adm-row__main">
              <b>{who(g.lead)}</b>
              <span>
                {g.rooms} · {t('adm.panel.guests', { n: g.guests })}
              </span>
            </span>
            {g.status === 'pending' ? <Pill tone="pending">{t('adm.dash.legend.wait')}</Pill> : <span />}
          </button>
        ))}
      </div>
    </section>
  );
}

function TodaySkeleton() {
  const { t } = useLang();
  return (
    <Loading label={t('adm.loading')}>
      <div className="adm-card adm-rows">
        {[0, 1, 2].map((i) => (
          <div key={i} className="adm-row adm-row--sk tdy-sk-row">
            <Sk w="84px" h="24px" r="999px" />
            <div className="adm-row__main">
              <Sk w={`${50 - i * 8}%`} h="1.05em" />
              <Sk w="62%" h="0.85em" style={{ marginTop: 8 }} />
            </div>
            <Sk w="96px" h="36px" r="10px" />
          </div>
        ))}
      </div>
      <div className="adm-sec" style={{ marginTop: 32 }}>
        <Sk w="200px" h="1.2em" />
        <Sk className="tdy-board-sk" h="300px" r="14px" />
      </div>
    </Loading>
  );
}

export default function AdminToday({ onChat }) {
  const navigate = useNavigate();
  const { t, lang, locale } = useLang();
  const d = useDates();
  const bookings = useAdminData('/api/admin/bookings');
  const stats = useAdminData('/api/admin/stats');
  const roomsLoad = useAdminData('/api/rooms');
  const [error, setError] = useState(null);
  const [start, setStart] = useState(() => addDays(toISODate(new Date()), -1));
  const actions = useBookingActions(() => {
    bookings.reload();
    stats.reload();
  }, setError);

  const groups = useMemo(() => groupRows(bookings.data?.bookings ?? [], lang).filter((g) => g.isRoom), [bookings.data, lang]);
  const rooms = useMemo(() => [...(roomsLoad.data?.rooms ?? [])].sort((a, b) => b.price - a.price), [roomsLoad.data]);
  const live = groups.filter((g) => g.status !== 'cancelled');
  const open = (g) => navigate(`/admin/bookings?open=${encodeURIComponent(g.key)}`);
  const waiting = stats.data?.stats?.waiting_chats ?? 0;
  const setup = stats.data?.payment_setup;

  const week = addDays(d.today, 7);
  const arriving = live
    .filter((g) => g.checkIn >= d.today && g.checkIn < week)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .map((g) => ({ date: g.checkIn, g }));
  const leaving = live
    .filter((g) => g.checkOut >= d.today && g.checkOut < week)
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut))
    .map((g) => ({ date: g.checkOut, g }));

  const ready = bookings.data && roomsLoad.data && stats.data;
  const dateLine = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="tdy">
      {ready ? (
        <Pulse
          groups={groups}
          rooms={rooms}
          jobs={groups.filter((g) => needsYou(g, d.today)).length}
          waiting={waiting}
          onChat={() => onChat?.()}
        />
      ) : (
        <PageHead title={`${t('adm.today.title')} · ${dateLine}`} lead={' '} />
      )}
      <ErrorNote>{bookings.error || error}</ErrorNote>

      {!ready ? (
        <TodaySkeleton />
      ) : (
        <>
          <div className="tdy-feed-row">
            <section className="adm-sec" id="tdy-jobs">
              <div className="adm-sec__head">
                <h2>{t('adm.today.jobs')}</h2>
                <Link to="/admin/bookings" className="adm-link">
                  {t('adm.today.allBookings')}
                </Link>
              </div>
              <JobList groups={groups} waiting={waiting} actions={actions} onOpen={open} />
            </section>
            <LiveFeed />
          </div>

          <div className="tdy-charts">
            <OccupancyChart groups={groups} rooms={rooms} />
            <MoneyChart groups={groups} />
          </div>

          <section className="adm-sec">
            <div className="adm-sec__head">
              <h2>{t('adm.today.board')}</h2>
              <div className="tdy-nav">
                <button type="button" className="adm-btn adm-btn--sm adm-btn--icon" onClick={() => setStart(addDays(start, -7))} aria-label={t('adm.today.prevWeek')}>
                  ‹
                </button>
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => setStart(addDays(d.today, -1))}>
                  {t('adm.dash.today')}
                </button>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--icon" onClick={() => setStart(addDays(start, 7))} aria-label={t('adm.today.nextWeek')}>
                  ›
                </button>
              </div>
            </div>
            <RoomBoard rooms={rooms} groups={groups} start={start} onOpen={open} />
          </section>

          <div className="tdy-two">
            <Comings title={t('adm.today.arriving')} items={arriving} empty={t('adm.today.noArrivals')} onOpen={open} />
            <Comings title={t('adm.today.leaving')} items={leaving} empty={t('adm.today.noDepartures')} onOpen={open} />
          </div>

          {setup && (
            <p className="tdy-setup">
              <b>{t('adm.today.payments')}</b> · {setup.promptpay ? t('adm.today.ppOn') : t('adm.today.ppOff')} ·{' '}
              {setup.slipok ? t('adm.today.slipokOn') : t('adm.today.slipokOff')}
              {setup.test_pay && <> · <span className="tdy-setup__warn">{t('adm.today.testOn')}</span></>}
            </p>
          )}
        </>
      )}
    </div>
  );
}
