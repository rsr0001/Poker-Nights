import pg from 'pg';
import { OAuth2Client } from 'google-auth-library';
import { createApp } from './app.js';

const clientId = process.env.GOOGLE_CLIENT_ID || '';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
pool.on('error', error => console.error('Database pool error:', error.code));
const google = new OAuth2Client(clientId);
const app = createApp({ pool, clientId, origin: process.env.FRONTEND_ORIGIN || 'https://rsr0001.github.io',
  verifyGoogle: async credential => (await google.verifyIdToken({ idToken: credential, audience: clientId })).getPayload() });
await pool.query('SELECT 1');
const cleanup = async () => {
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  await pool.query('DELETE FROM login_challenges WHERE expires_at < now()');
};
await cleanup();
const timer = setInterval(() => cleanup().catch(() => console.error('Session cleanup failed')), 600000);
timer.unref();
const server = app.listen(Number(process.env.PORT || 5010), '127.0.0.1', () => console.log('Poker Nights API listening on loopback'));
process.on('SIGTERM', () => { clearInterval(timer); server.close(() => pool.end()); });
