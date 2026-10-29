import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Settings the app reads when its modules load, so they are set before any
// test file imports the app. Outside services (Opn, SlipOK, Google) point at
// fake addresses; tests replace fetch or the Google client with stand-ins.
Object.assign(process.env, {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/baanrai_test',
  JWT_SECRET: 'test-secret',
  ADMIN_EMAILS: 'admin@baanrai.test',
  UPLOAD_DIR: join(tmpdir(), 'baanrai-test-uploads'),
  OPN_SECRET_KEY: 'skey_test_123',
  OPN_API_URL: 'http://opn.test/',
  SLIPOK_API_KEY: 'slipok-key',
  SLIPOK_BRANCH_ID: 'branch-1',
  SLIPOK_API_URL: 'http://slipok.test',
  PROMPTPAY_ID: '081-234-5678',
  PROMPTPAY_NAME: 'Baanrai 344',
  GOOGLE_CLIENT_ID: 'google-client-id',
});
delete process.env.PAYMENT_TEST_MODE;
delete process.env.CORS_ORIGINS;
