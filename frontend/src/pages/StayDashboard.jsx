import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { dayOf, formatDayShort, nightsBetween, roomNames, toISODate } from '../lib/booking';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import { useContact } from '../lib/contact';
import { listingPhotos, roomCover, roomPhotos } from '../lib/photos';
import { fruitImage, fruitPhoto, fruitsIn } from '../lib/seasons';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import Announcements from '../components/Announcements';
import ChatThread from '../components/ChatThread';
import { shift } from '../lib/motion';
import StayStage from '../components/StayStage';
import './StayDashboard.css';

const CHAT_POLL_MS = 5000;
const ACTIVITY_COUNT = 4;
const DAY_MS = 86_400_000;

// One outline icon set for the dashboard: same 24px grid, same stroke, so
// every tile heading, button and tab looks alike.
const ICONS = {
  calendar: 'M4 7h16v13H4zM4 11h16M8 3v4M16 3v4',
  bed: 'M3 18V8M3 14h18v4M21 18v-6a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01',
  wallet: 'M4 7h14a2 2 0 0 1 2 2v9H6a2 2 0 0 1-2-2zM4 7l11-3v3M16 13h.01',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7',
};

function Icon({ name }) {
  return (
    <svg className="stay-ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Whole days from today to `iso` (negative once it has passed).
function daysUntil(iso) {
  const today = new Date(`${toISODate(new Date())}T00:00:00`);
  return Math.round((new Date(`${iso}T00:00:00`) - today) / DAY_MS);
}

const UNREAD_POLL_MS = 20000;

// The conversation with the owners. On computers it slides in from the
// right when the guest opens it (the page's own chat button; the site's
// floating one is hidden here, see ChatWidget.jsx); on phones it is the
// Chat tab. It only loads - and so marks messages read - while `active`.
// An empty chat offers the questions guests usually ask before they come.
function StayChat({ active, onClose }) {
  const { t, lang, locale } = useLang();
  const contact = useContact();
  const owners = contact.phones.map((p) => p.name[lang]).join(t('stay.and'));
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const load = () =>
      api('/api/chat')
        .then((data) => !cancelled && setMessages(data.messages))
        .catch(() => {});
    load();
    const timer = setInterval(load, CHAT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active]);

  async function send(body) {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    setMessages((list) => [...list, data.message]);
  }

  return (
    <section
      className="stay-tile stay-chat"
      data-for="chat"
      id="chat"
      aria-labelledby="stay-chat-title"
      aria-hidden={!active}
      inert={!active}
    >
      <header>
        <div>
          <h2 id="stay-chat-title">{t('stay.chatTitle')}</h2>
          <p>{t('stay.chatWho', { names: owners })}</p>
        </div>
        <button type="button" className="stay-chat__close" onClick={onClose} aria-label={t('chat.close')}>
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <ChatThread
        messages={messages}
        mine={(m) => !m.from_admin}
        onSend={send}
        locale={locale}
        starters={t('stay.starters')}
        labels={{
          empty: t('stay.chatEmpty'),
          placeholder: t('chat.placeholder'),
          send: t('chat.send'),
        }}
      />
    </section>
  );
}

// The room dashboard (/stay): what a guest needs between paying and going
// home, in the order they need it - when and where, what is paid and what
// is left, a chat with the owners, then what there is to do on the farm.
// Two kinds of account see it:
// - members (email or Google) once a booking is confirmed by paying the
//   deposit or the full price; with no such stay they go to My bookings;
// - room accounts (the username/password made when a booking is
//   confirmed), which stop working at check-out - the API then answers
//   ACCOUNT_EXPIRED and lib/api.js signs the session out.
export default function StayDashboard() {
  const { user } = useAuth();
  const { t, lang, locale } = useLang();
  const contact = useContact();
  const [data, setData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('stay');
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatActive = chatOpen || tab === 'chat';

  const isGuest = Boolean(user && !user.is_admin);

  useEffect(() => {
    if (!isGuest) return;
    api('/api/stay')
      .then(setData)
      .catch((err) => setError(err.reason === 'NO_STAY' ? 'none' : 'load'));
    api('/api/activities')
      .then((res) => setActivities(res.activities))
      .catch(() => {});
  }, [isGuest]);

  // While the chat is closed: how many of the owners' messages are unread,
  // for the badge on the chat button and the Chat tab.
  useEffect(() => {
    if (!isGuest || chatActive) {
      setUnread(0);
      return undefined;
    }
    const load = () =>
      api('/api/chat/unread')
        .then((d) => setUnread(d.unread))
        .catch(() => {});
    load();
    const timer = setInterval(load, UNREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [isGuest, chatActive]);

  if (!user) return <Navigate to="/login?next=/stay" replace />;
  if (user.is_admin) return <Navigate to="/admin" replace />;
  if (error === 'none') return <Navigate to="/booking" replace />;

  if (error) {
    return (
      <section className="bk-page">
        <p className="bk-error" role="alert">
          {t('stay.error')}
        </p>
      </section>
    );
  }
  if (!data) return <section className="bk-page" aria-busy="true" />;

  const { stay, rooms } = data;
  const checkIn = dayOf(stay.booked_for);
  const checkOut = dayOf(stay.booked_until);
  const wd = t('date.wd');
  const nights = nightsBetween(checkIn, checkOut);
  const total = rooms.reduce((n, r) => n + (Number(r.total) || 0), 0);
  const balance = Number(stay.balance_due) || 0;
  const days = daysUntil(checkIn);
  const pick = (en, th) => (lang === 'th' ? th || en : en || th);
  const fruits = fruitsIn(Number(checkIn.slice(5, 7)));
  const fruitNames = t('fruits');
  const phone = contact.phones[0];
  // The stage's photos: the booked rooms, the fruit ripe that month and the
  // activities, taken in turn so the show mixes them; at most 12.
  const roomSlides = rooms.flatMap((r) =>
    roomPhotos({ id: r.room_id, image_url: r.room_image_url, photos: r.room_photos })
      .slice(0, 3)
      .map((p) => ({ src: p.src, caption: roomNames(r.room_name, lang).title })),
  );
  const fruitSlides = fruits.map((f) => ({
    src: fruitPhoto(f.id),
    caption: t('stay.slideFruit', { fruit: fruitNames[f.id] }),
  }));
  const activitySlides = activities
    .map((a) => ({ src: listingPhotos(a)[0]?.src, caption: pick(a.name, a.name_th) }))
    .filter((s) => s.src);
  const slides = [];
  const seen = new Set();
  for (let i = 0; slides.length < 12; i++) {
    const turn = [roomSlides[i], fruitSlides[i], activitySlides[i]].filter(Boolean);
    if (turn.length === 0) break;
    for (const s of turn) {
      if (!seen.has(s.src) && slides.length < 12) {
        seen.add(s.src);
        slides.push(s);
      }
    }
  }

  let title;
  if (days > 1) title = t('stay.inDays', { n: days });
  else if (days === 1) title = t('stay.tomorrow');
  else if (days === 0) title = t('stay.today');
  else title = t('stay.during');

  const tabs = [
    { id: 'stay', icon: 'calendar', label: t('stay.tabStay') },
    { id: 'chat', icon: 'chat', label: t('stay.tabChat') },
    { id: 'farm', icon: 'leaf', label: t('stay.tabFarm') },
  ];

  return (
    <>
      <StayStage slides={slides}>
        <h1 id="stay-title">{title}</h1>
        <p className="stay-stage__who">
          {t('stay.hello', { name: stay.guest_name || user.email })} · {stay.group_code || stay.code}
        </p>
      </StayStage>

      <section className="bk-page stay">
        <Announcements source="/api/announcements/mine" className="page-news" />

        {/* Phones: one subject at a time, so the page fits the screen.
            Computers show every tile at once and hide these tabs. */}
        <div className="stay-tabs" role="tablist" aria-label={t('stay.tabsLabel')}>
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              className={tab === x.id ? 'is-on' : ''}
              onClick={() => shift(() => setTab(x.id), { cards: '.stay-dash > *' })}
            >
              <Icon name={x.icon} />
              {x.label}
              {x.id === 'chat' && unread > 0 && <span className="stay-badge">{unread}</span>}
            </button>
          ))}
        </div>

        {/* The dashboard: each tile one thing the guest looks up. */}
        <div className={`stay-dash${chatOpen ? ' is-chat-open' : ''}`} data-tab={tab}>
          <article className="stay-tile stay-tile--when" data-for="stay">
            <h2>{t('stay.whenTitle', { n: nights })}</h2>
            {user.is_stay && (
              <p className="stay__expiry">
                {t('stay.expires', { date: formatDayShort(checkOut, locale, wd), time: CHECK_OUT_TIME })}
              </p>
            )}
            <div className="stay-line">
              <div>
                <span>{t('sum.checkIn')}</span>
                <b>{formatDayShort(checkIn, locale, wd)}</b>
                <small>{t('stay.from', { time: CHECK_IN_TIME })}</small>
              </div>
              <div className="stay-line__mid" aria-hidden="true">
                <i />
                <i />
              </div>
              <div>
                <span>{t('sum.checkOut')}</span>
                <b>{formatDayShort(checkOut, locale, wd)}</b>
                <small>{t('stay.before', { time: CHECK_OUT_TIME })}</small>
              </div>
            </div>
          </article>

          <article className="stay-tile stay-tile--rooms" data-for="stay">
            <h2>{t('stay.rooms')}</h2>
            <ul className="stay-rooms">
              {rooms.map((r) => (
                <li key={r.id}>
                  <img
                    src={roomCover({ id: r.room_id, image_url: r.room_image_url, photos: r.room_photos })}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                  <span>
                    <b>{roomNames(r.room_name, lang).title}</b>
                    {r.guests > 0 && <small>{t('sum.guestCount', { n: r.guests })}</small>}
                  </span>
                </li>
              ))}
            </ul>
            {stay.pets > 0 && <small className="stay-tile__note">{t('price.petSaved', { n: stay.pets })}</small>}
          </article>

          <article className="stay-tile stay-tile--money" data-for="stay">
            <h2>{balance > 0 ? t('stay.left') : t('stay.money')}</h2>
            {balance > 0 ? (
              <>
                <b className="stay-money">{formatBaht(balance)}</b>
                {total > 0 && (
                  <>
                    <dl className="stay-paid">
                      <div>
                        <dt>{t('stay.paidLabel')}</dt>
                        <dd>{formatBaht(total - balance)}</dd>
                      </div>
                      <div>
                        <dt>{t('stay.totalLabel')}</dt>
                        <dd>{formatBaht(total)}</dd>
                      </div>
                    </dl>
                  </>
                )}
                {!user.is_stay && (
                  <Link className="bk-btn stay-tile__btn" to="/booking">
                    {t('stay.payOnline')}
                  </Link>
                )}
                <small className="stay-tile__farm">{t(user.is_stay ? 'stay.payAtFarmOnly' : 'stay.orAtFarm')}</small>
              </>
            ) : (
              <b className="stay-money stay-money--done">
                {total > 0 ? t('stay.paidAll', { amount: formatBaht(total) }) : t('my.paidFull')}
              </b>
            )}
          </article>

          <article className="stay-tile stay-tile--go" data-for="stay">
            {contact.maps && (
              <a className="stay-go stay-go--main" href={contact.maps} target="_blank" rel="noopener noreferrer">
                <Icon name="pin" />
                <span>
                  {t('stay.map')}
                  <small>Google Maps</small>
                </span>
              </a>
            )}
            {phone && (
              <a className="stay-go" href={`tel:${phone.tel}`}>
                <Icon name="phone" />
                <span>
                  {t('chat.call', { name: phone.name[lang] })}
                  <small>{phone.display}</small>
                </span>
              </a>
            )}
          </article>

          <article className="stay-tile stay-tile--know" data-for="stay">
            <h2>{t('stay.beforeTitle')}</h2>
            <ul className="stay-know">
              {t('stay.beforeList').map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </article>

          <StayChat active={chatActive} onClose={() => setChatOpen(false)} />

          {(activities.length > 0 || fruits.length > 0) && (
            <section className="stay-tile stay-tile--farm" data-for="farm" aria-labelledby="stay-acts">
              <div className="stay__row">
                <h2 id="stay-acts">{t('stay.activities')}</h2>
                {fruits.length > 0 && (
                  <p className="stay-fruit">
                    <span>{t('stay.ripe')}</span>
                    {fruits.map((f) => (
                      <b key={f.id}>
                        <img src={fruitImage(f.id)} alt="" loading="lazy" />
                        {fruitNames[f.id]}
                      </b>
                    ))}
                  </p>
                )}
                <Link to="/activities">{t('stay.allActivities')}</Link>
              </div>
              <ul className="stay-acts">
                {activities.slice(0, ACTIVITY_COUNT).map((a) => {
                  const photo = listingPhotos(a)[0];
                  return (
                    <li key={a.id}>
                      {photo ? <img src={photo.src} alt="" loading="lazy" /> : <span className="stay-acts__ph" />}
                      <b>{pick(a.name, a.name_th)}</b>
                      {Number(a.price) > 0 && <span className="stay-acts__price">{formatBaht(a.price)}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        {/* Computers: opens the chat beside the dashboard. */}
        {!chatOpen && (
          <button type="button" className="stay-chat-toggle" onClick={() => setChatOpen(true)}>
            <Icon name="chat" />
            {t('stay.chatTitle')}
            {unread > 0 && <span className="stay-badge">{unread}</span>}
          </button>
        )}
      </section>
    </>
  );
}
