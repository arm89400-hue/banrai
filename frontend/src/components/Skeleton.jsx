import './Skeleton.css';

// Grey placeholder blocks shown only while real data is loading. They take the
// same space as what will replace them, so nothing jumps when it arrives.

export function Sk({ w, h = '1em', r, className = '', style }) {
  return (
    <span
      className={`sk ${className}`}
      style={{ width: w, height: h, borderRadius: r, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkText({ lines = 2, last = '60%', size = '1em', gap = '0.55em' }) {
  return (
    <span className="sk-text" style={{ gap }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Sk key={i} h={size} w={i === lines - 1 && lines > 1 ? last : '100%'} />
      ))}
    </span>
  );
}

// Wraps skeletons so screen readers hear "loading" once instead of nothing.
export function Loading({ label, className = '', children, as: Tag = 'div' }) {
  return (
    <Tag className={`sk-wrap ${className}`} role="status" aria-busy="true">
      <span className="sk-sr">{label}</span>
      {children}
    </Tag>
  );
}
