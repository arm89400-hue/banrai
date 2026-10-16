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
