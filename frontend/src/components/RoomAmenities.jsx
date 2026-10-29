import { useLang } from '../i18n/lang';
import './RoomAmenities.css';

const ICONS = {
  bath: (
    <>
      <path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M6 12V6a2 2 0 0 1 3.6-1.2" />
      <path d="M8 19l-1 2M16 19l1 2" />
    </>
  ),
  shower: (
    <>
      <path d="M4 21V7a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3" />
      <path d="M9 9h7a2 2 0 0 0-2-2h-3a2 2 0 0 0-2 2z" />
      <path d="M10 13v.01M13 13v.01M16 13v.01M11 16v.01M14 16v.01M12.5 19v.01" />
    </>
  ),
  dryer: (
    <>
      <path d="M4 9a5 5 0 0 1 5-5h7v10H9a5 5 0 0 1-5-5z" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="M16 6h3M16 9h4M16 12h3" />
      <path d="M10 14l1.5 6h3L13 14" />
    </>
  ),
  wifi: (
    <>
      <path d="M3 9.5a13 13 0 0 1 18 0" />
      <path d="M6.5 13a8 8 0 0 1 11 0" />
      <path d="M9.8 16.3a3.3 3.3 0 0 1 4.4 0" />
      <path d="M12 19.5v.01" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M9 21h6M8 3l4 3 4-3" />
    </>
  ),
  kettle: (
    <>
      <path d="M4 20h14" />
      <path d="M6 20l1.2-7.6A3 3 0 0 1 10.2 10h1.6a3 3 0 0 1 3 2.4L16 20" />
      <path d="M8.5 10V8.5a2.5 2.5 0 0 1 5 0V10" />
      <path d="M15.6 14.5l3.4-2.5" />
    </>
  ),
  cup: (
    <>
      <path d="M5 10h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8.5 7c0-1 1-1 1-2.5M12 7c0-1 1-1 1-2.5" />
    </>
  ),
  bed: (
    <>
      <path d="M3 19v-9M3 15h15v4M18 15v-2a3 3 0 0 0-3-3H8v5" />
      <circle cx="5.8" cy="12.2" r="1.6" />
      <path d="M19.5 4v5M17 6.5h5" />
    </>
  ),
  pot: (
    <>
      <path d="M5 10h14v5a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z" />
      <path d="M3 10h18" />
      <path d="M9.5 6.5c0-1 1-1 1-2.5M13.5 6.5c0-1 1-1 1-2.5" />
    </>
  ),
  pan: (
    <>
      <path d="M3 12h13v.5a4.5 4.5 0 0 1-4.5 4.5h-4A4.5 4.5 0 0 1 3 12.5z" />
      <path d="M16 12.5h5" />
      <path d="M7 9c0-1 1-1 1-2.5M11 9c0-1 1-1 1-2.5" />
    </>
  ),
  fridge: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M6 10h12M9 6v1.5M9 13v3" />
    </>
  ),
  dining: (
    <>
      <path d="M6 3v5a3 3 0 0 0 6 0V3M9 3v18" />
      <path d="M18 21V3c-2.2 1.8-3.3 4.8-3.3 9H18" />
    </>
  ),
  grill: (
    <>
      <path d="M4 10h16a8 8 0 0 1-16 0z" />
      <path d="M8.5 16.8L7 21M15.5 16.8L17 21" />
      <path d="M9 6.5c0-1 1-1 1-2.5M14 6.5c0-1 1-1 1-2.5" />
    </>
  ),
  pool: (
    <>
      <path d="M8 15V5.5a2 2 0 0 1 4 0M14 15V5.5a2 2 0 0 1 4 0M8 9h6M8 12h6" />
      <path d="M3 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
    </>
  ),
  picnic: (
    <>
      <path d="M4 11h16l-1.6 8.2A2 2 0 0 1 16.4 21H7.6a2 2 0 0 1-2-1.8z" />
      <path d="M8 11a4 4 0 0 1 8 0" />
      <path d="M9.5 14v4M12 14v4M14.5 14v4" />
    </>
  ),
  umbrella: (
    <>
      <path d="M3 10a9 6 0 0 1 18 0z" />
      <path d="M12 10v11M7 16h10M8 16l-1 5M16 16l1 5" />
    </>
  ),
  terrace: (
    <>
      <path d="M3 9h18M3 20h18M3 16h18" />
      <path d="M5 9v7M19 9v7M9.5 9v7M14.5 9v7" />
    </>
  ),
  egg: <path d="M12 3c-3.5 0-6 5.5-6 10a6 6 0 0 0 12 0c0-4.5-2.5-10-6-10z" />,
  tent: (
    <>
      <path d="M2 20h20" />
      <path d="M4 20L12 5l8 15" />
      <path d="M12 12l-3 8M12 12l3 8" />
    </>
  ),
  paw: (
    <>
      <circle cx="6.5" cy="10.5" r="1.6" />
      <circle cx="10" cy="6.5" r="1.6" />
      <circle cx="14" cy="6.5" r="1.6" />
      <circle cx="17.5" cy="10.5" r="1.6" />
      <path d="M8.5 17.5c0-3 1.7-5.5 3.5-5.5s3.5 2.5 3.5 5.5a2 2 0 0 1-2.6 1.9c-.4-.1-.6-.2-.9-.2s-.5.1-.9.2a2 2 0 0 1-2.6-1.9z" />
    </>
  ),
  parking: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M10 17V7h3a3 3 0 0 1 0 6h-3" />
    </>
  ),
  cctv: (
    <>
      <path d="M3 9.5L15 6l1.6 5.5L4.6 15z" />
      <path d="M16.2 10l3.8-1v4" />
      <path d="M8 14v5H4" />
    </>
  ),
  nosmoke: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
      <path d="M6 12.5h8v2.5H6zM16.5 12.5V15" />
    </>
  ),
  party: (
    <>
      <path d="M12 3a5 5 0 0 0-5 5c0 3.3 2.7 6 5 6s5-2.7 5-6a5 5 0 0 0-5-5z" />
      <path d="M12 14l-1 1.5h2z" />
      <path d="M12 15.5c0 2-2 2.5-2 5.5" />
    </>
  ),
};

export default function RoomAmenities({ group = 0 }) {
  const { t } = useLang();
  const { items } = t('amenities.groups')[group];
  return (
    <ul className={`room-amenities${group > 0 ? ' room-amenities--wide' : ''}`}>
      {items.map((item) => (
        <li key={item.label} className={item.label.length > 32 ? 'is-wide' : undefined}>
          {ICONS[item.icon] && (
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              {ICONS[item.icon]}
            </svg>
          )}
          <span>
            {item.label}
            {item.note && <small>{t(`amenities.${item.note}`)}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
