import QRCode from 'qrcode';
import { formatBaht } from './money';
import { nightsBetween, roomNames } from './booking';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from './site';
import { payCode } from './payments';
import { fruitsIn } from './seasons';

// The confirmation guests keep on their phone. It reads like a note from the
// farm, not a form: the real sign on the bamboo fence says who it is from, a
// line to the guest says when we meet, the facts sit underneath like a
// printed slip, and the bottom says what to do if they get lost.

const W = 1080;
const PAD = 84;
const INK = '#1f2b22';
const MUTED = '#6b645c';
const LINE = '#ddd6ca';
const PAPER = '#faf8f3';
const GREEN = '#2d6248';
const SIGN_SRC = '/images/farm/sign.jpg';

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Shrink a line until it fits.
function fit(c, text, weight, size, family, maxW, min = 22) {
  let s = size;
  c.font = `${weight} ${s}px ${family}`;
  while (s > min && c.measureText(text).width > maxW) {
    s -= 2;
    c.font = `${weight} ${s}px ${family}`;
  }
}

// Thai has no spaces between words, so break lines on word boundaries.
function wrap(c, text, maxW, lang) {
  const Seg = Intl.Segmenter;
  const raw = Seg
    ? [...new Seg(lang === 'th' ? 'th' : 'en', { granularity: 'word' }).segment(text)].map((x) => x.segment)
    : text.split(/(\s+)/);
  // Keep "14:00 น." and "12:00" in one piece: glue no-break spaces and
  // punctuation to their neighbours.
  const parts = [];
  for (const p of raw) {
    const last = parts.at(-1);
    if (last != null && (p.startsWith('\u00a0') || last.endsWith('\u00a0') || /^[.,:)]/.test(p) || /[:(]$/.test(last))) {
      parts[parts.length - 1] = last + p;
    } else {
      parts.push(p);
    }
  }
  const lines = [];
  let line = '';
  for (const part of parts) {
    const next = line + part;
    if (line && c.measureText(next.trimEnd()).width > maxW) {
      lines.push(line.trimEnd());
      line = part.trimStart();
    } else {
      line = next;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

const day = (iso, locale, opts) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, opts);

function listOf(items, lang, and) {
  if (items.length < 2) return items.join('');
  if (lang === 'th') return `${items.slice(0, -1).join(' ')}${and}${items.at(-1)}`;
  return `${items.slice(0, -1).join(', ')}${and}${items.at(-1)}`;
}

// Everything the note says, worked out from the stay (see groupStays).
export function confirmationData({ stay, t, lang, locale, contact }) {
  const live = stay.bookings.filter((b) => b.status !== 'cancelled');
  const lead = stay.lead;
  const total = Number(stay.total) || 0;
  const deposit = Number(stay.deposit) || 0;
  const balanceDone = live.every((b) => b.balance_paid_at || Number(b.total) <= Number(b.deposit));
  const paid = stay.status === 'confirmed' ? (balanceDone ? total : deposit) : 0;
  const pets = live.reduce((n, b) => n + (Number(b.pets) || 0), 0);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const long = { day: 'numeric', month: 'long' };
  const fruitNames = t('fruits');
  const fruits = fruitsIn(Number(stay.checkIn.slice(5, 7)))
    .slice(0, 4)
    .map((f) => (lang === 'th' ? fruitNames[f.id] : fruitNames[f.id].toLowerCase()));
  return {
    lang,
    code: payCode(lead),
    codeLabel: t('conf.code'),
    confirmed: t('conf.confirmed'),
    farm: t('conf.farm'),
    dear: lead.guest_name ? t('conf.dear', { name: lead.guest_name }) : '',
    see: t('conf.see', {
      weekday: day(stay.checkIn, locale, { weekday: 'long' }),
      date: day(stay.checkIn, locale, { ...long, year: 'numeric' }),
    }),
    times: t('conf.times', {
      in: CHECK_IN_TIME,
      out: CHECK_OUT_TIME,
      weekday: day(stay.checkOut, locale, { weekday: 'long' }),
      date: day(stay.checkOut, locale, long),
    }),
    facts: [
      [t('review.room'), live.map((b) => roomNames(b.room_name, lang).title).join(', ')],
      [
        t('conf.guest'),
        [t('sum.guestCount', { n: stay.guests }), t('pay.dlgNights', { n: nights }), pets > 0 && t('price.petSaved', { n: pets })]
          .filter(Boolean)
          .join(', '),
      ],
      paid < total ? [t('conf.paid'), formatBaht(paid)] : [t('conf.total'), formatBaht(total)],
      paid < total ? [t('conf.left'), formatBaht(total - paid), null, true] : [t('conf.paid'), t('conf.paidAll'), null, true],
    ],
    breakfast: t('conf.breakfast'),
    fruitLine: fruits.length ? t('conf.fruitLine', { list: listOf(fruits, lang, t('conf.and')) }) : '',
    lost: t('conf.lost'),
    phones: contact.phones.map((p) => [p.name[lang], p.display]),
    maps: contact.maps,
    mapsLabel: t('conf.maps'),
    foot: `${t('conf.farm')} · ${t('conf.address')}`,
  };
}

export async function drawConfirmation(d) {
  const family = getComputedStyle(document.body).fontFamily;
  await Promise.all(
    ['400', '600', '700'].map((w) => document.fonts?.load(`${w} 32px ${family}`, d.see + d.code).catch(() => {})),
  );
  const [sign, qr] = await Promise.all([
    loadImage(SIGN_SRC),
    d.maps
      ? QRCode.toDataURL(d.maps, { margin: 0, width: 220, errorCorrectionLevel: 'M', color: { dark: INK, light: PAPER } })
          .then(loadImage)
          .catch(() => null)
      : null,
  ]);

  const sheet = document.createElement('canvas');
  sheet.width = W;
  sheet.height = 3000;
  const c = sheet.getContext('2d');
  const CW = W - PAD * 2;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, sheet.height);

  // The sign on the bamboo fence, cropped to the letters and the 344.
  let y = 0;
  if (sign) {
    const PH = 680;
    const sx = 240;
    const sw = sign.width - sx - 20;
    const sh = (sw * PH) / W;
    const sy = Math.max(0, 1120 - sh);
    c.drawImage(sign, sx, sy, sw, sh, 0, 0, W, PH);
    y = PH;
  } else {
    c.fillStyle = INK;
    c.font = `700 52px ${family}`;
    c.fillText(d.farm, PAD, 120);
    y = 160;
  }

  // To the guest
  y += 104;
  if (d.dear) {
    c.fillStyle = MUTED;
    fit(c, d.dear, 400, 34, family, CW);
    c.fillText(d.dear, PAD, y);
    y += 76;
  }
  c.fillStyle = INK;
  c.font = `700 58px ${family}`;
  for (const line of wrap(c, d.see, CW, d.lang)) {
    c.fillText(line, PAD, y);
    y += 74;
  }
  y += 4;
  c.fillStyle = INK;
  c.font = `400 32px ${family}`;
  for (const line of wrap(c, d.times, CW, d.lang)) {
    c.fillText(line, PAD, y);
    y += 48;
  }
  c.fillStyle = MUTED;
  c.font = `400 30px ${family}`;
  for (const line of wrap(c, d.breakfast, CW, d.lang)) {
    c.fillText(line, PAD, y);
    y += 46;
  }

  // The code they give at the gate, then the facts two to a row
  y += 34;
  c.fillStyle = INK;
  c.fillRect(PAD, y, CW, 3);
  y += 56;
  c.fillStyle = MUTED;
  c.font = `400 26px ${family}`;
  c.fillText(d.codeLabel, PAD, y);
  c.textAlign = 'right';
  c.fillStyle = GREEN;
  c.font = `600 28px ${family}`;
  c.fillText(`✓ ${d.confirmed}`, PAD + CW, y);
  c.textAlign = 'left';
  y += 82;
  c.fillStyle = INK;
  fit(c, d.code, 700, 76, family, CW, 40);
  if ('letterSpacing' in c) c.letterSpacing = '3px';
  c.fillText(d.code, PAD - 2, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  y += 36;
  c.fillStyle = LINE;
  c.fillRect(PAD, y, CW, 2);
  const colW = (CW - 48) / 2;
  const facts = d.facts;
  for (let i = 0; i < facts.length; i += 2) {
    const rowY = y + 30;
    let rowH = 0;
    [facts[i], facts[i + 1]].forEach((f, k) => {
      if (!f) return;
      const [label, value, note, strong] = f;
      const x = PAD + k * (colW + 48);
      c.fillStyle = MUTED;
      fit(c, label, 400, 26, family, colW);
      c.fillText(label, x, rowY + 26);
      c.fillStyle = strong ? GREEN : INK;
      fit(c, value, 700, 34, family, colW, 22);
      c.fillText(value, x, rowY + 76);
      let h = 92;
      if (note) {
        c.fillStyle = GREEN;
        c.font = `600 26px ${family}`;
        c.fillText(`✓ ${note}`, x, rowY + h + 22);
        h += 34;
      }
      rowH = Math.max(rowH, h);
    });
    y = rowY + rowH + 20;
    c.fillStyle = LINE;
    c.fillRect(PAD, y, CW, 2);
  }

  // If they get lost
  y += 56;
  const blockY = y;
  const qrSize = 196;
  const textW = qr ? CW - qrSize - 48 : CW;
  c.fillStyle = INK;
  c.font = `600 32px ${family}`;
  let ty = blockY + 30;
  for (const line of wrap(c, d.lost, textW, d.lang)) {
    c.fillText(line, PAD, ty);
    ty += 46;
  }
  ty += 6;
  for (const [name, num] of d.phones) {
    c.fillStyle = MUTED;
    c.font = `400 30px ${family}`;
    c.fillText(name, PAD, ty);
    const nw = Math.max(110, c.measureText(name).width + 24);
    c.fillStyle = INK;
    c.font = `600 32px ${family}`;
    c.fillText(num, PAD + nw, ty);
    ty += 50;
  }
  if (qr) {
    const qx = PAD + CW - qrSize;
    c.drawImage(qr, qx, blockY, qrSize, qrSize);
    c.fillStyle = MUTED;
    c.font = `400 24px ${family}`;
    c.textAlign = 'center';
    c.fillText(d.mapsLabel, qx + qrSize / 2, blockY + qrSize + 38);
    c.textAlign = 'left';
  }
  y = Math.max(ty - 10, qr ? blockY + qrSize + 46 : 0);

  if (d.fruitLine) {
    y += 52;
    c.fillStyle = INK;
    c.font = `400 30px ${family}`;
    for (const line of wrap(c, d.fruitLine, CW, d.lang)) {
      c.fillText(line, PAD, y);
      y += 46;
    }
    y -= 46;
  }

  // Who it is from
  y += 84;
  c.fillStyle = LINE;
  c.fillRect(PAD, y, CW, 2);
  y += 52;
  c.fillStyle = MUTED;
  fit(c, d.foot, 400, 24, family, CW);
  c.fillText(d.foot, PAD, y);
  const H = y + 64;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.getContext('2d').drawImage(sheet, 0, 0);
  return canvas;
}

// A picture URL for showing the ticket on the page before saving it.
export async function confirmationURL(data) {
  const canvas = await drawConfirmation(data);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
}

// On a phone, hand the picture to the share sheet ("Save image" puts it in
// Photos); elsewhere, download it.
export async function saveConfirmation(data) {
  const canvas = await drawConfirmation(data);
  const name = `baanrai-${data.code}.png`;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const file = new File([blob], name, { type: 'image/png' });
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: data.farm });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
