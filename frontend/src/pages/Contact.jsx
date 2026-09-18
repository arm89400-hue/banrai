import { useState } from 'react';
import { api } from '../lib/api';

// Public contact form that posts a message to the backend for the property
// owner to follow up on.
export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle');

  // Submits the form, tracking idle/sending/sent/error state for feedback.
  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    try {
      await api('/api/contact', { method: 'POST', body: JSON.stringify(form) });
      setStatus('sent');
      setForm({ name: '', email: '', message: '' });
    } catch {
      setStatus('error');
    }
  }

  return (
    <section className="page">
      <h1>Contact</h1>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <textarea
          placeholder="Message"
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          required
        />
        <button type="submit" disabled={status === 'sending'}>
          Send
        </button>
        {status === 'sent' && <p>Message sent.</p>}
        {status === 'error' && <p role="alert">Something went wrong.</p>}
      </form>
    </section>
  );
}
