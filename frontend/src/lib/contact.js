import { useEffect, useState } from 'react';
import { api } from './api';
import { FACEBOOK_URL, MAPS_URL, PHONES } from './site';

// The contact details the owner edits in admin (/api/settings/contact):
// phone lines, LINE, Facebook and Google Maps. Loaded once per visit and
// shared by every component that shows them; until it arrives (or if the
// request fails) the details in lib/site.js are shown.

// A Thai phone number written the way Thai numbers are, worked out from
// its first digits as the owner types:
// - mobile 06/08/09: 10 digits, 0xx-xxx-xxxx
// - Bangkok landline 02: 9 digits, 02-xxx-xxxx
// - other landlines (03, 04, 05, 07): 9 digits, 0xx-xxx-xxx
// +66 becomes 0; digits past the number's length are dropped.
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

// "089-202-9053" -> "+66892029053" for tel: links.
export function telOf(number) {
  const digits = String(number).replace(/\D/g, '');
  return digits.startsWith('0') ? `+66${digits.slice(1)}` : `+${digits}`;
}

// A LINE ID -> its "add friend" link (official accounts start with @).
export const lineUrl = (id) => `https://line.me/R/ti/p/${encodeURIComponent(id.startsWith('@') ? id : `~${id}`)}`;

// Server shape -> what the pages use: phones as { name: {th, en}, display, tel }.
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

// After the owner saves in admin: show the new details without a reload.
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
