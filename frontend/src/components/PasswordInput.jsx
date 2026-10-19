import { useState } from 'react';
import './PasswordInput.css';

export default function PasswordInput({ label = 'Hold to show password', ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const hide = () => setVisible(false);

  return (
    <span className="password-input">
      <input {...inputProps} className="password-input__field" type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-input__eye"
        aria-label={label}
        title={label}
        aria-pressed={visible}
        onPointerDown={(e) => {
          e.preventDefault();
          setVisible(true);
        }}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            setVisible(true);
          }
        }}
        onKeyUp={hide}
        onBlur={hide}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {!visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
