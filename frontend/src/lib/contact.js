import { useEffect, useState } from 'react';
import { api } from './api';
import { FACEBOOK_URL, MAPS_URL, PHONES } from './site';

export function formatThaiPhone(value) {
  let d = String(value ?? '').replace(/\D/g, '');
  if (d.startsWith('66')) d = '0' + d.slice(2);
  let sizes = [3, 3, 4];
  if (d.startsWith('02')) sizes = [2, 3, 4];
  else if (/^0[3457]/.test(d)) sizes = [3, 3, 3];
  const parts = [];
  let at = 0;
  for (const n of sizes) {
    if (at >= d.length) break;
    parts.push(d.slice(at, at + n));
    at += n;
  }
  return parts.join('-');
}

export function telOf(number) {
  const digits = String(number).replace(/\D/g, '');
  return digits.startsWith('0') ? `+66${digits.slice(1)}` : `+${digits}`;
}

export const lineUrl = (id) => `https://line.me/R/ti/p/${encodeURIComponent(id.startsWith('@') ? id : `~${id}`)}`;

function shape(contact) {
  return {
    phones: contact.phones.map((p) => ({ name: { th: p.name_th, en: p.name_en }, display: p.number, tel: telOf(p.number) })),
    line: contact.line || '',
    facebook: contact.facebook || '',
    maps: contact.maps || '',
  };
}

const FALLBACK = { phones: PHONES, line: '', facebook: FACEBOOK_URL, maps: MAPS_URL };

let current = FALLBACK;
let loading = null;
const listeners = new Set();

function publish(contact) {
  current = shape(contact);
  listeners.forEach((fn) => fn(current));
}

export const setContact = publish;

export function useContact() {
  const [contact, setLocal] = useState(current);
  useEffect(() => {
    listeners.add(setLocal);
    loading ??= api('/api/settings/contact')
      .then((data) => data.contact && publish(data.contact))
      .catch(() => {});
    return () => listeners.delete(setLocal);
  }, []);
  return contact;
}
