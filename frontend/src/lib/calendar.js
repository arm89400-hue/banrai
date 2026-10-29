// "Add to calendar": a small .ics file the phone opens straight into its
// calendar app, from check-in to check-out, with the map link in it.

const pad = (n) => String(n).padStart(2, '0');

// Bangkok is UTC+7 all year, so a local farm time is easy to turn into UTC.
function utcStamp(iso, time) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCHours(h - 7, m, 0, 0);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

const esc = (s) => String(s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

export function addToCalendar({ code, checkIn, checkOut, inTime, outTime, title, details, location }) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Baanrai 344//Booking//TH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${code}@baanrai344`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utcStamp(checkIn, inTime)}`,
    `DTEND:${utcStamp(checkOut, outTime)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(details)}`,
    location ? `LOCATION:${esc(location)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `baanrai-${code}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
