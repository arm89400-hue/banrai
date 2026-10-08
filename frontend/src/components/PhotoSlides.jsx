import { useEffect, useState } from 'react';
import './PhotoSlides.css';

const SLIDE_MS = 6000;

// Decorative full-bleed slideshow: loops through `photos` (image URLs), one
// cross-fade every SLIDE_MS. A photo is only requested just before it is
// shown, so the page doesn't download all of them up front. With reduced
// motion it stays on the first photo. Fills its nearest positioned parent.
export default function PhotoSlides({ photos }) {
  const [step, setStep] = useState(0); // counts up forever; slide = step % length
  const active = step % photos.length;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setStep((s) => s + 1), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="photo-slides" aria-hidden="true">
      {photos.map((src, i) => (
        <div
          key={src}
          className={`photo-slides__slide${i === active ? ' is-active' : ''}`}
          style={i <= step + 1 ? { backgroundImage: `url(${src})` } : undefined}
        />
      ))}
    </div>
  );
}
