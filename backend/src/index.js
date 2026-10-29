import 'dotenv/config';
import { app } from './app.js';

// Database changes are applied by the migrate step (npm run migrate, or the
// migrator container) before the app starts.
const port = process.env.PORT || 4000;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => console.log(`API listening on http://${host}:${port}`));
