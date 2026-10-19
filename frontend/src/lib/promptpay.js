const field = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

function crc16(text) {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function promptPayPayload(id, amount) {
  const digits = String(id).replace(/\D/g, '');
  let account;
  if (digits.length === 10) account = field('01', `0066${digits.slice(1)}`.padStart(13, '0'));
  else if (digits.length === 13) account = field('02', digits);
  else if (digits.length === 15) account = field('03', digits);
  else throw new Error('PromptPay ID must be a phone number, citizen ID or e-wallet ID');

  const body =
    field('00', '01') +
    field('01', '12') +
    field('29', field('00', 'A000000677010111') + account) +
    field('53', '764') +
    field('54', Number(amount).toFixed(2)) +
    field('58', 'TH') +
    '6304';
  return body + crc16(body);
}
