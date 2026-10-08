import { useEffect, useState } from "react";
import { api, mediaUrl } from "../lib/api";
import { useLang } from "../i18n/lang";
import PhotoSlides from "./PhotoSlides";
import "./Announcements.css";

// Announcements written in admin (Admin -> Announcements), each with up to
// 6 photos. `source` is the
// API to read: '/api/announcements/home' (everyone, Home page) or
// '/api/announcements/mine' (guests with a booking). Renders nothing at all
// while loading, on error, or when there's nothing to announce - so the space
// it would take simply isn't there.
export default function Announcements({ source, className = "" }) {
  const { t, lang, locale } = useLang();
  const [list, setList] = useState([]);

  useEffect(() => {
    let stale = false;
    api(source)
      .then((data) => !stale && setList(data.announcements ?? []))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [source]);

  if (!list.length) return null;

  const pick = (en, th) => (lang === "th" ? th || en : en || th);
  const until = (iso) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <section className={`announce ${className}`} aria-label={t("ann.label")}>
      {list.map((a) => {
        const photos = (a.photos ?? []).map((p) => mediaUrl(p.file));
        return (
          <article
            key={a.id}
            className={`announce__card${photos.length ? "" : " announce__card--text"}`}
          >
            {/* One photo as is; several cross-fade one after another. */}
            {photos.length > 0 && (
              <div className="announce__photo">
                {photos.length === 1 ? (
                  <img src={photos[0]} alt="" loading="lazy" />
                ) : (
                  <PhotoSlides photos={photos} />
                )}
              </div>
            )}
            <div className="announce__text">
              <p className="announce__eyebrow">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
                  <path d="M16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
                </svg>
                {a.audience === "booked" ? t("ann.forGuests") : t("ann.label")}
              </p>
              <h2>{pick(a.title, a.title_th)}</h2>
              {pick(a.body, a.body_th) && (
                <p className="announce__body">{pick(a.body, a.body_th)}</p>
              )}
              {a.ends_at && (
                <p className="announce__until">
                  {t("ann.until", { date: until(a.ends_at) })}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
