import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const API_KEY = process.env.MOCK_API_KEY ?? 'test-key';

const ERRORS = {
  1000: 'Missing QR data',
  1001: 'Branch not found',
  1002: 'Invalid authorization header',
  1003: 'Package expired',
  1004: 'Quota exceeded',
  1005: 'Not an image file',
  1006: 'Invalid image',
  1007: 'No QR code in image',
  1008: 'Not a payment QR code',
  1009: 'Bank data temporarily unavailable',
  1010: 'Please wait before checking this bank slip',
  1011: 'QR code expired or transaction not found',
  1012: 'Duplicate slip',
  1013: 'Amount does not match',
  1014: 'Receiver account does not match',
};

const queue = [];
let calls = 0;
let last = null;

function formFields(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? '');
  if (!boundary) return {};
  const fields = {};
  for (const part of body.toString('latin1').split(`--${boundary[1] ?? boundary[2]}`)) {
    const name = /name="([^"]+)"/.exec(part)?.[1];
    if (!name || /filename=/.test(part)) continue;
    fields[name] = part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
  }
  return fields;
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    if (req.method === 'POST' && req.url === '/__next') {
      queue.push(body.length ? JSON.parse(body.toString()) : {});
      return send(res, 200, { queued: queue.length });
    }
    if (req.method === 'GET' && req.url === '/__calls') return send(res, 200, { calls, last });

    if (req.method !== 'POST' || !req.url.startsWith('/api/line/apikey/')) return send(res, 404, { message: 'Not found' });
    calls++;
    const next = queue.shift() ?? {};
    const code = req.headers['x-authorization'] !== API_KEY ? 1002 : next.code;
    if (code) return send(res, 400, { success: false, code, message: ERRORS[code] ?? 'Error' });

    const fields = formFields(body, req.headers['content-type']);
    last = fields;
    const amount = next.amount ?? Number(fields.amount);
    const now = new Date();
    send(res, 200, {
      success: true,
      data: {
        success: true,
        message: '✅',
        language: 'TH',
        receivingBank: '014',
        sendingBank: '004',
        transRef: next.transRef ?? `MOCK${randomBytes(6).toString('hex').toUpperCase()}`,
        transDate: now.toISOString().slice(0, 10).replaceAll('-', ''),
        transTime: now.toISOString().slice(11, 19),
        transTimestamp: now.toISOString(),
        sender: { displayName: 'นาย ทดสอบ ร', name: 'MR. TEST R', account: { type: 'BANKAC', value: 'xxx-x-x1234-x' } },
        receiver: { displayName: 'บ้านไร่ของพ่อ', name: 'BAANRAI', account: { type: 'BANKAC', value: 'xxx-x-x5678-x' } },
        amount,
        paidLocalAmount: amount,
        paidLocalCurrency: '764',
        countryCode: 'TH',
        transFeeAmount: '0',
        ref1: '',
        ref2: '',
        ref3: '',
        toMerchantId: '',
      },
    });
  });
}).listen(PORT, () => console.log(`pretend SlipOK on :${PORT}`));
