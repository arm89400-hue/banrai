import { useEffect, useState } from 'react';
import './PhotoSlides.css';

const SLIDE_MS = 6000;

export default function PhotoSlides({ photos }) {
  const [step, setStep] = useState(0);
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
